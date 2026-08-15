/**
 * Author low-poly stand-in GLBs (composed meshes, not a single cube).
 * Kenney zip download was blocked in this environment; drop official
 * CC0 kits into Desktop/obstacles or Desktop/scenery and re-run process.
 *
 * Writes one GLB per subject folder so process-assets.mjs can pick them up.
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_OBS = path.join(__dirname, '..', 'assets', 'models', 'obstacles');

const OBS = 'C:\\Users\\pj382\\OneDrive\\Desktop\\obstacles';
const SCE = 'C:\\Users\\pj382\\OneDrive\\Desktop\\scenery';
const PIK = 'C:\\Users\\pj382\\OneDrive\\Desktop\\pickups';

const COL = {
  body: [0.12, 0.09, 0.18],
  dark: [0.06, 0.05, 0.09],
  metal: [0.35, 0.36, 0.4],
  green: [0.08, 0.95, 0.58],
  purple: [0.6, 0.27, 1],
  gold: [0.96, 0.77, 0.26],
  window: [0.05, 0.18, 0.14],
  brick: [0.22, 0.14, 0.28],
  brick2: [0.14, 0.16, 0.28],
  brick3: [0.1, 0.12, 0.2],
  asphalt: [0.14, 0.13, 0.16],
  stripe: [0.95, 0.95, 0.95],
  rust: [0.45, 0.18, 0.12],
  wood: [0.35, 0.22, 0.1],
};

function mat(doc, rgb, { emissive = [0, 0, 0], emissiveStrength = 0, metal = 0.1, rough = 0.7, name = '' } = {}) {
  const m = doc.createMaterial(name || 'mat');
  m.setBaseColorFactor([...rgb, 1]);
  m.setMetallicFactor(metal);
  m.setRoughnessFactor(rough);
  if (emissiveStrength > 0) {
    m.setEmissiveFactor(emissive);
  }
  return m;
}

function pushBox(pos, nrm, idx, w, h, d, ox, oy, oz) {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
    { n: [0, 0, -1], v: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    { n: [0, 1, 0], v: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]] },
    { n: [0, -1, 0], v: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]] },
    { n: [1, 0, 0], v: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
    { n: [-1, 0, 0], v: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
  ];
  for (const f of faces) {
    const base = pos.length / 3;
    for (const p of f.v) {
      pos.push(p[0] + ox, p[1] + oy, p[2] + oz);
      nrm.push(f.n[0], f.n[1], f.n[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function pushCyl(pos, nrm, idx, r, h, ox, oy, oz, segs = 12, axis = 'y') {
  const y0 = -h / 2;
  const y1 = h / 2;
  for (let i = 0; i < segs; i += 1) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const base = pos.length / 3;
    const p = (x, y, z) => {
      if (axis === 'z') pos.push(x + ox, y + oy, z + oz);
      else if (axis === 'x') pos.push(z + ox, y + oy, x + oz);
      else pos.push(x + ox, y + oy, z + oz);
    };
    if (axis === 'y') {
      p(c0 * r, y0, s0 * r);
      p(c1 * r, y0, s1 * r);
      p(c1 * r, y1, s1 * r);
      p(c0 * r, y1, s0 * r);
      const nx0 = c0;
      const nz0 = s0;
      const nx1 = c1;
      const nz1 = s1;
      nrm.push(nx0, 0, nz0, nx1, 0, nz1, nx1, 0, nz1, nx0, 0, nz0);
    } else if (axis === 'x') {
      p(c0 * r, y0, s0 * r);
      p(c1 * r, y0, s1 * r);
      p(c1 * r, y1, s1 * r);
      p(c0 * r, y1, s0 * r);
      // remap after push — simpler: treat as y then we already used axis x in p
      nrm.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    } else {
      p(c0 * r, y0, s0 * r);
      p(c1 * r, y0, s1 * r);
      p(c1 * r, y1, s1 * r);
      p(c0 * r, y1, s0 * r);
      nrm.push(c0, s0, 0, c1, s1, 0, c1, s1, 0, c0, s0, 0);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function primFrom(doc, pos, nrm, idx, material) {
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  const pAcc = doc
    .createAccessor('pos')
    .setType('VEC3')
    .setArray(new Float32Array(pos))
    .setBuffer(buffer);
  const nAcc = doc
    .createAccessor('nrm')
    .setType('VEC3')
    .setArray(new Float32Array(nrm))
    .setBuffer(buffer);
  const iAcc = doc
    .createAccessor('idx')
    .setType('SCALAR')
    .setArray(new Uint16Array(idx))
    .setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', pAcc)
    .setAttribute('NORMAL', nAcc)
    .setIndices(iAcc)
    .setMaterial(material);
}

function finish(doc, meshName, parts) {
  const mesh = doc.createMesh(meshName);
  for (const part of parts) mesh.addPrimitive(part);
  const node = doc.createNode(meshName).setMesh(mesh);
  const scene = doc.createScene(meshName).addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

function newDoc() {
  return new Document();
}

function train() {
  const doc = newDoc();
  const bodyM = mat(doc, COL.metal, { metal: 0.55, rough: 0.35, name: 'hull' });
  const darkM = mat(doc, COL.dark, { name: 'trim' });
  const winM = mat(doc, COL.window, { emissive: COL.green, emissiveStrength: 1, name: 'win' });
  const wheelM = mat(doc, COL.dark, { metal: 0.7, rough: 0.4, name: 'wheel' });
  const stripeM = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 1, name: 'neon' });

  const pos = [];
  const nrm = [];
  const idx = [];
  pushBox(pos, nrm, idx, 1.5, 1.55, 5.4, 0, 1.05, 0);
  pushBox(pos, nrm, idx, 1.56, 0.12, 5.5, 0, 1.86, 0);
  pushBox(pos, nrm, idx, 1.2, 0.35, 0.2, 0, 1.35, 2.75);

  const pos2 = [];
  const nrm2 = [];
  const idx2 = [];
  for (const z of [-1.8, -0.6, 0.6, 1.8]) {
    pushBox(pos2, nrm2, idx2, 0.04, 0.45, 0.7, 0.76, 1.2, z);
    pushBox(pos2, nrm2, idx2, 0.04, 0.45, 0.7, -0.76, 1.2, z);
  }

  const pos3 = [];
  const nrm3 = [];
  const idx3 = [];
  for (const z of [-1.9, -0.6, 0.7, 2.0]) {
    for (const x of [-0.55, 0.55]) {
      pushCyl(pos3, nrm3, idx3, 0.22, 0.18, x, 0.22, z, 10, 'x');
    }
  }

  const pos4 = [];
  const nrm4 = [];
  const idx4 = [];
  pushBox(pos4, nrm4, idx4, 1.52, 0.08, 5.42, 0, 0.42, 0);

  // Longer, gentler wedge at local +Z (cab). After yaw=π it faces the runner.
  // Length 3.5, high end flush with the body front at z=2.7.
  const pos5 = [];
  const nrm5 = [];
  const idx5 = [];
  pushWedge(pos5, nrm5, idx5, 1.45, 1.82, 3.5, 0, 0, 4.45);

  const pos6 = [];
  const nrm6 = [];
  const idx6 = [];
  const goldM = mat(doc, COL.gold, { emissive: [0.5, 0.35, 0.05], emissiveStrength: 0.35, name: 'chev' });
  // Climb chevrons on the slope so the ride direction is obvious.
  for (let i = 0; i < 4; i += 1) {
    const t = 0.18 + i * 0.2;
    const z = 4.45 + (1.75 - t * 3.5); // from tip (+Z) toward bus
    const y = t * 1.82 + 0.04;
    pushBox(pos6, nrm6, idx6, 0.42, 0.035, 0.14, 0, y, z);
    pushBox(pos6, nrm6, idx6, 0.16, 0.03, 0.16, -0.22, y, z + 0.08);
    pushBox(pos6, nrm6, idx6, 0.16, 0.03, 0.16, 0.22, y, z + 0.08);
  }

  return finish(doc, 'train', [
    primFrom(doc, pos, nrm, idx, bodyM),
    primFrom(doc, pos2, nrm2, idx2, winM),
    primFrom(doc, pos3, nrm3, idx3, wheelM),
    primFrom(doc, pos4, nrm4, idx4, stripeM),
    primFrom(doc, pos5, nrm5, idx5, stripeM),
    primFrom(doc, pos6, nrm6, idx6, goldM),
  ]);
}

function pushWedge(pos, nrm, idx, w, h, d, ox, oy, oz) {
  const hw = w / 2;
  const z0 = -d / 2; // toward bus (high)
  const z1 = d / 2; // toward runner (low tip)
  const faces = [
    {
      n: [0, d, h],
      v: [
        [-hw, 0, z1],
        [hw, 0, z1],
        [hw, h, z0],
        [-hw, h, z0],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [-hw, 0, z0],
        [hw, 0, z0],
        [hw, h, z0],
        [-hw, h, z0],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [-hw, 0, z0],
        [-hw, 0, z1],
        [hw, 0, z1],
        [hw, 0, z0],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [-hw, 0, z1],
        [-hw, 0, z0],
        [-hw, h, z0],
      ],
    },
    {
      n: [1, 0, 0],
      v: [
        [hw, 0, z1],
        [hw, h, z0],
        [hw, 0, z0],
      ],
    },
  ];
  const ln = (n) => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  for (const f of faces) {
    const n = ln(f.n);
    const base = pos.length / 3;
    for (const p of f.v) {
      pos.push(p[0] + ox, p[1] + oy, p[2] + oz);
      nrm.push(n[0], n[1], n[2]);
    }
    if (f.v.length === 4) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else if (f.v.length === 3) idx.push(base, base + 1, base + 2);
  }
}

function barrier() {
  const doc = newDoc();
  const postM = mat(doc, COL.metal, { metal: 0.5, name: 'post' });
  const railM = mat(doc, COL.rust, { name: 'rail' });
  const stripeM = mat(doc, COL.gold, { emissive: [0.6, 0.4, 0.05], emissiveStrength: 0.4, name: 'stripe' });

  const a = [[], [], []];
  pushCyl(a[0], a[1], a[2], 0.07, 0.7, -0.7, 0.35, 0, 8, 'y');
  pushCyl(a[0], a[1], a[2], 0.07, 0.7, 0.7, 0.35, 0, 8, 'y');

  const b = [[], [], []];
  pushBox(b[0], b[1], b[2], 1.55, 0.16, 0.12, 0, 0.42, 0);
  pushBox(b[0], b[1], b[2], 1.55, 0.16, 0.12, 0, 0.64, 0);

  const c = [[], [], []];
  for (const x of [-0.5, 0, 0.5]) pushBox(c[0], c[1], c[2], 0.18, 0.14, 0.14, x, 0.53, 0);

  return finish(doc, 'barrier', [
    primFrom(doc, a[0], a[1], a[2], postM),
    primFrom(doc, b[0], b[1], b[2], railM),
    primFrom(doc, c[0], c[1], c[2], stripeM),
  ]);
}

function gantry() {
  // Slide-under overhead: lintel bottom ~1.12m so a standing runner hits
  // and a slide pose (head ~0.62) clears. Steel + warning stripe — not blue.
  const doc = newDoc();
  const postM = mat(doc, COL.metal, { metal: 0.62, rough: 0.38, name: 'post' });
  const signM = mat(doc, COL.dark, { name: 'sign' });
  const stripeM = mat(doc, COL.gold, { emissive: [0.6, 0.4, 0.05], emissiveStrength: 0.55, name: 'stripe' });
  const warnM = mat(doc, [0.08, 0.08, 0.08], { name: 'warn' });

  const a = [[], [], []];
  pushCyl(a[0], a[1], a[2], 0.09, 2.4, -0.88, 1.2, 0, 8, 'y');
  pushCyl(a[0], a[1], a[2], 0.09, 2.4, 0.88, 1.2, 0, 8, 'y');
  pushBox(a[0], a[1], a[2], 1.92, 0.12, 0.14, 0, 2.34, 0);

  const b = [[], [], []];
  // Sign hangs from 1.12 → 2.22. Clearance under = 1.12m.
  pushBox(b[0], b[1], b[2], 1.62, 1.1, 0.1, 0, 1.67, 0.04);

  const c = [[], [], []];
  pushBox(c[0], c[1], c[2], 1.62, 0.1, 0.04, 0, 1.18, 0.1);
  pushBox(c[0], c[1], c[2], 1.62, 0.1, 0.04, 0, 2.16, 0.1);
  for (let i = 0; i < 6; i += 1) {
    const x = -0.7 + i * 0.28;
    pushBox(c[0], c[1], c[2], 0.12, 0.9, 0.03, x, 1.67, 0.1);
  }

  const d = [[], [], []];
  pushBox(d[0], d[1], d[2], 1.5, 0.08, 0.05, 0, 1.67, 0.12);

  return finish(doc, 'gantry', [
    primFrom(doc, a[0], a[1], a[2], postM),
    primFrom(doc, b[0], b[1], b[2], signM),
    primFrom(doc, c[0], c[1], c[2], warnM),
    primFrom(doc, d[0], d[1], d[2], stripeM),
  ]);
}

function building(name, w, h, d, brick) {
  const doc = newDoc();
  const wallM = mat(doc, brick, { rough: 0.85, name: 'wall' });
  const roofM = mat(doc, COL.dark, { name: 'roof' });
  const winM = mat(doc, COL.window, { emissive: COL.green, emissiveStrength: 0.8, name: 'win' });
  const accentM = mat(doc, COL.purple, { emissive: COL.purple, emissiveStrength: 0.9, name: 'accent' });

  const a = [[], [], []];
  pushBox(a[0], a[1], a[2], w, h, d, 0, h / 2, 0);

  const b = [[], [], []];
  pushBox(b[0], b[1], b[2], w + 0.2, 0.18, d + 0.2, 0, h + 0.05, 0);
  pushBox(b[0], b[1], b[2], 0.15, 0.7, 0.15, w * 0.25, h + 0.5, d * 0.2);

  const c = [[], [], []];
  const cols = 3;
  const rows = Math.max(2, Math.floor(h / 1.4));
  for (let r = 0; r < rows; r += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = -w * 0.28 + col * (w * 0.28);
      const y = 0.9 + r * (h / (rows + 0.6));
      pushBox(c[0], c[1], c[2], 0.28, 0.38, 0.04, x, y, d / 2 + 0.01);
    }
  }

  const e = [[], [], []];
  pushBox(e[0], e[1], e[2], w + 0.04, 0.08, 0.06, 0, h * 0.55, d / 2 + 0.03);

  return finish(doc, name, [
    primFrom(doc, a[0], a[1], a[2], wallM),
    primFrom(doc, b[0], b[1], b[2], roofM),
    primFrom(doc, c[0], c[1], c[2], winM),
    primFrom(doc, e[0], e[1], e[2], accentM),
  ]);
}

function road() {
  const doc = newDoc();
  const asph = mat(doc, COL.asphalt, { rough: 0.95, name: 'asphalt' });
  const line = mat(doc, COL.stripe, { name: 'line' });
  const curb = mat(doc, COL.purple, { emissive: COL.purple, emissiveStrength: 0.55, name: 'curb' });
  const mid = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 0.55, name: 'mid' });

  const a = [[], [], []];
  pushBox(a[0], a[1], a[2], 7.2, 0.08, 16, 0, 0.0, 0);

  const b = [[], [], []];
  for (const x of [-2, 0, 2]) {
    for (const z of [-6, -2, 2, 6]) {
      pushBox(b[0], b[1], b[2], 0.12, 0.02, 1.4, x, 0.05, z);
    }
  }

  const c = [[], [], []];
  pushBox(c[0], c[1], c[2], 0.12, 0.18, 16, -3.5, 0.08, 0);
  pushBox(c[0], c[1], c[2], 0.12, 0.18, 16, 3.5, 0.08, 0);

  const d = [[], [], []];
  pushBox(d[0], d[1], d[2], 0.06, 0.04, 16, 0, 0.05, 0);

  return finish(doc, 'road', [
    primFrom(doc, a[0], a[1], a[2], asph),
    primFrom(doc, b[0], b[1], b[2], line),
    primFrom(doc, c[0], c[1], c[2], curb),
    primFrom(doc, d[0], d[1], d[2], mid),
  ]);
}

function lamp() {
  const doc = newDoc();
  const postM = mat(doc, COL.metal, { metal: 0.6, name: 'post' });
  const glowM = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 1, name: 'glow' });
  const a = [[], [], []];
  pushCyl(a[0], a[1], a[2], 0.07, 3.2, 0, 1.6, 0, 8, 'y');
  pushBox(a[0], a[1], a[2], 0.7, 0.08, 0.12, 0.25, 3.15, 0);
  const b = [[], [], []];
  pushBox(b[0], b[1], b[2], 0.28, 0.12, 0.2, 0.55, 3.05, 0);
  return finish(doc, 'lamp', [
    primFrom(doc, a[0], a[1], a[2], postM),
    primFrom(doc, b[0], b[1], b[2], glowM),
  ]);
}

function neonSign() {
  const doc = newDoc();
  const frameM = mat(doc, COL.dark, { name: 'frame' });
  const neonM = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 1, name: 'neon' });
  const a = [[], [], []];
  pushBox(a[0], a[1], a[2], 2.4, 1.1, 0.12, 0, 1.6, 0);
  const b = [[], [], []];
  pushBox(b[0], b[1], b[2], 2.1, 0.18, 0.06, 0, 1.75, 0.08);
  pushBox(b[0], b[1], b[2], 2.1, 0.12, 0.06, 0, 1.45, 0.08);
  return finish(doc, 'neon_sign', [
    primFrom(doc, a[0], a[1], a[2], frameM),
    primFrom(doc, b[0], b[1], b[2], neonM),
  ]);
}

function railing() {
  const doc = newDoc();
  const m = mat(doc, COL.metal, { metal: 0.5, name: 'rail' });
  const n = mat(doc, COL.purple, { emissive: COL.purple, emissiveStrength: 0.7, name: 'glow' });
  const a = [[], [], []];
  for (const z of [-7, -3.5, 0, 3.5, 7]) pushCyl(a[0], a[1], a[2], 0.05, 1.2, 0, 0.6, z, 6, 'y');
  pushBox(a[0], a[1], a[2], 0.08, 0.06, 16, 0, 1.15, 0);
  const b = [[], [], []];
  pushBox(b[0], b[1], b[2], 0.05, 0.04, 16, 0, 0.7, 0);
  return finish(doc, 'railing', [
    primFrom(doc, a[0], a[1], a[2], m),
    primFrom(doc, b[0], b[1], b[2], n),
  ]);
}

function sol() {
  const doc = newDoc();
  const gold = mat(doc, COL.gold, { metal: 0.85, rough: 0.25, emissive: [0.4, 0.28, 0.05], emissiveStrength: 0.5, name: 'sol' });
  const rim = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 0.8, name: 'rim' });
  const a = [[], [], []];
  pushCyl(a[0], a[1], a[2], 0.32, 0.08, 0, 0.32, 0, 16, 'y');
  const b = [[], [], []];
  pushCyl(b[0], b[1], b[2], 0.36, 0.04, 0, 0.32, 0, 16, 'y');
  return finish(doc, 'sol', [
    primFrom(doc, a[0], a[1], a[2], gold),
    primFrom(doc, b[0], b[1], b[2], rim),
  ]);
}

/** Classic doji: gold cross + green wick, readable not blown-out. */
function doji() {
  const doc = newDoc();
  const gold = mat(doc, COL.gold, { metal: 0.75, rough: 0.3, emissive: [0.25, 0.18, 0.04], emissiveStrength: 0.35, name: 'body' });
  const wick = mat(doc, [0.12, 0.42, 0.3], { emissive: COL.green, emissiveStrength: 0.35, metal: 0.15, name: 'wick' });
  const neon = mat(doc, COL.green, { emissive: COL.green, emissiveStrength: 0.45, metal: 0.15, name: 'neon' });
  const a = [[], [], []];
  pushBox(a[0], a[1], a[2], 0.38, 0.06, 0.1, 0, 0.4, 0);
  const b = [[], [], []];
  pushCyl(b[0], b[1], b[2], 0.02, 0.78, 0, 0.4, 0, 8, 'y');
  const c = [[], [], []];
  pushBox(c[0], c[1], c[2], 0.16, 0.09, 0.12, 0, 0.4, 0);
  return finish(doc, 'doji', [
    primFrom(doc, a[0], a[1], a[2], gold),
    primFrom(doc, b[0], b[1], b[2], wick),
    primFrom(doc, c[0], c[1], c[2], neon),
  ]);
}

