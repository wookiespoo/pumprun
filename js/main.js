import * as THREE from 'three';
import { Input } from './input.js?v=23';
import { loadRoster, loadGltf, mountModel } from './roster.js?v=71';
import { COPS, FACE_YAW, LINEUP, STARTERS, unlockCost, copById } from './catalog.js?v=77';
import { Runner } from './runner.js?v=69';
import { ChaseCam } from './camera.js?v=73';
import { Chaser, makeWantedPlate, playMenuIdle, tickMenuIdle } from './cop.js?v=74';
import { Track } from './track.js?v=70';
import { Spawner } from './spawn.js?v=69';
import { UI, saveShareCard } from './ui.js?v=80';
import { AudioBus } from './audio.js?v=69';
import { DAY, Weather } from './weather.js?v=52';
import {
  boardReady,
  fetchBoard,
  fetchStanding,
  getUsername,
  loadBest,
  saveBest,
  setUsername,
  submitRun,
  BANK_KEY,
  UNLOCK_KEY,
  wipeLegacySaves,
} from './board.js?v=78';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6eb4dc);
scene.fog = new THREE.Fog(0x86c0de, 48, 125);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 2.25, 6.2);

const hemi = new THREE.HemisphereLight(0xb48cff, 0x0a0810, 1.1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffe8c8, 0.9);
key.position.set(6, 14, 4);
key.castShadow = true;
scene.add(key);
const neonA = new THREE.PointLight(0x14f195, 4, 22, 2);
neonA.position.set(-4, 3, 6);
scene.add(neonA);
const neonB = new THREE.PointLight(0x9945ff, 4, 22, 2);
neonB.position.set(4, 3, 10);
scene.add(neonB);

const clock = new THREE.Clock();
const input = new Input();
const ui = new UI();
const audio = new AudioBus();
const weather = new Weather(scene, { hemi, key, neonA, neonB, renderer });

let roster = null;
let mode = 'boot';
let selectedId = null;
let preview = null;
let previewGen = 0;
let runner = null;
let follow = null;
let cop = null;
let track = null;
let spawn = null;
let sol = 0;
let lastLine = '';
let lastCatcher = '';
let catchT = 0;
let catchBest = false;
wipeLegacySaves();
let best = loadBest();
let bank = Number(localStorage.getItem(BANK_KEY) || 0);
let unlocked = new Set(STARTERS);
let busy = false;
let stage = null;
let lineup = [];
let menuT = 0;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  if (mode === 'select' || mode === 'splash') frameMenuCam();
  else {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
});

