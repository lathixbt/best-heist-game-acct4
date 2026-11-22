// Shared constants for Five Heists in the City of Aurelune.
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const W = 1280;
export const H = 800;
export const HUD_H = 80;

// Palette: cold dark stone + warm amber lamplight + teal thief.
export const COLORS = {
  floor: '#232a3d',
  floorAlt: '#1e2436',
  wall: '#10131f',
  wallTop: '#2c3550',
  grass: '#2c5233',
  grassDark: '#1f3d26',
  crate: '#4a3620',
  crateTop: '#6b4d2c',
  pillar: '#3a4258',
  lampGlow: '#ffd27a',
  exit: '#39d98a',
  exitLocked: '#3f6b57',
  treasure: '#ffd166',
  prize: '#ff9df5',
  player: '#5ef2dd',
  playerDark: '#1d8f80',
  guard: '#c65a3a',
  guardCoat: '#8f2f2a',
  conePatrol: 'rgba(255, 210, 122, 0.20)',
  coneSuspicious: 'rgba(255, 190, 60, 0.30)',
  coneSearch: 'rgba(255, 150, 40, 0.34)',
  coneAlert: 'rgba(231, 60, 60, 0.42)',
  hudBg: '#0c0e16',
  hudText: '#e8e4d8',
  hudMuted: '#9aa3b8',
  smoke: 'rgba(200, 205, 220, 0.55)',
  laser: 'rgba(255, 70, 90, 0.85)',
  camera: '#7a8699',
};

export const GAITS = {
  sneak: { speed: 62, noise: 0, label: 'SNEAK' },
  walk: { speed: 122, noise: 108, label: 'WALK' },
  sprint: { speed: 205, noise: 185, label: 'SPRINT' },
};

export const GADGET_DEFS = {
  coin: { name: 'Coin', key: 'Q', max: 3, throwRange: 330, noise: 240 },
  smoke: { name: 'Smoke', key: 'E', max: 2, radius: 110, duration: 6 },
  douse: { name: 'Douse', key: 'R', max: 2, range: 170 },
  flash: { name: 'Flash', key: 'F', max: 1, range: 220, stun: 3 },
};

// Seeded deterministic RNG (mulberry32). No Math.random in game logic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
