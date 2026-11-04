"""Export the Alpine showroom geometry and selectable textures from Q3Rally."""
import argparse
import json
import math
from pathlib import Path
import struct

from PIL import Image


def name(raw):
    return raw.split(b"\0", 1)[0].decode("ascii").lower()


def md3(path):
    data = path.read_bytes()
    ident, version, _, _, frames, num_tags, num_surfaces, _, _, tag_offset, offset, end = (
        struct.unpack_from("<4si64s9i", data)
    )
    if ident != b"IDP3" or version != 15 or frames < 1 or end != len(data):
        raise ValueError(f"Invalid MD3: {path}")
    tags = {}
    for i in range(num_tags):
        raw, *values = struct.unpack_from("<64s12f", data, tag_offset + i * 112)
        tags[name(raw)] = (values[:3], values[3:])
    surfaces = []
    for _ in range(num_surfaces):
        ident, raw, _, _, _, count, tris, tri_offset, _, uv_offset, vertex_offset, size = (
            struct.unpack_from("<4s64s10i", data, offset)
        )
        if ident != b"IDP3" or size < 108:
            raise ValueError(f"Invalid MD3 surface: {path}")
        uv = [struct.unpack_from("<2f", data, offset + uv_offset + i * 8) for i in range(count)]
        vertices = []
        normals = []
        for i in range(count):
            x, y, z, packed = struct.unpack_from("<3hH", data, offset + vertex_offset + i * 8)
            lat, lng = ((packed >> 8) * math.tau / 255, (packed & 255) * math.tau / 255)
            vertices.append((x / 64, y / 64, z / 64))
            normals.append((math.cos(lat) * math.sin(lng), math.sin(lat) * math.sin(lng), math.cos(lng)))
        indices = struct.unpack_from(f"<{tris * 3}I", data, offset + tri_offset)
        surfaces.append((name(raw), vertices, normals, uv, indices))
        offset += size
    return surfaces, tags


def web_axis(vector):
    x, y, z = vector
    return (x, z, -y)


def export_geometry(body_path, wheel_path, target):
    body, tags = md3(body_path)
    wheel, _ = md3(wheel_path)
    if not {"w_rim", "w_tread"} <= {surface[0] for surface in wheel}:
        raise ValueError("Expected a skinnable Alpine wheel")
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def accessor(rows, fmt, kind, component, bounds=False):
        binary.extend(b"\0" * (-len(binary) % 4))
        offset = len(binary)
        for row in rows:
            binary.extend(struct.pack(fmt, *row))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset})
        value = {"bufferView": len(views) - 1, "componentType": component, "count": len(rows), "type": kind}
        if bounds:
            columns = list(zip(*rows))
            value.update(min=[min(col) for col in columns], max=[max(col) for col in columns])
        accessors.append(value)
        return len(accessors) - 1

    def add_surface(surface, tag=None):
        label, vertices, normals, uv, indices = surface
        if tag:
            origin, axis = tag
            def transform(vector, translation):
                return tuple(sum(vector[j] * axis[j * 3 + i] for j in range(3)) + translation[i] for i in range(3))
            vertices = [transform(v, origin) for v in vertices]
            normals = [transform(v, (0, 0, 0)) for v in normals]
        positions = accessor([web_axis(v) for v in vertices], "<3f", "VEC3", 5126, True)
        normal_data = accessor([web_axis(v) for v in normals], "<3f", "VEC3", 5126)
        texture = accessor(uv, "<2f", "VEC2", 5126)
        # Quake models use clockwise winding; glTF uses counterclockwise winding.
        indices = [(indices[i], indices[i + 2], indices[i + 1]) for i in range(0, len(indices), 3)]
        triangles = accessor([(i,) for triangle in indices for i in triangle], "<H", "SCALAR", 5123)
        meshes.append({"primitives": [{"attributes": {"POSITION": positions, "NORMAL": normal_data,
                       "TEXCOORD_0": texture}, "indices": triangles}]})
        nodes.append({"name": f"{label}_{len(nodes)}", "mesh": len(meshes) - 1, "extras": {"surface": label}})

    for surface in body:
        add_surface(surface)
    for tag_name in ("tag_wheelfl", "tag_wheelfr", "tag_wheelrl", "tag_wheelrr"):
        for surface in wheel:
            add_surface(surface, tags[tag_name])

    document = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}],
                "nodes": nodes, "meshes": meshes, "accessors": accessors, "bufferViews": views,
                "buffers": [{"byteLength": len(binary)}]}
    description = json.dumps(document, separators=(",", ":")).encode()
    description += b" " * (-len(description) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    with target.open("wb") as output:
        output.write(struct.pack("<4sII", b"glTF", 2, 28 + len(description) + len(binary)))
        output.write(struct.pack("<I4s", len(description), b"JSON") + description)
        output.write(struct.pack("<I4s", len(binary), b"BIN\0") + binary)
    return {surface[0] for surface in body}, {surface[0] for surface in wheel}


def export_textures(game, target, skins, keys, surfaces):
    result = {}
    for key in keys:
        selected = {}
        for line in (skins / f"{key}.skin").read_text(encoding="latin-1").splitlines():
            surface, _, texture = line.partition(",")
            surface, texture = surface.strip().lower(), texture.strip().lower()
            if surface not in surfaces or not texture:
                continue
            source = game / texture
            if not source.exists():
                source = next((source.with_suffix(ext) for ext in (".tga", ".png", ".jpg") if source.with_suffix(ext).exists()), source)
            if not source.exists():
                continue
            filename = "-".join(source.relative_to(game / "models" / "players").with_suffix("").parts) + ".webp"
            if not (target / filename).exists():
                with Image.open(source) as image:
                    rgba = image.convert("RGBA")
                    rgba.thumbnail((512, 512))
                    rgba.save(target / filename, quality=85, method=6)
            selected[surface] = filename
        result[key] = selected
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_assets", type=Path, help="Path to the game's baseq3r directory")
    args = parser.parse_args()
    site = Path(__file__).resolve().parents[1]
    catalog = json.loads((site / "src/data/garageCatalog.json").read_text(encoding="utf-8"))
    game = args.game_assets
    alpine = game / "models/players/alpine"
    wheels = game / "models/players/wheels"
    target = site / "public/garage/alpine-3d"
    target.mkdir(parents=True, exist_ok=True)
    body_names, wheel_names = export_geometry(alpine / "body.md3", alpine / "wheel.md3", target / "alpine.glb")
    paints = export_textures(game, target, alpine, catalog["vehicles"]["alpine"]["paints"], body_names)
    rims = export_textures(game, target, wheels, catalog["wheels"], wheel_names)
    if any("b_main" not in paint for paint in paints.values()) or any("w_rim" not in rim for rim in rims.values()):
        raise ValueError("Missing required Alpine paint or wheel texture")
    (target / "materials.json").write_text(json.dumps({"paints": paints, "wheels": rims}, separators=(",", ":")), encoding="utf-8")
    print(f"Exported Alpine geometry, {len(paints)} paints and {len(rims)} wheels.")


if __name__ == "__main__":
    main()
