/**
 * PumpWatch asset pipeline.
 *
 * Groups per-animation Meshy GLBs by subject folder, merges clips onto one
 * mesh+skeleton (channels remapped by node NAME), renames clips to canonical
 * names, downscales textures to 1024 and re-encodes JPEG/WebP, writes
 * <5MB outputs plus roster/cops JSON.
 *
 * Re-run whenever new characters/cops are dropped into the source folders:
 *   node --max-old-space-size=8192 tools/process-assets.mjs
 */
import { NodeIO, AnimationSampler } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHAR_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\characters';
const SLIDE_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\slideanimation';
const COP_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\cops';
const PROP_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\props';
const OBS_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\obstacles';
const SCE_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\scenery';
const PIK_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\pickups';
const ITEMS_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\items';

/** Real Meshy world models (loose files). simplify = target tris, 0 = leave. */
const ITEM_MAP = [
  { match: /metal_warning_barrier/i, id: 'hurdle', name: 'WARNING HURDLE', role: 'obstacle', simplify: 4000 },
  { match: /money_bag/i, id: 'doji', name: '$BAG', role: 'pickup', simplify: 4000 },
  { match: /2x_diamond/i, id: 'double', name: '2X GEM', role: 'pickup', simplify: 3500 },
  { match: /shield_aura/i, id: 'shield', name: 'SHIELD POWER', role: 'pickup', simplify: 3500 },
  { match: /shield_gem/i, id: 'shield_emblem', name: 'SHIELD EMBLEM', role: 'pickup', simplify: 2500 },
  { match: /apartment_block/i, id: 'building_apt', name: 'APARTMENT', role: 'scenery', simplify: 5000 },
  { match: /brick_building/i, id: 'building_brick', name: 'BRICK BUILDING', role: 'scenery', simplify: 5000 },
  { match: /office_tower_short/i, id: 'building_office_s', name: 'OFFICE SHORT', role: 'scenery', simplify: 5000 },
  { match: /office_tower_tall/i, id: 'building_office_t', name: 'OFFICE TALL', role: 'scenery', simplify: 5000 },
  { match: /office_building_wide/i, id: 'building_wide', name: 'OFFICE WIDE', role: 'scenery', simplify: 5000 },
  { match: /office_building_tall/i, id: 'building_hi', name: 'OFFICE HI', role: 'scenery', simplify: 5000 },
  { match: /skyscraper/i, id: 'building_sky', name: 'SKYSCRAPER', role: 'scenery', simplify: 5000 },
  { match: /tree_broad/i, id: 'tree', name: 'TREE BROAD', role: 'prop', simplify: 4000 },
  { match: /tree_pine/i, id: 'tree_pine', name: 'TREE PINE', role: 'prop', simplify: 4000 },
  { match: /lowpoly_bush/i, id: 'bush', name: 'BUSH', role: 'prop', simplify: 2500 },
  { match: /modern_street_light/i, id: 'lamp', name: 'STREET LIGHT', role: 'scenery', simplify: 3000 },
  { match: /lowpoly_car/i, id: 'car', name: 'CAR', role: 'prop', simplify: 4000 },
  { match: /lowpoly_sun/i, id: 'sun', name: 'SUN', role: 'scenery', simplify: 2500 },
  { match: /lowpoly_cloud/i, id: 'cloud', name: 'CLOUD', role: 'prop', simplify: 2500 },
  { match: /solangeles_hill_sign/i, id: 'solangeles', name: 'SOLANGELES', role: 'scenery', simplify: 12000 },
  { match: /stone_sidewalk/i, id: 'sidewalk', name: 'SIDEWALK', role: 'scenery', simplify: 3000 },
];
const CHAR_OUT = path.join(ROOT, 'assets', 'models', 'characters');
const COP_OUT = path.join(ROOT, 'assets', 'models', 'cops');
const PROP_OUT = path.join(ROOT, 'assets', 'models', 'props');
const OBS_OUT = path.join(ROOT, 'assets', 'models', 'obstacles');
const SCE_OUT = path.join(ROOT, 'assets', 'models', 'scenery');
const PIK_OUT = path.join(ROOT, 'assets', 'models', 'pickups');

