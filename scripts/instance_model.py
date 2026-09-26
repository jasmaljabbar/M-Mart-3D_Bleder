"""Batch repeated sibling meshes without losing multi-material primitives."""
from collections import defaultdict
from pathlib import Path
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'models/supermarket.raw.glb'
target = ROOT / 'models/supermarket.glb'
raw = source.read_bytes()
magic, version, length = struct.unpack_from('<4sII', raw)
assert magic == b'glTF' and version == 2 and length == len(raw)
json_length, json_type = struct.unpack_from('<II', raw, 12)
assert json_type == 0x4E4F534A
document = json.loads(raw[20:20 + json_length])
binary_length, binary_type = struct.unpack_from('<II', raw, 20 + json_length)
assert binary_type == 0x004E4942
binary = bytearray(raw[28 + json_length:28 + json_length + binary_length])
assert not document.get('skins') and not document.get('animations')
nodes = document['nodes']

def append_attribute(values, kind):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    flat = [component for value in values for component in value]
    binary.extend(struct.pack('<' + 'f' * len(flat), *flat))
    view = len(document['bufferViews'])
    document['bufferViews'].append({'buffer': 0, 'byteOffset': offset,
                                   'byteLength': len(flat) * 4})
    accessor = len(document['accessors'])
    document['accessors'].append({'bufferView': view, 'componentType': 5126,
                                  'count': len(values), 'type': kind})
    return accessor

group_count = instance_count = 0
containers = [node['children'] for node in nodes if node.get('children')]
containers += [scene['nodes'] for scene in document['scenes']]
for children in containers:
    groups = defaultdict(list)
    for index in children:
        node = nodes[index]
        if 'mesh' in node and not any(key in node for key in
                                     ('children', 'skin', 'weights', 'extensions', 'matrix')):
            groups[node['mesh']].append(index)
    removed = set()
    for mesh, indices in groups.items():
        if len(indices) < 2:
            continue
        attributes = {}
        for name, field, default, kind in (
            ('TRANSLATION', 'translation', [0, 0, 0], 'VEC3'),
            ('ROTATION', 'rotation', [0, 0, 0, 1], 'VEC4'),
            ('SCALE', 'scale', [1, 1, 1], 'VEC3'),
        ):
            attributes[name] = append_attribute([nodes[i].get(field, default) for i in indices], kind)
        nodes[indices[0]] = {'name': nodes[indices[0]].get('name', 'Mesh') + ' instances',
                             'mesh': mesh, 'extensions': {
                                 'EXT_mesh_gpu_instancing': {'attributes': attributes}}}
        removed.update(indices[1:])
        group_count += 1
        instance_count += len(indices)
    children[:] = [index for index in children if index not in removed]

reachable = set()
def visit(index):
    if index in reachable:
        return
    reachable.add(index)
    for child in nodes[index].get('children', []):
        visit(child)
for scene in document['scenes']:
    for index in scene['nodes']:
        visit(index)
mapping = {old: new for new, old in enumerate(sorted(reachable))}
document['nodes'] = [nodes[i] for i in sorted(reachable)]
for node in document['nodes']:
    if 'children' in node:
        node['children'] = [mapping[i] for i in node['children']]
for scene in document['scenes']:
    scene['nodes'] = [mapping[i] for i in scene['nodes']]
for field in ('extensionsUsed', 'extensionsRequired'):
    document.setdefault(field, []).append('EXT_mesh_gpu_instancing')
document['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(document, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary += b'\0' * (-len(binary) % 4)
total = 12 + 8 + len(encoded) + 8 + len(binary)
target.write_bytes(struct.pack('<4sII', b'glTF', 2, total)
                   + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
                   + struct.pack('<II', len(binary), 0x004E4942) + binary)
print(json.dumps({'file': str(target), 'size_mb': round(total / 1e6, 2),
                  'nodes': len(document['nodes']), 'instance_groups': group_count,
                  'batched_instances': instance_count}, indent=2))
