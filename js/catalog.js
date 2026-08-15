/**
 * Data-driven obstacle / scenery / pickup tables.
 *
 * LANE_SIGN: chase cam looks +Z, which mirrors X. -1 makes A/left = screen-left.
 * yaw: radians added so the model's "front" faces the incoming runner (-Z).
 */
export const LANE_SPACING = 2.05;
export const LANE_SIGN = -1;
export const FACE_YAW = 0;

export function laneWorldX(lane) {
  return lane * LANE_SPACING * LANE_SIGN;
}

export const OBSTACLES = [
  {
    id: 'bus_degen',
    kind: 'bus',
    model: 'assets/models/obstacles/bus_degen.glb',
    clear: 'lane',
    height: 1.78,
    width: 1.58,
    halfW: 0.79,
    halfL: 1.7,
    rampLen: 2.25,
    roofY: 1.7,
    yaw: -Math.PI / 2, // long axis down the lane, FRONT toward the incoming runner
  },
  {
    id: 'bus_trench',
    kind: 'bus',
    model: 'assets/models/obstacles/bus_trench.glb',
    clear: 'lane',
    height: 1.78,
    width: 1.58,
    halfW: 0.79,
    halfL: 1.85,
    rampLen: 2.25,
    roofY: 1.7,
    yaw: -Math.PI / 2,
  },
  {
    id: 'hurdle',
    kind: 'gate',
    model: 'assets/models/obstacles/hurdle.glb',
    sourceFile: 'Meshy_AI_metal_warning_barrier_0814045157_image-to-3d-texture.glb',
    clear: 'jump',
    // Native yellow-black barrier is ~1.55m — keep it BIG so it reads as a jump.
    height: 1.52,
    width: 1.9,
    halfW: 0.95,
    halfL: 0.3,
    jumpClearY: 0.48,
    yaw: 0,
  },
  {
    id: 'gantry',
    kind: 'gate',
    model: 'assets/models/obstacles/gantry.glb',
    sourceFile: 'gantry.glb',
    clear: 'slide',
    height: 2.4,
    width: 1.9,
    halfW: 0.95,
    halfL: 0.16,
    hangMinY: 1.12,
    yaw: 0,
  },
  {
    id: 'car',
    kind: 'car',
    model: 'assets/models/props/car.glb',
    clear: 'lane',
    height: 1.12,
    width: 1.48,
    halfW: 0.74,
    halfL: 1.55,
    yaw: -Math.PI / 2, // front grille toward the incoming runner
  },
];

/** Separate crystal ramp, parked flush against the front of each bus. */
export const RAMP = {
  id: 'ramp',
  model: 'assets/models/obstacles/ramp.glb',
  yaw: -Math.PI / 2, // source slope along +X → rises along +Z
  length: 2.25,
  width: 1.22,
};

export const SCENERY = {
  road: { model: 'assets/models/scenery/road.glb?v=lines2', length: 16 },
  buildings: [
    { model: 'assets/models/scenery/building_apt.glb' },
    { model: 'assets/models/scenery/building_brick.glb' },
    { model: 'assets/models/scenery/building_office_s.glb' },
    { model: 'assets/models/scenery/building_office_t.glb' },
    { model: 'assets/models/scenery/building_sky.glb' },
    { model: 'assets/models/scenery/building_wide.glb' },
    { model: 'assets/models/scenery/building_hi.glb' },
  ],
  lamp: { model: 'assets/models/scenery/lamp.glb' },
  sign: { model: 'assets/models/scenery/neon_sign.glb' },
  railing: { model: 'assets/models/scenery/railing.glb' },
  landmark: { model: 'assets/models/scenery/solangeles.glb?v=sign', height: 46, distance: 150, lift: 6 },
  sun: { model: 'assets/models/scenery/sun.glb' },
};

/**
 * Optional city dressing. Drop a GLB at `model` (via the props pipeline)
 * and it replaces the procedural stand-in automatically.
 */
export const DRESSING = [
  { id: 'tree', model: 'assets/models/props/tree.glb', height: 2.7 },
  { id: 'tree_pine', model: 'assets/models/props/tree_pine.glb', height: 3.1 },
  { id: 'bush', model: 'assets/models/props/bush.glb', height: 0.7 },
  { id: 'bench', model: 'assets/models/props/bench.glb', height: 0.72 },
  { id: 'planter', model: 'assets/models/props/planter.glb', height: 0.62 },
  { id: 'hydrant', model: 'assets/models/props/hydrant.glb', height: 0.68 },
  { id: 'car', model: 'assets/models/props/car.glb', height: 1.15 },
  { id: 'cloud', model: 'assets/models/props/cloud.glb', height: 2.4 },
];

