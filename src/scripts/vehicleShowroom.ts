import {
  AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, RepeatWrapping, Scene, Sphere, SRGBColorSpace,
  Texture, TextureLoader, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type Materials = {
  vehicles: Record<string, Record<string, Record<string, string>>>;
  wheels: Record<string, Record<string, string>>;
};

let materials: Promise<Materials> | undefined;

function loadMaterials(base: string) {
  materials ??= fetch(base + 'materials.json').then(response => {
    if (!response.ok) throw new Error('Showroom materials unavailable');
    return response.json() as Promise<Materials>;
  }).catch(error => {
    materials = undefined;
    throw error;
  });
  return materials;
}

export async function openVehicleShowroom(container: HTMLElement, base: string, vehicle: string, label: string) {
  const [model, variants] = await Promise.all([
    new GLTFLoader().loadAsync(base + vehicle + '.glb'),
    loadMaterials(base),
  ]);
  const paints = variants.vehicles[vehicle];

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'Rotatable 3D ' + label);
  const scene = new Scene();
  const bounds = new Box3().setFromObject(model.scene).getBoundingSphere(new Sphere());
  const camera = new PerspectiveCamera(36, 1, bounds.radius / 20, bounds.radius * 20);
  camera.position.copy(bounds.center);
  camera.position.x += bounds.radius * 2.9;
  camera.position.y += bounds.radius * 1.05;
  camera.position.z += bounds.radius * 2.2;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(bounds.center);
  controls.minDistance = bounds.radius * 2.1;
  controls.maxDistance = bounds.radius * 7;
  controls.minPolarAngle = Math.PI / 8;
  controls.maxPolarAngle = Math.PI / 1.8;
  controls.enablePan = false;
  controls.update();
  controls.saveState();

  const key = new DirectionalLight(0xfff2e5, 2.2);
  key.position.set(4, 6, 3);
  const fill = new DirectionalLight(0xdde8ff, 1.1);
  fill.position.set(-4, 3, -5);
  scene.add(model.scene, key, fill, new AmbientLight(0xffffff, 1.35));

  const surfaces: { name: string; material: MeshStandardMaterial }[] = [];
  const originals = new Set<MeshStandardMaterial>();
  model.scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const name: string = node.userData.surface;
    originals.add(node.material);
    const material = new MeshStandardMaterial({ color: 0x3a3a3a, roughness: .78 });
    node.material = material;
    surfaces.push({ name, material });
  });
  for (const material of originals) material.dispose();

  let textures = new Map<string, Texture>();
  let generation = 0;
  let visible = false;
  const loader = new TextureLoader();

  function render() {
    if (visible) renderer.render(scene, camera);
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  async function update(paint: string, wheels: string) {
    const current = ++generation;
    const maps = { ...paints?.[paint], ...variants.wheels[wheels] };
    if (!paints?.[paint] || !maps.w_rim) throw new Error('Unsupported showroom setup');
    const next = new Map<string, Texture>();
    const loaded = await Promise.allSettled([...new Set(Object.values(maps))].map(async filename => {
      const texture = await loader.loadAsync(base + filename);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      next.set(filename, texture);
    }));
    if (current !== generation || loaded.some(result => result.status === 'rejected')) {
      for (const texture of next.values()) texture.dispose();
      if (current === generation) throw new Error('Could not load showroom textures');
      return;
    }
    for (const { name, material } of surfaces) {
      material.map = next.get(maps[name]) ?? null;
      material.color = new Color(material.map ? 0xffffff : 0x3a3a3a);
      material.needsUpdate = true;
    }
    for (const texture of textures.values()) texture.dispose();
    textures = next;
    render();
  }

  container.append(renderer.domElement);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  controls.addEventListener('change', render);

  return {
    update,
    show() { visible = true; resize(); },
    hide() { visible = false; generation++; },
    reset() { controls.reset(); },
    dispose() {
      visible = false;
      generation++;
      observer.disconnect();
      controls.dispose();
      for (const texture of textures.values()) texture.dispose();
      for (const { material } of surfaces) material.dispose();
      model.scene.traverse(node => { if (node instanceof Mesh) node.geometry.dispose(); });
      renderer.domElement.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
