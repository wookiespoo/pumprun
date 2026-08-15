import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { FACE_YAW } from './catalog.js?v=16';

const loader = new GLTFLoader();
const cache = new Map();

export async function loadRoster() {
  const res = await fetch('assets/roster.json?v=cops');
  if (!res.ok) throw new Error('Missing assets/roster.json');
  return res.json();
}

export function loadGltf(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  cache.set(url, p);
  return p;
}

function cloneModel(scene) {
  let skinned = false;
  scene.traverse((o) => {
    if (o.isSkinnedMesh) skinned = true;
  });
  return skinned ? cloneSkinned(scene) : scene.clone(true);
}

/**
 * Fit a GLB so the returned root sits on y=0 at the origin.
 * Ground snap is baked into the inner model — callers can
 * `root.position.set(x, 0, z)` without burying the mesh.
 */
export function mountModel(
  gltf,
  { targetHeight = 1.7, targetWidth = 0, targetLength = 0, yaw = FACE_YAW, lockScale = false } = {},
) {
  const root = new THREE.Group();
  const model = cloneModel(gltf.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  model.rotation.y = yaw;
  const fit = new THREE.Group();
  fit.add(model);
  root.add(fit);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!lockScale) {
    const sy = targetHeight && size.y > 0.01 ? targetHeight / size.y : 1;
    const sx = targetWidth && size.x > 0.01 ? targetWidth / size.x : sy;
    const sz = targetLength && size.z > 0.01 ? targetLength / size.z : sy;
    if (targetWidth || targetLength) fit.scale.set(sx, sy, sz);
    else if (targetHeight && size.y > 0.01) fit.scale.setScalar(sy);
  }
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  fit.position.y -= box2.min.y;

  const clips = {};
  for (const clip of gltf.animations || []) clips[clip.name] = clip;
  return { root, model, clips, height: targetHeight || size.y };
}