const ROLE_OUT = {
  character: CHAR_OUT,
  cop: COP_OUT,
  prop: PROP_OUT,
  obstacle: OBS_OUT,
  scenery: SCE_OUT,
  pickup: PIK_OUT,
};

const CLIP_MAP = [
  { re: /idle/i, name: 'idle' },
  { re: /regular[_\s-]*jump|jump/i, name: 'jump' },
  { re: /sliding[_\s-]*ro+l|roll/i, name: 'roll' },
  { re: /slide/i, name: 'slide' },
  { re: /run/i, name: 'run' },
  { re: /alert|scared|caught|surprise/i, name: 'alert' },
  { re: /walk[_\s-]*slowly|look[_\s-]*around|search/i, name: 'search' },
  { re: /groovy/i, name: 'groovy' },
  { re: /sneak|crouch/i, name: 'sneak' },
  { re: /walk/i, name: 'walk' },
];

const SUBJECT_META = {
  'Meshy_AI_Bonk_Character_Rigge_biped': {
    id: 'bonk', name: 'BONK', tagline: 'The dog that never sold', role: 'character',
  },
  'Meshy_AI_Black Bull  $ANSEM_Character_Rigged_biped': {
    id: 'ansem', name: '$ANSEM', tagline: 'Bull market in a meat suit', role: 'character',
  },
  'Meshy_AI_Gigachad_Character_Rig_biped': {
    id: 'gigachad', name: 'GIGACHAD', tagline: 'Jawline could stop a rug', role: 'character',
  },
  'Meshy_AI_Moo Deng_Character_Rigge_biped': {
    id: 'moodeng', name: 'MOO DENG', tagline: 'Baby hippo. Apex predator.', role: 'character',
  },
  'Meshy_AI_Pudgy Penguin_rigged_biped': {
    id: 'penguin', name: 'PUDGY', tagline: 'Waddle in. Liquidity out.', role: 'character',
  },
  'Meshy_AI_Pumper_Character_Rigged_biped': {
    id: 'pumper', name: 'PUMPER', tagline: 'The egg that cooked the chart', role: 'character',
  },
  'Meshy_AI_Trollface_Character_Rigge_biped': {
    id: 'trollface', name: 'TROLLFACE', tagline: 'The classic meme. Problem, officer?', role: 'character',
  },
  'Meshy_AI_Troll_Character_Rigge_biped': {
    id: 'troll', name: 'TROLL', tagline: 'Slides under rugs. And arches.', role: 'character',
  },
  // slideanimation folder names (same roster ids — never new cards)
  'Meshy_AI_Bearded_Character_Rig_biped': {
    id: 'gigachad', name: 'GIGACHAD', tagline: 'Jawline could stop a rug', role: 'character',
  },
  'Meshy_AI_Bull_Character_Rigged_biped': {
    id: 'ansem', name: '$ANSEM', tagline: 'Bull market in a meat suit', role: 'character',
  },
  'Meshy_AI_Egg_Character_Rigged_biped': {
    id: 'pumper', name: 'PUMPER', tagline: 'The egg that cooked the chart', role: 'character',
  },
  'Meshy_AI_Hippo_Character_Rigge_biped': {
    id: 'moodeng', name: 'MOO DENG', tagline: 'Baby hippo. Apex predator.', role: 'character',
  },
  'Meshy_AI_Shiba_Character_Rigge_biped': {
    id: 'bonk', name: 'BONK', tagline: 'The dog that never sold', role: 'character',
  },
  'Meshy_AI_shred_penguin_rigged_biped': {
    id: 'penguin', name: 'PUDGY', tagline: 'Waddle in. Liquidity out.', role: 'character',
  },
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function copMetaFromFiles(files = []) {
  const blob = files.map((f) => path.basename(f)).join(' ').toLowerCase();
  if (blob.includes('muscular')) return { id: 'whale', name: 'THE WHALE', tagline: 'Muscles you down.', role: 'cop' };
  if (blob.includes('groovy')) return { id: 'creeper', name: 'THE CREEPER', tagline: 'Shows up last.', role: 'cop' };
  if (blob.includes('police_chief')) return { id: 'chief', name: 'THE CHIEF', tagline: 'Calls the shots.', role: 'cop' };
  if (blob.includes('police_officer')) return { id: 'runner', name: 'THE RUNNER', tagline: 'First on your tail.', role: 'cop' };
  return { id: 'cop', name: 'THE 5-0', tagline: 'Fresh badge.', role: 'cop' };
}

function metaFor(folderName, role, files = []) {
  if (role === 'cop') return copMetaFromFiles(files);
  if (SUBJECT_META[folderName]) return { ...SUBJECT_META[folderName] };
  const id = slugify(folderName);
  return {
    id,
    name: folderName.replace(/^Meshy_AI_/, '').replace(/_+/g, ' ').trim(),
    tagline: role === 'cop' ? 'Fresh badge. Same cone.' : 'New degen on the roster',
    role,
  };
}

function listGlbs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.glb'))
    .map((n) => path.join(dir, n))
    .sort();
}