function shield() {
  const doc = newDoc();
  const m = mat(doc, [0.2, 0.7, 1], { emissive: [0.1, 0.4, 0.8], emissiveStrength: 0.7, metal: 0.3, name: 'shield' });
  const a = [[], [], []];
  pushCyl(a[0], a[1], a[2], 0.22, 0.5, 0, 0.4, 0, 8, 'y');
  pushBox(a[0], a[1], a[2], 0.08, 0.55, 0.08, 0, 0.4, 0);
  return finish(doc, 'shield', [primFrom(doc, a[0], a[1], a[2], m)]);
}

async function writeSubject(root, id, document) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const out = path.join(dir, `${id}.glb`);
  await io.write(out, document);
  const st = fs.statSync(out);
  console.log(`  wrote ${out}  ${(st.size / 1024).toFixed(1)} KB`);
}

async function main() {
  if (process.argv.includes('--gantry-only')) {
    await writeSubject(OBS, 'gantry', gantry());
    fs.mkdirSync(GAME_OBS, { recursive: true });
    const src = path.join(OBS, 'gantry', 'gantry.glb');
    const dest = path.join(GAME_OBS, 'gantry.glb');
    fs.copyFileSync(src, dest);
    console.log(`  copied ${dest}`);
    return;
  }
  fs.mkdirSync(OBS, { recursive: true });
  fs.mkdirSync(SCE, { recursive: true });
  fs.mkdirSync(PIK, { recursive: true });
  console.log('authoring stand-in GLBs (Kenney download blocked; these are composed meshes)');
  await writeSubject(OBS, 'train', train());
  await writeSubject(OBS, 'barrier', barrier());
  await writeSubject(OBS, 'gantry', gantry());
  await writeSubject(SCE, 'road', road());
  await writeSubject(SCE, 'building_a', building('building_a', 4.2, 8.5, 4.6, COL.brick));
  await writeSubject(SCE, 'building_b', building('building_b', 3.4, 12.2, 3.8, COL.brick2));
  await writeSubject(SCE, 'building_c', building('building_c', 5.0, 6.4, 5.2, COL.brick3));
  await writeSubject(SCE, 'lamp', lamp());
  await writeSubject(SCE, 'neon_sign', neonSign());
  await writeSubject(SCE, 'railing', railing());
  await writeSubject(PIK, 'sol', sol());
  await writeSubject(PIK, 'doji', doji());
  await writeSubject(PIK, 'shield', shield());
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
