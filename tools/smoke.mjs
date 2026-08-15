import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://localhost:8081/';
const outDir = path.resolve('tools', 'smoke-out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
page.setViewport({ width: 1400, height: 900 });
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push('console.error: ' + t);
  if (t.includes('[spawn]') || t.includes('[doji]')) logs.push(t);
});
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`);
});

console.log('goto', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForSelector('#screen-select.visible', { timeout: 25000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: path.join(outDir, '00-menu.png') });
const menu = await page.evaluate(() => ({
  wordmark: !!document.querySelector('.wordmark'),
  howto: !!document.getElementById('howto'),
  wanted: document.querySelectorAll('.wanted').length,
  intro: !!document.getElementById('screen-intro'),
  pauseBtn: !!document.getElementById('btn-pause'),
  touch: !!document.getElementById('touch-pad'),
  lineup: (window.__pumprun?.lineup || []).map((c) => c.meta?.name || c.id),
}));
console.log('menu:', menu);
if (!menu.wordmark || !menu.howto || menu.wanted < 4 || menu.intro || menu.lineup.length < 4) {
  console.error('MENU FAILED', menu);
  await browser.close();
  process.exit(1);
}
await page.waitForSelector('.char-card', { timeout: 15000 });
const cards = await page.$$eval('.char-card', (els) => els.map((e) => e.dataset.id));
console.log('roster:', cards.join(', '));
const trollClips = await page.evaluate(async () => {
  const entry = window.__pumprun?.roster?.characters?.find((c) => c.id === 'troll');
  if (!entry) return { error: 'no troll in roster' };
  return { file: entry.file, clips: entry.clips, name: entry.name };
});
console.log('troll roster:', trollClips);
await page.screenshot({ path: path.join(outDir, '01-select.png') });

const pickId = cards.includes('troll') ? 'troll' : 'bonk';
await page.click(`.char-card[data-id="${pickId}"]`);
await new Promise((r) => setTimeout(r, 700));
await page.click('#btn-play');
await page.waitForSelector('#hud.visible', { timeout: 25000 });
await new Promise((r) => setTimeout(r, 700));

const snap = await page.evaluate(() => {
  const r = window.__pumprun?.runner;
  const c = window.__pumprun?.cop;
  const s = window.__pumprun?.spawn;
  return {
    mode: window.__pumprun?.mode,
    z: r ? +r.z.toFixed(2) : null,
    lane: r?.lane,
    x: r ? +r.x.toFixed(2) : null,
    anim: r?.current,
    clips: r ? Object.keys(r.clips || {}) : [],
    hasSlideClip: r?.hasSlideClip,
    slideDur: r?.slideDur,
    copZ: c ? +c.root.position.z.toFixed(2) : null,
    copName: c?.name,
    dojis: s ? { spawned: s.spawnedDojis, collected: s.collectedDojis } : null,
  };
});
const bootLogs = await page.evaluate(() => ({
  assets: window.__pumprun.assetLog,
  places: window.__pumprun.placeLog.slice(0, 10),
}));
console.log('======== ASSET LIST ========');
for (const line of bootLogs.assets) console.log(line);
console.log('======== PLACE LIST (first 10) ========');
for (const line of bootLogs.places) console.log(line);
console.log('========');
console.log('run:', snap);
const hudCop = await page.$eval('#hud-cop', (el) => el.textContent);
console.log('hud-cop:', hudCop);
if (!/THE CREEPER|THE WHALE|THE RUNNER|THE CHIEF/.test(String(snap.copName || '') + hudCop)) {
  console.error('CHASER NAME FAILED', snap.copName, hudCop);
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: path.join(outDir, '02-run.png') });

const x0 = snap.x;
await page.keyboard.press('ArrowLeft');
await new Promise((r) => setTimeout(r, 400));
const afterL = await page.evaluate(() => {
  const r = window.__pumprun.runner;
  return { lane: r.lane, x: +r.x.toFixed(2) };
});
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await new Promise((r) => setTimeout(r, 400));
const afterR = await page.evaluate(() => {
  const r = window.__pumprun.runner;
  return { lane: r.lane, x: +r.x.toFixed(2) };
});
console.log('left:', afterL, 'from', x0);
console.log('right:', afterR);

await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 80));
const jump = await page.evaluate(() => {
  const r = window.__pumprun?.runner;
  if (!r) return { dead: true };
  return { y: +r.y.toFixed(2), grounded: r.grounded, anim: r.current };
});
console.log('jump:', jump);
await page.keyboard.press('KeyS');
await new Promise((r) => setTimeout(r, 120));
const slide = await page.evaluate(() => {
  const r = window.__pumprun?.runner;
  return {
    sliding: r?.sliding,
    anim: r?.current,
    hasSlideClip: r?.hasSlideClip,
    slideDur: r?.slideDur,
    squash: r ? +(r.root.scale.y / r.baseScale).toFixed(2) : null,
  };
});
console.log('slide:', slide);
await page.screenshot({ path: path.join(outDir, '03-jump.png') });

const rampRide = await page.evaluate(() => {
  const r = window.__pumprun.runner;
  const s = window.__pumprun.spawn;
  const saved = { z: r.z, y: r.y, vy: r.vy, x: r.x, lane: r.lane, onTop: r.onTop, grounded: r.grounded };
  s._blockers.push({
    lane: 0,
    z: r.z + 8,
    halfL: 2.7,
    halfW: 0.78,
    clear: 'ramp',
    rampLen: 3.5,
    roofY: 1.82,
  });
  const b = s._blockers[s._blockers.length - 1];
  r.lane = 0;
  r.x = 0;
  r.z = b.z - b.halfL - b.rampLen + 0.15;
  r.y = 0;
  r.vy = 0;
  r.grounded = true;
  r.onTop = false;
  r.justJumped = false;
  const ys = [];
  for (let i = 0; i < 50; i += 1) {
    r.update(1 / 60, s);
    ys.push(+r.y.toFixed(2));
  }
  const result = {
    startY: ys[0],
    midY: ys[20],
    endY: ys[ys.length - 1],
    maxY: Math.max(...ys),
    onTop: r.onTop,
  };
  Object.assign(r, saved);
  r.root.position.set(r.x, r.y, r.z);
  s._blockers.pop();
  return result;
});
console.log('ramp-ride:', rampRide);
const sit = await page.evaluate(() => {
  const s = window.__pumprun.spawn;
  const result = {};
  for (const id of ['bus_degen', 'bus_trench', 'hurdle', 'gantry']) {
    const spec = {
      id,
      height: id.startsWith('bus') ? 1.78 : id === 'hurdle' ? 1.52 : 2.4,
      width: id.startsWith('bus') ? 1.58 : 1.9,
      yaw: id.startsWith('bus') ? Math.PI / 2 : 0,
      clear: id.startsWith('bus') ? 'ramp' : id === 'hurdle' ? 'jump' : 'slide',
      roofY: 1.7,
      halfL: 1.7,
      rampLen: 2.25,
    };
    if (!s.gltfs[id]) {
      result[id] = 'missing-glb';
      continue;
    }
    const root = s._makeObstacle(spec);
    root.updateMatrixWorld(true);
    let minY = Infinity;
    let maxY = -Infinity;
    let meshes = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      meshes += 1;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone();
      b.applyMatrix4(o.matrixWorld);
      minY = Math.min(minY, b.min.y);
      maxY = Math.max(maxY, b.max.y);
    });
    result[id] = { meshes, minY: +minY.toFixed(2), maxY: +maxY.toFixed(2) };
  }
  return result;
});
console.log('sit:', sit);
for (const [id, info] of Object.entries(sit)) {
  const need = id.startsWith('bus') ? 2 : 1;
  if (info === 'missing-glb' || info.meshes < need || info.minY < -0.12 || info.maxY < 0.45) {
    console.error('PLACEMENT FAILED', id, info);
    await browser.close();
    process.exit(1);
  }
}
const rows = (await page.evaluate(() => window.__pumprun.placeLog)).slice(0, 10);
console.log('rows:', rows);
if (rows.length && !rows.some((t) => t.includes('JUMP') || t.includes('SLIDE') || t.includes('PARKED') || t.includes('RIDE'))) {
  console.error('CYCLE FAILED — no obstacles placed', rows);
  await browser.close();
  process.exit(1);
}
if (!(rampRide.maxY >= 1.2)) {
  console.error('RAMP RIDE FAILED', rampRide);
  await browser.close();
  process.exit(1);
}

// wait to either travel or crash
const t0 = Date.now();
let last = snap;
while (Date.now() - t0 < 8000) {
  await new Promise((r) => setTimeout(r, 500));
  last = await page.evaluate(() => {
    const r = window.__pumprun.runner;
    const s = window.__pumprun.spawn;
    return {
      mode: window.__pumprun.mode,
      z: r ? +r.z.toFixed(1) : null,
      sol: document.getElementById('hud-sol')?.textContent,
      dist: document.getElementById('hud-dist')?.textContent,
      dojis: s ? { spawned: s.spawnedDojis, collected: s.collectedDojis } : null,
    };
  });
  if (last.mode === 'rugged') break;
}
console.log('later:', last);
await page.screenshot({ path: path.join(outDir, last.mode === 'rugged' ? '04-rugged.png' : '04-later.png') });
console.log('spawn logs:', logs);
console.log('errors:', errors.length ? errors : '(none)');
await browser.close();
if (errors.length) process.exit(1);
console.log('SMOKE OK');