function listLoosePropsRole(root, role) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((n) => n.toLowerCase().endsWith('.glb'))
    .map((n) => {
      const id = slugify(path.basename(n, '.glb'));
      return {
        folder: root,
        folderName: n,
        files: [path.join(root, n)],
        role,
        meta: { id, name: id, tagline: '', role },
      };
    });
}

function listLooseProps(root) {
  return listLoosePropsRole(root, 'prop');
}

function listItems() {
  if (!fs.existsSync(ITEMS_SRC)) return [];
  const files = fs.readdirSync(ITEMS_SRC).filter((n) => n.toLowerCase().endsWith('.glb'));
  const out = [];
  for (const name of files) {
    const hit = ITEM_MAP.find((m) => m.match.test(name));
    if (!hit) {
      console.warn(`  ! unmapped item ${name}`);
      continue;
    }
    out.push({
      folder: ITEMS_SRC,
      folderName: name,
      files: [path.join(ITEMS_SRC, name)],
      role: hit.role,
      fromItems: true,
      simplifyTarget: hit.simplify || 0,
      meta: { id: hit.id, name: hit.name, tagline: '', role: hit.role },
    });
  }
  return out;
}

function listSubjects(root, role) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const folder = path.join(root, e.name);
      const files = listGlbs(folder);
      return { folder, folderName: e.name, files, role, meta: metaFor(e.name, role, files) };
    })
    .filter((s) => s.files.length > 0);
}

function canonicalClipName(filename, existing) {
  const base = path.basename(filename, '.glb');
  // Meshy names are ..._Animation_<clip>_withSkin — match the clip, not "Troll".
  const hint = base.replace(/^.*Animation_/i, '').replace(/_withSkin$/i, '');
  for (const { re, name } of CLIP_MAP) {
    if (re.test(hint)) {
      if (!existing.has(name)) return name;
      let i = 2;
      while (existing.has(`${name}_${i}`)) i += 1;
      return `${name}_${i}`;
    }
  }
  const fallback = slugify(base.replace(/.*Animation_/, '').replace(/_withSkin$/i, '')) || 'clip';
  return existing.has(fallback) ? `${fallback}_${existing.size}` : fallback;
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function triangleCount(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += indices.getCount() / 3;
      else {
        const pos = prim.getAttribute('POSITION');
        if (pos) tris += pos.getCount() / 3;
      }
    }
  }
  return Math.round(tris);
}

function clipDuration(anim) {
  let max = 0;
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput();
    if (!input) continue;
    const arr = input.getArray();
    if (arr && arr.length) max = Math.max(max, arr[arr.length - 1]);
  }
  return max;
}

function copyAccessor(src, destDoc) {
  const array = src.getArray();
  if (!array) throw new Error(`Accessor ${src.getName()} has no array`);
  return destDoc
    .createAccessor(src.getName())
    .setType(src.getType())
    .setNormalized(src.getNormalized())
    .setSparse(src.getSparse())
    .setArray(array.slice());
}

function nodeMapByName(doc) {
  const map = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const name = node.getName();
    if (!name) continue;
    if (!map.has(name)) map.set(name, node);
  }
  return map;
}

