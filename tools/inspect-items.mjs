import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:\\Users\\pj382\\OneDrive\\Desktop\\items';
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

function tris(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      if (idx) n += idx.getCount() / 3;
      else n += (prim.getAttribute('POSITION')?.getCount() || 0) / 3;
    }
  }
  return Math.round(n);
}

function sampleEnds(doc) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        const z = arr[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const acc = {
    minX: [0, 0],
    maxX: [0, 0],
    minZ: [0, 0],
    maxZ: [0, 0],
  };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        const y = arr[i + 1];
        const z = arr[i + 2];
        if (x <= minX + spanX * 0.12) {
          acc.minX[0] += y;
          acc.minX[1] += 1;
        }
        if (x >= maxX - spanX * 0.12) {
          acc.maxX[0] += y;
          acc.maxX[1] += 1;
        }
        if (z <= minZ + spanZ * 0.12) {
          acc.minZ[0] += y;
          acc.minZ[1] += 1;
        }
        if (z >= maxZ - spanZ * 0.12) {
          acc.maxZ[0] += y;
          acc.maxZ[1] += 1;
        }
      }
    }
  }
  const avg = (p) => (p[1] ? p[0] / p[1] : 0);
  return {
    yAtMinX: avg(acc.minX),
    yAtMaxX: avg(acc.maxX),
    yAtMinZ: avg(acc.minZ),
    yAtMaxZ: avg(acc.maxZ),
  };
}

for (const name of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb'))) {
  const file = path.join(DIR, name);
  const st = fs.statSync(file);
  console.log('\n===', name, (st.size / 1024 / 1024).toFixed(2), 'MB');
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const box = getBounds(scene);
  const size = [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ];
  const ends = sampleEnds(doc);
  const tex = doc.getRoot().listTextures().map((t) => {
    const s = t.getSize();
    return `${s ? s.join('x') : '?'} ${t.getMimeType()} ${((t.getImage()?.byteLength || 0) / 1024).toFixed(0)}KB`;
  });
  console.log('  tris', tris(doc), 'meshes', doc.getRoot().listMeshes().length, 'mats', doc.getRoot().listMaterials().length);
  console.log('  AABB size', size.map((v) => v.toFixed(3)).join(' x '));
  console.log('  AABB min', box.min.map((v) => v.toFixed(3)).join(', '), 'max', box.max.map((v) => v.toFixed(3)).join(', '));
  console.log('  y@minX', ends.yAtMinX.toFixed(3), 'y@maxX', ends.yAtMaxX.toFixed(3), 'y@minZ', ends.yAtMinZ.toFixed(3), 'y@maxZ', ends.yAtMaxZ.toFixed(3));
  console.log('  tex', tex.join(' | ') || 'none');
}