function dismissSplash() {
  const btn = document.getElementById('btn-splash');
  if (btn?.disabled) return;
  if (mode !== 'splash') return;
  audio.unlock();
  ui.hideSplash();
  mode = 'select';
  ui.show('select');
  frameMenuCam();
  ui.setTagLabel(getUsername());
  if (!getUsername()) ui.showName('');
}
document.getElementById('btn-splash')?.addEventListener('click', (e) => {
  e.stopPropagation();
  dismissSplash();
});
document.getElementById('screen-splash')?.addEventListener('click', () => dismissSplash());
document.getElementById('btn-play').addEventListener('click', () => {
  audio.unlock();
  if (!getUsername()) {
    ui.showName('');
    return;
  }
  if (!selectedId) return;
  if (!isUnlocked(selectedId)) {
    tryUnlock(selectedId);
    return;
  }
  startRun(selectedId);
});
document.getElementById('btn-board')?.addEventListener('click', () => openBoard());
document.getElementById('btn-rugged-board')?.addEventListener('click', () => openBoard());
document.getElementById('btn-board-close')?.addEventListener('click', () => ui.hideBoard());
document.getElementById('board-overlay')?.addEventListener('click', (e) => {
  if (e.target?.id === 'board-overlay') ui.hideBoard();
});
document.getElementById('btn-name')?.addEventListener('click', () => ui.showName(getUsername()));
document.getElementById('name-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const hit = setUsername(document.getElementById('name-input')?.value);
  if (!hit.ok) {
    ui.nameError(hit.error);
    return;
  }
  ui.nameError('');
  ui.hideName();
  ui.setTagLabel(hit.name);
});
document.getElementById('name-overlay')?.addEventListener('click', (e) => {
  if (e.target?.id === 'name-overlay' && getUsername()) ui.hideName();
});
document.getElementById('btn-retry').addEventListener('click', () => {
  audio.unlock();
  if (selectedId && isUnlocked(selectedId)) startRun(selectedId);
  else enterMenu();
});
document.getElementById('btn-menu')?.addEventListener('click', () => enterMenu());
document.getElementById('btn-pause')?.addEventListener('pointerdown', (e) => e.stopPropagation());
document.getElementById('btn-pause')?.addEventListener('click', (e) => {
  e.stopPropagation();
  pause();
});
document.getElementById('btn-resume')?.addEventListener('click', () => resume());
document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
  resume();
  if (selectedId) startRun(selectedId);
});
document.getElementById('btn-pause-mute')?.addEventListener('click', () => {
  audio.unlock();
  ui.setMuted(audio.toggleMute());
});
document.getElementById('btn-mute').addEventListener('pointerdown', (e) => e.stopPropagation());
document.getElementById('btn-mute').addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  ui.setMuted(audio.toggleMute());
});
ui.setMuted(audio.muted);
document.getElementById('btn-share').addEventListener('click', async () => {
  const who = roster.characters.find((c) => c.id === selectedId);
  await saveShareCard({
    renderer,
    who: who?.name,
    distance: runner?.distance || 0,
    sol,
    line: lastLine,
    catcher: lastCatcher,
    best,
  });
  ui.say('SHARE CARD SAVED.');
});