function copyAnimation(srcAnim, destDoc, destNodes, newName) {
  const anim = destDoc.createAnimation(newName);
  let copied = 0;
  let skipped = 0;
  for (const srcChannel of srcAnim.listChannels()) {
    const srcNode = srcChannel.getTargetNode();
    const nodeName = srcNode?.getName();
    const destNode = nodeName ? destNodes.get(nodeName) : null;
    if (!destNode) {
      skipped += 1;
      continue;
    }
    const srcSampler = srcChannel.getSampler();
    if (!srcSampler || !srcSampler.getInput() || !srcSampler.getOutput()) {
      skipped += 1;
      continue;
    }
    const sampler = destDoc
      .createAnimationSampler()
      .setInterpolation(srcSampler.getInterpolation() || AnimationSampler.Interpolation.LINEAR)
      .setInput(copyAccessor(srcSampler.getInput(), destDoc))
      .setOutput(copyAccessor(srcSampler.getOutput(), destDoc));
    const channel = destDoc
      .createAnimationChannel()
      .setTargetNode(destNode)
      .setTargetPath(srcChannel.getTargetPath())
      .setSampler(sampler);
    anim.addSampler(sampler);
    anim.addChannel(channel);
    copied += 1;
  }
  return { anim, copied, skipped };
}

/** Drop a trailing keyframe on looping clips if it pops back toward the first pose. */
function trimLoopSeam(anim, label) {
  let trimmed = 0;
  for (const sampler of anim.listSamplers()) {
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (!input || !output) continue;
    const times = input.getArray();
    const values = output.getArray();
    if (!times || times.length < 4) continue;
    const n = times.length;
    const comps = values.length / n;
    if (!Number.isInteger(comps) || comps < 1) continue;

    const first = values.subarray(0, comps);
    const last = values.subarray((n - 1) * comps, n * comps);
    const prev = values.subarray((n - 2) * comps, (n - 1) * comps);

    let distLastFirst = 0;
    let distPrevFirst = 0;
    let distLastPrev = 0;
    for (let i = 0; i < comps; i += 1) {
      distLastFirst += (last[i] - first[i]) ** 2;
      distPrevFirst += (prev[i] - first[i]) ** 2;
      distLastPrev += (last[i] - prev[i]) ** 2;
    }
    distLastFirst = Math.sqrt(distLastFirst);
    distPrevFirst = Math.sqrt(distPrevFirst);
    distLastPrev = Math.sqrt(distLastPrev);

    // Last frame jumped toward the first pose relative to the previous frame.
    if (distLastFirst + 1e-5 < distPrevFirst && distLastPrev > 1e-4) {
      const newTimes = times.slice(0, n - 1);
      const newValues = values.slice(0, (n - 1) * comps);
      input.setArray(newTimes);
      output.setArray(newValues);
      trimmed += 1;
    }
  }
  if (trimmed) {
    console.log(`    trimmed loop seam on "${label}" (${trimmed} sampler${trimmed === 1 ? '' : 's'})`);
  }
}

