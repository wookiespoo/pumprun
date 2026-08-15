import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const file = process.argv[2];
const doc = await io.read(file);
const scene = doc.getRoot().getDefaultScene();
const b = getBounds(scene);
console.log('size', (b.max[0]-b.min[0]).toFixed(3), (b.max[1]-b.min[1]).toFixed(3), (b.max[2]-b.min[2]).toFixed(3));
console.log('min', b.min.map((v)=>v.toFixed(3)).join(', '), 'max', b.max.map((v)=>v.toFixed(3)).join(', '));
console.log('meshes', doc.getRoot().listMeshes().length, 'nodes', doc.getRoot().listNodes().length);
for (const m of doc.getRoot().listMaterials()) {
  console.log('mat', m.getName(), 'base', m.getBaseColorFactor(), 'em', m.getEmissiveFactor(), 'alpha', m.getAlphaMode(), m.getAlphaCutoff());
}
for (const n of doc.getRoot().listNodes()) {
  console.log('node', n.getName(), 't', n.getTranslation(), 'r', n.getRotation(), 's', n.getScale(), 'mesh', !!n.getMesh());
}