function loadUnlocked() {
  try {
    const raw = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function isUnlocked(id) {
  return unlocked.has(id);
}

function persistUnlocked() {
  localStorage.setItem(UNLOCK_KEY, JSON.stringify([...unlocked].filter((id) => !STARTERS.includes(id))));
}

function tryUnlock(id) {
  if (isUnlocked(id)) return true;
  const cost = unlockCost(id);
  if (bank < cost) {
    ui.say(`NEED $${cost} BAGS TO UNLOCK.`, 2.2);
    return false;
  }
  bank -= cost;
  localStorage.setItem(BANK_KEY, String(Math.floor(bank)));
  unlocked.add(id);
  persistUnlocked();
  ui.setBank(bank);
  rebuildRoster();
  refreshPlay();
  ui.say(`${roster.characters.find((c) => c.id === id)?.name || id} UNLOCKED.`, 2.0);
  return true;
}

function rebuildRoster() {
  ui.buildRoster(roster.characters, {
    selected: selectedId,
    unlocked,
    costOf: unlockCost,
    onPick: (id) => {
      selectedId = id;
      ui.mark(id);
      refreshPlay();
      showPreview(id);
      if (!isUnlocked(id)) ui.say(`LOCKED · $${unlockCost(id)} BAGS`, 1.6);
    },
  });
}

function refreshPlay() {
  if (!isUnlocked(selectedId)) ui.setPlayLabel(`UNLOCK · $${unlockCost(selectedId)}`, true);
  else ui.setPlayLabel('RUN IT', false);
}

async function boot() {
  ui.boot('LOADING THE TRENCH…');
  roster = await loadRoster();
  unlocked = new Set([...STARTERS, ...loadUnlocked()]);
  selectedId = roster.characters.find((c) => isUnlocked(c.id))?.id || roster.characters[0]?.id;
  ui.setBank(bank);
  ui.buildWanted(LINEUP.map((slot) => copById(slot.id)));
  rebuildRoster();
  ui.bindTouch(input);
  refreshPlay();
  ui.boot('STAGING THE TRENCH…');
  applyMenuLook();
  track = new Track(scene);
  await track.load();
  applyMenuLook();
  track.prepareMenu();
  await weather.sky?.attachSun?.();
  weather.sky?.setViewDir?.(-1);
  buildStage();
  await stageCops();
  await showPreview(selectedId);
  frameMenuCam();
  mode = 'splash';
  ui.splashReady();
}

function applyMenuLook() {
  weather.apply(DAY);
  key.position.set(8, 16, 6);
  if (track) track.setTheme(DAY);
}

function buildStage() {
  if (stage) return;
  const group = new THREE.Group();
  group.name = 'menu-stage';

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.016, 12, 64),
    new THREE.MeshStandardMaterial({
      color: 0x14f195,
      emissive: 0x14f195,
      emissiveIntensity: 1.55,
      metalness: 0.25,
      roughness: 0.3,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.018;
  group.add(ring);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.01, 10, 64),
    new THREE.MeshStandardMaterial({
      color: 0x9945ff,
      emissive: 0x9945ff,
      emissiveIntensity: 1.15,
      metalness: 0.25,
      roughness: 0.32,
    }),
  );
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.016;
  group.add(ring2);

  const runnerSpot = new THREE.SpotLight(0xfff0dd, 10, 5.2, 0.36, 0.55, 1.45);
  runnerSpot.position.set(0, 2.85, 2.55);
  runnerSpot.target.position.set(0, 0.95, 0);
  group.add(runnerSpot);
  group.add(runnerSpot.target);

  const ringGlow = new THREE.PointLight(0x14f195, 0.45, 1.6, 2);
  ringGlow.position.set(0, 0.2, 0);
  group.add(ringGlow);

  const rimG = new THREE.DirectionalLight(0x14f195, 0.35);
  rimG.position.set(-4.8, 2.6, -2.8);
  rimG.target.position.set(0, 0.9, 0);
  group.add(rimG);
  group.add(rimG.target);

  const rimP = new THREE.DirectionalLight(0x9945ff, 0.32);
  rimP.position.set(4.8, 2.6, -2.8);
  rimP.target.position.set(0, 0.9, 0);
  group.add(rimP);
  group.add(rimP.target);

  for (const slot of LINEUP) {
    const face = new THREE.SpotLight(0xffefe4, 9, 4.0, 0.4, 0.52, 1.4);
    face.position.set(slot.x, 2.05, slot.z + 2.05);
    face.target.position.set(slot.x, 1.02, slot.z);
    group.add(face);
    group.add(face.target);

    const fill = new THREE.PointLight(0xffe6d4, 3.2, 2.6, 2);
    fill.position.set(slot.x, 1.42, slot.z + 0.85);
    group.add(fill);
  }

  scene.add(group);
  stage = group;
}

async function stageCops() {
  lineup = [];
  await Promise.all(
    LINEUP.map(async (slot) => {
      const entry = roster.cops.find((c) => c.id === slot.id);
      const meta = copById(slot.id);
      if (!entry) return;
      try {
        const gltf = await loadGltf(entry.file);
        const mounted = mountModel(gltf, { targetHeight: 1.74, yaw: FACE_YAW + (slot.yaw || 0) });
        mounted.root.position.set(slot.x, 0, slot.z);
        mounted.root.name = `lineup-${slot.id}`;
        const plate = makeWantedPlate(meta.name, meta.caption, { y: slot.plateY || 2.4 });
        mounted.root.add(plate);
        const idle = playMenuIdle(mounted, { role: 'cop' });
        scene.add(mounted.root);
        lineup.push({ id: slot.id, root: mounted.root, meta, ...idle });
      } catch (err) {
        console.warn('[menu] cop failed', slot.id, err);
      }
    }),
  );
}

function setLineupVisible(on) {
  for (const c of lineup) {
    c.root.visible = on;
    c.mixer.timeScale = on ? 1 : 0;
  }
  if (stage) stage.visible = on;
}

function frameMenuCam() {
  camera.fov = 50;
  camera.aspect = innerWidth / innerHeight;
  // Compose the 3D lineup into the middle band — leave the bottom dock for cards.
  const extra = Math.round(innerHeight * 0.30);
  camera.setViewOffset(innerWidth, innerHeight + extra, 0, extra, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
  camera.position.set(0, 2.05, 7.35);
  camera.lookAt(0, 1.12, -1.6);
  neonA.position.set(-3.4, 2.5, 2.6);
  neonB.position.set(3.4, 2.5, 2.6);
}

function frameMenuLights() {
  neonA.position.set(-3.4, 2.5, 2.6);
  neonB.position.set(3.4, 2.5, 2.6);
}

async function showPreview(id) {
  const gen = ++previewGen;
  clearPreview();
  const entry = roster.characters.find((c) => c.id === id);
  if (!entry) return;
  const gltf = await loadGltf(entry.file);
  if (gen !== previewGen) return;
  const mounted = mountModel(gltf, { targetHeight: 1.78, yaw: FACE_YAW });
  mounted.root.position.set(0, 0, 0);
  scene.add(mounted.root);
  const idle = playMenuIdle(mounted, { role: 'runner' });
  preview = { root: mounted.root, ...idle };
  frameMenuCam();
}

function clearPreview() {
  if (preview) scene.remove(preview.root);
  preview = null;
}

function clearRun() {
  audio.endRun();
  if (runner) scene.remove(runner.root);
  if (cop) scene.remove(cop.group || cop.root);
  if (spawn) scene.remove(spawn.group);
  runner = cop = spawn = follow = null;
}

async function enterMenu() {
  if (busy) return;
  clearRun();
  audio.update({ playing: false, distance: 0, speed: 0, tension: 0 });
  applyMenuLook();
  weather.sky?.setViewDir?.(-1);
  if (track) track.prepareMenu();
  setLineupVisible(true);
  mode = 'select';
  ui.show('select');
  input.enabled = true;
  ui.setTagLabel(getUsername());
  ui.setBank(bank);
  rebuildRoster();
  refreshPlay();
  await showPreview(selectedId || roster.characters[0].id);
  frameMenuCam();
}

async function startRun(id) {
  if (busy) return;
  if (!isUnlocked(id)) {
    tryUnlock(id);
    return;
  }
  busy = true;
  mode = 'loading';
  ui.selectLoading(true, `LOADING ${id.toUpperCase()}…`);
  try {
    clearPreview();
    clearRun();
    setLineupVisible(false);
    selectedId = id;
    sol = 0;
    const char = roster.characters.find((c) => c.id === id);
    const gltf = await loadGltf(char.file);
    const mounted = mountModel(gltf, { targetHeight: 1.7, yaw: FACE_YAW });
    runner = new Runner(mounted, input);
    scene.add(runner.root);

    const meta = COPS[(Math.random() * COPS.length) | 0];
    const copEntry = roster.cops.find((c) => c.id === meta.id);
    if (!copEntry?.file) {
      console.error('[cop] FAILED no roster entry for', meta.id);
    }
    const cgltf = await loadGltf(copEntry.file);
    if (!cgltf?.scene) console.error('[cop] FAILED load', copEntry.file);
    else console.log('[cop] loaded', meta.id, copEntry.file, 'clips', Object.keys(cgltf.animations || {}).length);
    const cm = mountModel(cgltf, { targetHeight: 1.76, yaw: FACE_YAW });
    cop = new Chaser(cm, meta.name, meta);
    cop.root.visible = false;
    scene.add(cop.root);
    lastCatcher = cop.name;

    spawn = new Spawner(scene);
    if (!track) track = new Track(scene);
    await Promise.all([track.ready ? Promise.resolve() : track.load(), spawn.load()]);

    const theme = weather.pick();
    track.setTheme(theme);
    track.setHorizonDir(1);
    weather.sky?.setViewDir?.(1);
    track.beginRun(0);

    follow = new ChaseCam(camera, runner);
    follow.snap();

    mode = 'play';
    input.enabled = true;
    ui.selectLoading(false);
    ui.show('hud');
    audio.unlock();
    audio.beginRun();
    ui.setTagLabel(getUsername());
    ui.hud({ distance: 0, sol: 0, best, powers: runner.powers, powerMax: runner.powerMax, chaser: cop.name, chased: false, tension: 0 });
    ui.say(`${theme.name}. CLEAN RUN — DON'T GET SLOPPY.`, 2.2);
  } catch (err) {
    console.error('[run] failed', err);
    ui.selectLoading(false);
    ui.say(String(err), 3);
    mode = 'select';
    ui.show('select');
  } finally {
    busy = false;
  }
}

function crash() {
  runner.alive = false;
  if (runner.root) runner.root.visible = false;
  cop.poseForCloseup();
  audio.endRun();
  audio.catchSting();
  lastCatcher = cop.name;
  catchBest = runner.distance > best;
  if (catchBest) best = saveBest(runner.distance);
  postScore(runner.distance, sol, selectedId);
  bank += sol;
  localStorage.setItem(BANK_KEY, String(Math.floor(bank)));
  ui.setBank(bank);
  catchT = 1.55;
  mode = 'catch';
  follow.faceCloseup(cop, true);
  ui.beginCatch(cop.name);
}

function tickCatch(dt) {
  catchT -= dt;
  runner?.mixer.update(dt);
  cop?.update(dt, runner);
  follow?.faceCloseup(cop, false);
  if (catchT <= 0) {
    lastLine = ui.rugged(cop.name, runner.distance, sol, best, catchBest);
    mode = 'rugged';
    if (!getUsername()) ui.showName('');
  }
}

async function openBoard() {
  const name = getUsername();
  ui.showBoard({ rows: [], you: name ? `TAG ${name}` : 'NO TAG YET', status: 'LOADING…', username: name });
  if (!boardReady()) {
    ui.showBoard({ rows: [], you: name ? `TAG ${name}` : 'NO TAG YET', status: 'BOARD OFFLINE — SUPABASE NOT LINKED', username: name });
    return;
  }
  try {
    const [rows, stand] = await Promise.all([fetchBoard(40), fetchStanding(name)]);
    const you = name
      ? stand?.rank
        ? `${name}  ·  BEST ${stand.best}m  ·  RANK #${stand.rank}`
        : `${name}  ·  NO BOARD RUNS YET`
      : 'NO TAG YET';
    ui.showBoard({ rows, you, status: rows.length ? '' : 'EMPTY BOARD. FIRST CLEAN RUN TAKES #1.', username: name });
  } catch (err) {
    ui.showBoard({ rows: [], you: name || 'NO TAG YET', status: String(err?.message || err), username: name });
  }
}

async function postScore(distance, bags, character) {
  const name = getUsername();
  if (!name) return;
  const who = roster?.characters?.find((c) => c.id === character)?.name || character || '';
  try {
    const sent = await submitRun({ username: name, distance, bags, character: who });
    if (sent?.skipped) return;
    const stand = await fetchStanding(name);
    if (stand?.rank) ui.setRuggedRank(`RANK #${stand.rank}  ·  BEST ${stand.best}m`);
    else if (!sent?.ok) ui.setRuggedRank('BOARD MISS');
  } catch (err) {
    console.warn('[board] submit', err);
    ui.setRuggedRank('BOARD MISS');
  }
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  input.enabled = false;
  audio.setPlaying(false);
  audio.update({ playing: false, distance: runner?.distance || 0, speed: runner?.speed || 0, tension: cop?.tension || 0 });
  ui.show('pause');
}

function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  input.enabled = true;
  audio.setPlaying(true);
  ui.show('hud');
}

function tickPlay(dt) {
  runner.update(dt, spawn);
  cop.update(dt, runner, spawn);
  follow.update(dt);
  track.update(runner.z);
  track.updateHorizon(camera);
  const ev = spawn.update(dt, runner);
  if (ev) {
    if (ev.coins) {
      sol += ev.coins;
      const grabbed = Math.max(1, ev.bags || ev.coins);
      const n = Math.min(3, grabbed);
      for (let i = 0; i < n; i++) audio.coin();
      const total = ev.collected || 0;
      audio.cashMilestone(total - grabbed, total);
    }
    if (ev.power) {
      runner.give(ev.power.id, ev.power.duration);
      audio.power(ev.power.id);
      ui.say(`${ev.power.label} ON.`, 1.6);
    }
    if (ev.near) {
      // Shield ate a registered hit. No chase yet → start it. Already chasing → still saved.
      const started = cop.alert(runner);
      console.log(`[PLAYER HIT] chase=${cop.engaged ? 'on' : 'off'} result=${started ? 'started-chase (shield)' : 'shield-ate'}`);
      audio.nearMiss();
      ui.say(started ? `${cop.name} SAW THAT.` : 'SHIELD BROKE — HE\'S STILL ON YOU.', 1.8);
    }
    if (ev.hit) {
      if (cop.canCatch()) {
        console.log(`[PLAYER HIT] chase=on result=caught gap=${cop.chaseGap.toFixed(2)}`);
        crash();
      } else {
        cop.alert(runner);
        runner.bump();
        console.log(`[PLAYER HIT] chase=off→on result=started-chase`);
        audio.copStumble();
        ui.say(`${cop.name} IS ON YOU.`, 2.0);
      }
    }
  }
  if (runner.justJumped) audio.jump();
  if (runner.justSlid) audio.slide();
  if (runner.justLanded) audio.land();
  if (runner.justMounted) audio.ramp();
  if (cop.justStumbled) audio.copStumble();
  neonA.position.z = runner.z + 4;
  neonB.position.z = runner.z + 10;
  weather.update(dt, runner.z, runner.x);
  audio.footsteps(dt, runner.alive && runner.grounded && !runner.sliding, runner.speed);
  audio.copSteps(dt, cop, runner.alive);
  audio.update({
    playing: true,
    distance: runner.distance,
    speed: runner.speed,
    tension: cop.tension,
    close: cop.tension > 0.5,
  });
  ui.hud({
    distance: runner.distance,
    sol,
    best,
    powers: runner.powers,
    powerMax: runner.powerMax,
    chaser: cop.name,
    chased: cop.engaged,
    tension: cop.tension,
  });
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'select') {
    menuT += dt;
    if (preview) {
      preview.root.rotation.y += dt * 0.28;
      tickMenuIdle(preview, dt, menuT);
    }
    for (const c of lineup) tickMenuIdle(c, dt, menuT);
    frameMenuLights();
    weather.update(dt, 0, 0);
    track?.updateHorizon?.(camera);
  }
  if (mode === 'play') tickPlay(dt);
  if (mode === 'catch') tickCatch(dt);
  if (mode === 'rugged') {
    runner?.mixer.update(dt);
    cop?.update(dt, runner);
    follow?.faceCloseup(cop, false);
  }
  if (mode === 'select' && input._pressed.has('Enter') && selectedId) {
    audio.unlock();
    if (isUnlocked(selectedId)) startRun(selectedId);
    else tryUnlock(selectedId);
  }
  if (mode === 'rugged' && input._pressed.has('Space')) {
    const blocked = !document.getElementById('name-overlay')?.hidden || !document.getElementById('board-overlay')?.hidden;
    if (!blocked && selectedId && isUnlocked(selectedId) && getUsername()) startRun(selectedId);
  }
  if ((input._pressed.has('Escape') || input._pressed.has('KeyP')) && !busy) {
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
  }
  ui.update(dt, 1 / Math.max(dt, 1 / 120));
  renderer.render(scene, camera);
  input.endFrame();
}

window.__pumprun = {
  get mode() {
    return mode;
  },
  get roster() {
    return roster;
  },
  get runner() {
    return runner;
  },
  get cop() {
    return cop;
  },
  get spawn() {
    return spawn;
  },
  get lineup() {
    return lineup;
  },
  get bank() {
    return bank;
  },
  get unlocked() {
    return [...unlocked];
  },
  get assetLog() {
    return [...(track?.worldLog || []), ...(spawn?.assetLog || [])];
  },
  get placeLog() {
    return spawn?.placeLog || [];
  },
};

boot().catch((err) => {
  console.error(err);
  ui.boot(String(err));
});
frame();