function pickBaseFile(files) {
  const scored = files.map((f) => {
    const n = path.basename(f).toLowerCase();
    let score = 0;
    if (/walk/.test(n) && !/slowly|look/.test(n)) score += 3;
    if (/idle/.test(n)) score += 2;
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].f;
}

async function inspectLite(io, file) {
  const stat = fs.statSync(file);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const textures = root.listTextures().map((tex) => {
    const size = tex.getSize();
    return {
      name: tex.getName() || '(unnamed)',
      mime: tex.getMimeType(),
      wh: size ? `${size[0]}×${size[1]}` : '?',
      bytes: tex.getImage()?.byteLength ?? 0,
    };
  });
  const skins = root.listSkins();
  const joints = skins[0] ? skins[0].listJoints().map((j) => j.getName()) : [];
  const clips = root.listAnimations().map((a) => `${a.getName()} (${clipDuration(a).toFixed(2)}s)`);
  const info = {
    file,
    bytes: stat.size,
    tris: triangleCount(doc),
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures,
    bones: joints.length,
    boneNames: joints,
    nodeNames: root.listNodes().map((n) => n.getName()),
    clips,
  };
  return info;
}

async function processSubject(io, subject) {
  const { files, meta, role } = subject;
  const prefix = role === 'cop' ? `cop_${meta.id}` : meta.id;
  const outDir = ROLE_OUT[role] || CHAR_OUT;
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${prefix}.glb`);

  console.log(`\n▶ ${meta.name}  (${files.length} source GLBs)  →  ${path.relative(ROOT, outPath)}`);

  const before = [];
  for (const f of files) {
    const info = await inspectLite(io, f);
    before.push(info);
    const tex = info.textures.map((t) => `${t.wh} ${t.mime} ${fmtMb(t.bytes)}`).join(', ') || 'none';
    console.log(`    SRC  ${fmtMb(info.bytes).padStart(9)}  ${info.tris} tris  ${info.bones} bones  [${info.clips.join(' | ')}]  tex=${tex}`);
    console.log(`         ${path.basename(f)}`);
  }

  // Sanity: node order / names should match within a subject.
  if (before.length > 1) {
    const a = before[0].nodeNames.join('|');
    for (let i = 1; i < before.length; i += 1) {
      const b = before[i].nodeNames.join('|');
      if (a !== b) {
        console.log('    ! node-name lists differ across files — remapping by NAME (not index)');
        const setA = new Set(before[0].nodeNames);
        const missing = before[i].nodeNames.filter((n) => !setA.has(n));
        const extra = before[0].nodeNames.filter((n) => !new Set(before[i].nodeNames).has(n));
        if (missing.length) console.log(`      only in ${path.basename(before[i].file)}: ${missing.join(', ')}`);
        if (extra.length) console.log(`      only in ${path.basename(before[0].file)}: ${extra.join(', ')}`);
      }
    }
  }

  const baseFile = pickBaseFile(files);
  console.log(`    base  ${path.basename(baseFile)}`);
  const dest = await io.read(baseFile);
  const destNodes = nodeMapByName(dest);

  // Always re-read sources for clips. dest IS the walk file, so if we wiped
  // dest first and then used dest as the walk source we'd copy nothing — or
  // worse, re-copy jump/run already merged onto dest as fake "walk" clips.
  for (const anim of dest.getRoot().listAnimations()) anim.dispose();

  const usedNames = new Set();
  const clipReport = [];

  for (const file of files) {
    const name = canonicalClipName(file, usedNames);
    usedNames.add(name);
    const src = await io.read(file);
    const srcAnims = src.getRoot().listAnimations();
    if (srcAnims.length === 0) {
      console.log(`    ! ${path.basename(file)} has no animation clips`);
      continue;
    }
    for (let i = 0; i < srcAnims.length; i += 1) {
      const clipName = srcAnims.length === 1 ? name : `${name}_${i + 1}`;
      const origName = srcAnims[i].getName();
      const { copied, skipped } = copyAnimation(srcAnims[i], dest, destNodes, clipName);
      const anim = dest.getRoot().listAnimations().find((a) => a.getName() === clipName);
      if (name === 'run' && anim) trimLoopSeam(anim, clipName);
      const dur = anim ? clipDuration(anim) : 0;
      clipReport.push({ name: clipName, origName, copied, skipped, duration: dur });
      console.log(
        `    clip  ${clipName.padEnd(10)} ← "${origName}"  ${dur.toFixed(2)}s  ${copied} ch` +
          (skipped ? `  (${skipped} skipped)` : ''),
      );
    }
  }

  if (subject.simplifyTarget) {
    await MeshoptSimplifier.ready;
    const beforeTris = triangleCount(dest);
    const ratio = Math.max(0.0004, Math.min(0.9, subject.simplifyTarget / Math.max(1, beforeTris)));
    console.log(`    simplify ${beforeTris} → ≤${subject.simplifyTarget}  ratio=${ratio.toFixed(4)}`);
    await dest.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }),
    );
    console.log(`    simplified → ${triangleCount(dest)} tris`);
  }

  // Characters stay 1024; obstacles/pickups/scenery drop to 512.
  const texSize = role === 'cop' ? 1024 : 512;
  await dest.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      quality: 82,
      resize: [texSize, texSize],
      slots: /baseColorTexture|occlusionTexture|emissiveTexture/i,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      quality: 82,
      resize: [texSize, texSize],
      slots: /metallicRoughnessTexture/i,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      quality: 80,
      resize: [texSize, texSize],
      slots: /normalTexture/i,
      chromaSubsampling: '4:4:4',
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'jpeg',
      quality: 82,
      resize: [texSize, texSize],
    }),
  );

  const outTris = triangleCount(dest);
  if (subject.fromItems) {
    const cap = Math.max(16000, Math.ceil((subject.simplifyTarget || 10000) * 2));
    if (outTris > cap) {
      throw new Error(`${meta.id} still ${outTris} tris after process (max ${cap})`);
    }
  }

  await io.write(outPath, dest);

  const afterStat = fs.statSync(outPath);
  const afterTex = dest.getRoot().listTextures().map((tex) => {
    const size = tex.getSize();
    return `${size ? `${size[0]}×${size[1]}` : '?'} ${tex.getMimeType()} ${fmtMb(tex.getImage()?.byteLength ?? 0)}`;
  });
  const afterClips = dest.getRoot().listAnimations().map((a) => a.getName());
  const afterBones = dest.getRoot().listSkins()[0]?.listJoints().map((j) => j.getName()) ?? [];

  console.log(`    OUT   ${fmtMb(afterStat.size).padStart(9)}  clips=[${afterClips.join(', ')}]  tex=${afterTex.join(', ') || 'none'}`);
  if (afterStat.size > 5 * 1024 * 1024) {
    console.log(`    ! still over 5MB (${fmtMb(afterStat.size)}) — check textures`);
  }

  const srcBytes = before.reduce((s, b) => s + b.bytes, 0);
  return {
    role,
    id: meta.id,
    name: meta.name,
    tagline: meta.tagline,
    file: path.relative(ROOT, outPath).replaceAll('\\', '/'),
    clips: afterClips,
    bones: afterBones.length,
    boneNames: afterBones,
    tris: before[0]?.tris ?? 0,
    outTris,
    srcFiles: files.length,
    srcBytes,
    outBytes: afterStat.size,
    clipReport,
  };
}

async function main() {
  for (const d of Object.values(ROLE_OUT)) fs.mkdirSync(d, { recursive: true });

  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const itemsOnly = process.argv.includes('--items-only');
  const charsOnly = process.argv.includes('--chars-only');
  const slidesOnly = process.argv.includes('--slides');
  const onlyId = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const onlyIds = onlyId ? onlyId.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const skipRigs = process.argv.includes('--world-only') || itemsOnly;
  const itemsRaw = charsOnly || slidesOnly ? [] : listItems();
  const items = onlyIds.length ? itemsRaw.filter((s) => onlyIds.includes(s.meta.id)) : itemsRaw;
  const useItems = items.length > 0;
  let charSubjects = skipRigs || itemsOnly ? [] : listSubjects(CHAR_SRC, 'character');
  if (slidesOnly) charSubjects = listSubjects(SLIDE_SRC, 'character');
  if (onlyIds.length) charSubjects = charSubjects.filter((s) => onlyIds.includes(s.meta.id));
  const skipWorld = itemsOnly || charsOnly || slidesOnly || !!onlyId;
  const subjects = [
    ...charSubjects,
    ...(skipRigs || skipWorld ? [] : listSubjects(COP_SRC, 'cop')),
    ...(skipWorld ? [] : listSubjects(PROP_SRC, 'prop')),
    ...(skipWorld ? [] : listLooseProps(PROP_SRC)),
    ...(skipWorld || useItems ? [] : listSubjects(OBS_SRC, 'obstacle')),
    ...(skipWorld || useItems ? [] : listLoosePropsRole(OBS_SRC, 'obstacle')),
    ...(skipWorld ? [] : listSubjects(SCE_SRC, 'scenery')),
    ...(skipWorld ? [] : listLoosePropsRole(SCE_SRC, 'scenery')),
    ...(skipWorld || useItems ? [] : listSubjects(PIK_SRC, 'pickup')),
    ...(skipWorld || useItems ? [] : listLoosePropsRole(PIK_SRC, 'pickup')),
    ...items,
  ];

  if (subjects.length === 0) {
    console.error('No subject folders with GLBs found.');
    process.exit(1);
  }

  console.log('PumpWatch asset pipeline');
  console.log(`characters: ${CHAR_SRC}`);
  console.log(`cops:       ${COP_SRC}`);
  console.log(`obstacles:  ${OBS_SRC}`);
  console.log(`scenery:    ${SCE_SRC}`);
  console.log(`pickups:    ${PIK_SRC}`);
  console.log(`items:      ${ITEMS_SRC}  (${items.length})`);
  console.log(`subjects:   ${subjects.length}  (${subjects.map((s) => s.meta.id).join(', ')})`);

  const results = [];
  for (const subject of subjects) {
    results.push(await processSubject(io, subject));
  }

  const pack = (role, extra = {}) =>
    results
      .filter((r) => r.role === role)
      .map((r) => ({
        id: r.id,
        name: r.name,
        tagline: r.tagline,
        file: r.file,
        clips: r.clips,
        bones: r.bones,
        ...extra,
      }));

  const existing = fs.existsSync(path.join(ROOT, 'assets', 'roster.json'))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'roster.json'), 'utf8'))
    : {};

  const mergeById = (prev = [], next = []) => {
    if (!next.length) return prev;
    if (!prev.length) return next;
    const map = new Map(prev.map((x) => [x.id, x]));
    for (const x of next) map.set(x.id, x);
    return [...map.values()];
  };

  const dedupeRoster = (list = []) => {
    const byId = new Map();
    for (const c of list) byId.set(c.id, c);
    // One troll only: prefer the entry that actually has slide/roll clips.
    if (byId.has('troll') && byId.has('trollface')) {
      const keep = (byId.get('troll').clips || []).includes('slide') ? 'troll' : 'trollface';
      const drop = keep === 'troll' ? 'trollface' : 'troll';
      byId.delete(drop);
      console.log(`  roster: dropped duplicate ${drop}, kept ${keep}`);
    }
    const seenName = new Set();
    const out = [];
    for (const c of byId.values()) {
      const key = (c.name || c.id).toLowerCase();
      if (seenName.has(key)) {
        console.log(`  roster: skipped duplicate name ${c.name} (${c.id})`);
        continue;
      }
      seenName.add(key);
      out.push(c);
    }
    return out;
  };

  const roster = {
    generatedAt: new Date().toISOString(),
    characters: dedupeRoster(mergeById(existing.characters || [], pack('character'))),
    cops: pack('cop').length ? pack('cop') : existing.cops || [],
    props: pack('prop').length ? pack('prop') : existing.props || [],
    obstacles: pack('obstacle').length ? pack('obstacle') : existing.obstacles || [],
    scenery: pack('scenery').length ? pack('scenery') : existing.scenery || [],
    pickups: pack('pickup').length ? pack('pickup') : existing.pickups || [],
  };
  const rosterPath = path.join(ROOT, 'assets', 'roster.json');
  fs.writeFileSync(rosterPath, JSON.stringify(roster, null, 2));

  console.log('\n' + '='.repeat(72));
  console.log('BEFORE / AFTER');
  console.log('='.repeat(72));
  console.log(
    `${'SUBJECT'.padEnd(16)} ${'SRC'.padStart(10)} ${'FILES'.padStart(6)} ${'OUT'.padStart(10)} ${'RATIO'.padStart(8)}  CLIPS`,
  );
  for (const r of results) {
    const ratio = r.srcBytes ? ((r.outBytes / r.srcBytes) * 100).toFixed(1) + '%' : '-';
    console.log(
      `${r.id.padEnd(18)} ${fmtMb(r.srcBytes).padStart(10)} → ${fmtMb(r.outBytes).padStart(9)}  tris ${String(r.tris).padStart(8)} → ${String(r.outTris ?? '?').padStart(6)}  ${ratio.padStart(7)}`,
    );
  }
  const srcTotal = results.reduce((s, r) => s + r.srcBytes, 0);
  const outTotal = results.reduce((s, r) => s + r.outBytes, 0);
  console.log('-'.repeat(72));
  console.log(
    `${'TOTAL'.padEnd(16)} ${fmtMb(srcTotal).padStart(10)} ${String(results.reduce((s, r) => s + r.srcFiles, 0)).padStart(6)} ${fmtMb(outTotal).padStart(10)} ${((outTotal / srcTotal) * 100).toFixed(1).padStart(7)}%`,
  );
  console.log(`\nwrote ${path.relative(ROOT, rosterPath)}`);
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
