import {
  AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, RepeatWrapping, Scene, Sphere, SRGBColorSpace,
  Texture, TextureLoader, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type Materials = {
  paints: Record<string, Record<string, string>>;
  wheels: Record<string, Record<string, string>>;
};

export async function openAlpineShowroom(container: HTMLElement, base: string) {
  const [model, response] = await Promise.all([
    new GLTFLoader().loadAsync(base + 'alpine.glb'),
    fetch(base + 'materials.json'),
  ]);
  if (!response.ok) throw new Error('Showroom materials unavailable');
  const variants: Materials = await response.json();

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', 'Rotatable 3D Alpine');
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
    const maps = { ...variants.paints[paint], ...variants.wheels[wheels] };
    if (!maps.b_main || !maps.w_rim) throw new Error('Unsupported Alpine setup');
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
      if (current === generation) throw new Error('Could not load Alpine textures');
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
  new ResizeObserver(resize).observe(container);
  controls.addEventListener('change', render);

  return {
    update,
    show() { visible = true; resize(); },
    hide() { visible = false; generation++; },
    reset() { controls.reset(); },
  };
}
