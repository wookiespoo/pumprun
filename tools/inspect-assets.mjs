/**
 * Inspect source (or processed) GLBs: size, tris, textures, skeleton, clips.
 * Usage:
 *   node tools/inspect-assets.mjs
 *   node tools/inspect-assets.mjs --processed
 */
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHAR_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\characters';
const COP_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\cops';
const OBS_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\obstacles';
const SCE_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\scenery';
const PIK_SRC = 'C:\\Users\\pj382\\OneDrive\\Desktop\\pickups';

const args = new Set(process.argv.slice(2));
const processed = args.has('--processed');

function listGlbs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listGlbs(full));
    else if (entry.name.toLowerCase().endsWith('.glb')) out.push(full);
  }
  return out.sort();
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

async function inspectFile(io, file) {
  const stat = fs.statSync(file);
  const doc = await io.read(file);
  const root = doc.getRoot();

  const textures = root.listTextures().map((tex) => {
    const size = tex.getSize();
    return {
      name: tex.getName() || path.basename(tex.getURI() || '') || '(unnamed)',
      mime: tex.getMimeType(),
      size: size ? `${size[0]}×${size[1]}` : '?',
      bytes: tex.getImage()?.byteLength ?? 0,
    };
  });

  const skins = root.listSkins().map((skin) => {
    const joints = skin.listJoints().map((j) => j.getName());
    return { name: skin.getName() || '(skin)', joints, jointCount: joints.length };
  });

  const nodes = root.listNodes().map((n) => n.getName());
  const meshes = root.listMeshes().map((m) => ({
    name: m.getName(),
    prims: m.listPrimitives().length,
    materials: m.listPrimitives().map((p) => p.getMaterial()?.getName() || '(none)'),
  }));

  const animations = root.listAnimations().map((anim) => ({
    name: anim.getName(),
    duration: Number(clipDuration(anim).toFixed(3)),
    channels: anim.listChannels().length,
    samplers: anim.listSamplers().length,
    targets: anim.listChannels().map((ch) => ch.getTargetNode()?.getName() || '?'),
  }));

  const report = {
    file,
    bytes: stat.size,
    size: fmtMb(stat.size),
    scenes: root.listScenes().length,
    nodes: nodes.length,
    nodeNames: nodes,
    meshes,
    materials: root.listMaterials().map((m) => m.getName()),
    tris: triangleCount(doc),
    textures,
    skins,
    animations,
  };

  return report;
}

function printReport(label, reports) {
  console.log('\n' + '='.repeat(72));
  console.log(label);
  console.log('='.repeat(72));

  for (const r of reports) {
    console.log(`\n${path.basename(r.file)}`);
    console.log(`  path      ${r.file}`);
    console.log(`  size      ${r.size}  (${r.bytes} bytes)`);
    console.log(`  tris      ${r.tris.toLocaleString()}   meshes=${r.meshes.length}  mats=${r.materials.join(', ') || 'none'}`);
    console.log(`  nodes     ${r.nodes}`);
    if (r.textures.length === 0) console.log('  textures  (none)');
    for (const t of r.textures) {
      console.log(`  texture   ${t.size}  ${t.mime}  ${fmtMb(t.bytes)}  ${t.name}`);
    }
    if (r.skins.length === 0) console.log('  skeleton  (none)');
    for (const s of r.skins) {
      console.log(`  skeleton  ${s.jointCount} bones  [${s.joints.join(', ')}]`);
    }
    if (r.animations.length === 0) console.log('  clips     (none)');
    for (const a of r.animations) {
      const uniqueTargets = [...new Set(a.targets)];
      console.log(`  clip      "${a.name}"  ${a.duration}s  ${a.channels} ch  bones=[${uniqueTargets.join(', ')}]`);
    }
  }
}

async function main() {
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

  if (processed) {
    const files = [
      ...listGlbs(path.join(ROOT, 'assets', 'models', 'characters')),
      ...listGlbs(path.join(ROOT, 'assets', 'models', 'cops')),
      ...listGlbs(path.join(ROOT, 'assets', 'models', 'obstacles')),
      ...listGlbs(path.join(ROOT, 'assets', 'models', 'scenery')),
      ...listGlbs(path.join(ROOT, 'assets', 'models', 'pickups')),
    ];
    const reports = [];
    for (const f of files) {
      process.stdout.write(`inspect ${path.basename(f)}...\n`);
      reports.push(await inspectFile(io, f));
    }
    printReport('PROCESSED OUTPUTS', reports);
    return;
  }

  const charFiles = listGlbs(CHAR_SRC);
  const copFiles = listGlbs(COP_SRC);

  console.log(`Found ${charFiles.length} character GLBs in ${CHAR_SRC}`);
  console.log(`Found ${copFiles.length} cop GLBs in ${COP_SRC}`);

  const charReports = [];
  for (const f of charFiles) {
    process.stdout.write(`inspect ${path.relative(CHAR_SRC, f)}...\n`);
    charReports.push(await inspectFile(io, f));
  }
  printReport('CHARACTERS (source)', charReports);

  const copReports = [];
  for (const f of copFiles) {
    process.stdout.write(`inspect ${path.relative(COP_SRC, f)}...\n`);
    copReports.push(await inspectFile(io, f));
  }
  printReport('COPS (source)', copReports);

  const all = [...charReports, ...copReports];
  const totalBytes = all.reduce((s, r) => s + r.bytes, 0);
  console.log('\n' + '-'.repeat(72));
  console.log(`TOTAL SOURCE: ${all.length} files, ${fmtMb(totalBytes)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