export const PICKUPS = {
  doji: { model: 'assets/models/pickups/doji.glb', score: 1, height: 0.33, label: '$BAGS' },
};

export const POWERS = [
  { id: 'shield', model: 'assets/models/pickups/shield.glb', duration: 12, label: 'SHIELD', color: '#33bbff', height: 0.82, icon: 'assets/ui/shield_emblem.jpg' },
  { id: 'magnet', model: 'assets/models/pickups/magnet.glb', duration: 5, label: 'MAGNET', color: '#ffcc33', height: 0.72 },
  { id: 'double', model: 'assets/models/pickups/double.glb', duration: 7, label: '2× BAGS', color: '#14F195', height: 0.78 },
];

/** Magnet only yanks bags in/near your lane, a short stretch ahead. */
export const MAGNET_RADIUS = 1.38;
export const MAGNET_AHEAD = 6.8;

export const DOJI_STEP = 0.88;
export const DOJI_GRAB = 1.08; // forward grab (meters ahead of the body)
export const DOJI_GRAB_BODY = 0.28; // never collect inside/behind the torso

/** Item GLBs the runner must load. Paths are game-relative. */
export const ITEM_FILES = [
  { id: 'doji', source: 'lowpoly_money_bag', path: 'assets/models/pickups/doji.glb', role: 'pickup' },
  { id: 'bus_degen', source: 'degens_elementary_bus', path: 'assets/models/obstacles/bus_degen.glb', role: 'bus' },
  { id: 'bus_trench', source: 'trenches_city_bus', path: 'assets/models/obstacles/bus_trench.glb', role: 'bus' },
  { id: 'ramp', source: 'crystal_ramp_smooth', path: 'assets/models/obstacles/ramp.glb', role: 'ramp' },
  { id: 'hurdle', source: 'metal_warning_barrier', path: 'assets/models/obstacles/hurdle.glb', role: 'jump' },
  { id: 'gantry', source: 'gantry', path: 'assets/models/obstacles/gantry.glb', role: 'slide' },
  { id: 'car', source: 'lowpoly_car', path: 'assets/models/props/car.glb', role: 'car' },
  { id: 'magnet', source: 'red_magnet_lowpoly', path: 'assets/models/pickups/magnet.glb', role: 'power' },
  { id: 'shield', source: 'lowpoly_shield_aura', path: 'assets/models/pickups/shield.glb', role: 'power' },
  { id: 'double', source: 'lowpoly_2x_diamond', path: 'assets/models/pickups/double.glb', role: 'power' },
];

/** Named 5-0. One is picked at random per run and stays for the whole run. */
export const COPS = [
  { id: 'creeper', name: 'THE CREEPER', caption: 'Shows up last.' },
  { id: 'whale', name: 'THE WHALE', caption: 'Muscles you down.' },
  { id: 'runner', name: 'THE RUNNER', caption: 'First on your tail.' },
  { id: 'chief', name: 'THE CHIEF', caption: 'Calls the shots.' },
];
export const COPS_CYCLE = COPS.map((c) => c.id);

/**
 * Left-to-right rogues gallery. `yaw` is extra Y rotation on top of FACE_YAW
 * so each cop faces the menu camera (+Z), then toes in toward the podium.
 */
export const LINEUP = [
  { id: 'creeper', x: -2.35, z: -0.85, yaw: 0.12, plateY: 2.18 },
  { id: 'whale', x: -0.78, z: -1.35, yaw: 0.04, plateY: 2.24 },
  { id: 'runner', x: 0.78, z: -1.35, yaw: -0.04, plateY: 2.24 },
  { id: 'chief', x: 2.35, z: -0.85, yaw: -0.12, plateY: 2.18 },
];

export function copById(id) {
  return COPS.find((c) => c.id === id) || COPS[0];
}

export function pickRunCop() {
  return COPS[(Math.random() * COPS.length) | 0];
}

export const STARTERS = ['ansem'];
export const UNLOCK_COST = 250;
export const UNLOCK_COSTS = {
  ansem: 0,
  bonk: 250,
  troll: 500,
  gigachad: 1000,
  moodeng: 1500,
  penguin: 2500,
  pumper: 4000,
  trollface: 5000,
};

export function unlockCost(id) {
  if (STARTERS.includes(id)) return 0;
  const n = UNLOCK_COSTS[id];
  return Number.isFinite(n) ? n : 2500;
}
