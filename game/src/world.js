// Core simulation: grid, raycast vision, guard AI, cameras, lasers, gadgets.
import { TILE, COLS, ROWS, HUD_H, GAITS, GADGET_DEFS, clamp, dist, angleTo, angDiff, makeRng } from './config.js';

export function tileCenterPx(row, col) {
  return { x: col * TILE + TILE / 2, y: HUD_H + row * TILE + TILE / 2 };
}
export function pxToTile(x, y) {
  return { row: Math.floor((y - HUD_H) / TILE), col: Math.floor(x / TILE) };
}

const SIGHT_BLOCK = new Set(['#', 'C', 'P']);
const WALK_BLOCK = new Set(['#', 'C', 'P']);

export function createWorld(level, levelIndex) {
  const rng = makeRng(1000 + levelIndex * 77);
  const tiles = level.map.map((row) => row.split(''));
  const lamps = [];
  const treasures = [];
  let spawn = { row: 2, col: 3 };
  let prize = { row: 8, col: 28 };
  let exit = { row: 14, col: 27 };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = tiles[r][c];
      if (ch === 'S') spawn = { row: r, col: c };
      else if (ch === 'X') prize = { row: r, col: c };
      else if (ch === 'E') exit = { row: r, col: c };
      else if (ch === 'T') treasures.push({ row: r, col: c, taken: false, value: 150 });
      else if (ch === 'L') lamps.push({ row: r, col: c, doused: false });
    }
  }
  for (const [r, c] of level.treasuresExtra) treasures.push({ row: r, col: c, taken: false, value: 150 });

  const sp = tileCenterPx(spawn.row, spawn.col);
  const world = {
    level, levelIndex, tiles, lamps, treasures, spawn, prize, exit,
    time: 0, rng,
    player: {
      x: sp.x, y: sp.y, r: 12, gait: 'walk', hidden: false,
      loot: 0, lootValue: 0, prizeTaken: false, spotted: false, strikes: 0,
      gadgets: { coin: GADGET_DEFS.coin.max, smoke: GADGET_DEFS.smoke.max, douse: GADGET_DEFS.douse.max, flash: GADGET_DEFS.flash.max },
    },
    guards: level.guards.map((g, i) => {
      const wp = g.waypoints.map(([r, c]) => tileCenterPx(r, c));
      return {
        name: g.name, waypoints: wp, pause: g.pause, speed: g.speed,
        x: wp[0].x, y: wp[0].y, angle: 0, state: 'patrol', suspicion: 0,
        wpIndex: 1, pauseT: 0, lookBase: 0, path: [], pathI: 0, repathT: 0,
        investigate: null, searchT: 0, stunT: 0, lastSeen: null, index: i,
      };
    }),
    cameras: (level.cameras || []).map((c) => ({ ...c, x: c.col * TILE + TILE / 2, y: HUD_H + c.row * TILE + TILE / 2 })),
    lasers: (level.lasers || []).map((l) => ({ ...l })),
    coins: [], smokes: [], flashes: [],
    events: [], done: false, failed: false, result: null,
    alarm: 0, heat: 0,
  };
  return world;
}

export function tileChar(w, r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return '#';
  return w.tiles[r][c];
}
export function walkable(w, r, c) { return !WALK_BLOCK.has(tileChar(w, r, c)); }
export function blocksSight(w, r, c) { return SIGHT_BLOCK.has(tileChar(w, r, c)); }

export function los(w, x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const { row, col } = pxToTile(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    if (blocksSight(w, row, col)) return false;
  }
  return true;
}

function inSmoke(w, x1, y1, x2, y2) {
  for (const s of w.smokes) {
    // Segment passes through smoke circle?
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((s.x - x1) * dx + (s.y - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    if (dist(s.x, s.y, x1 + dx * t, y1 + dy * t) < s.radius) return true;
  }
  return false;
}

export function lightAt(w, x, y) {
  let light = 0.12; // ambient night
  for (const lamp of w.lamps) {
    if (lamp.doused) continue;
    const lp = tileCenterPx(lamp.row, lamp.col);
    const d = dist(x, y, lp.x, lp.y);
    if (d < 170) light = Math.max(light, 0.95 * (1 - d / 170));
  }
  return clamp(light, 0, 1);
}

export function inGrass(w, x, y) {
  const { row, col } = pxToTile(x, y);
  return tileChar(w, row, col) === 'g';
}

// Can an observer at (ox,oy) facing `angle` with given range/half-angle see the player?
export function canSee(w, ox, oy, angle, range, halfAngle) {
  const p = w.player;
  const d = dist(ox, oy, p.x, p.y);
  if (d > range) return 0;
  const diff = Math.abs(angDiff(angleTo(ox, oy, p.x, p.y), angle));
  if (diff > halfAngle) return 0;
  if (!los(w, ox, oy, p.x, p.y)) return 0;
  if (inSmoke(w, ox, oy, p.x, p.y)) return 0;
  const light = lightAt(w, p.x, p.y);
  const hidden = (light < 0.3 || inGrass(w, p.x, p.y)) && d > 46;
  if (hidden) return 0;
  // Visibility strength: full when lit & close, weaker at range / in dim light.
  const rangeF = 1 - (d / range) * 0.45;
  const lightF = 0.45 + light * 0.55;
  return clamp(rangeF * lightF, 0.15, 1);
}

// Raycast cone polygon points (for rendering).
export function conePolygon(w, ox, oy, angle, range, halfAngle) {
  const pts = [{ x: ox, y: oy }];
  const rays = 26;
  for (let i = 0; i <= rays; i++) {
    const a = angle - halfAngle + (2 * halfAngle * i) / rays;
    let r = range;
    const step = 10;
    for (let d = step; d <= range; d += step) {
      const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
      const { row, col } = pxToTile(x, y);
      if (blocksSight(w, row, col)) { r = d; break; }
    }
    pts.push({ x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r });
  }
  return pts;
}

export function findPath(w, sr, sc, tr, tc) {
  if (!walkable(w, tr, tc)) return null;
  if (sr === tr && sc === tc) return [];
  const key = (r, c) => r * COLS + c;
  const prev = new Map();
  const seen = new Set([key(sr, sc)]);
  const queue = [[sr, sc]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === tr && c === tc) {
      const path = [];
      let cur = key(r, c);
      while (cur !== key(sr, sc)) {
        path.unshift([Math.floor(cur / COLS), cur % COLS]);
        cur = prev.get(cur);
      }
      return path;
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (!walkable(w, nr, nc) || seen.has(key(nr, nc))) continue;
      seen.add(key(nr, nc));
      prev.set(key(nr, nc), key(r, c));
      queue.push([nr, nc]);
    }
  }
  return null;
}

function moveAlongPath(g, w, dt, speed) {
  if (!g.path || g.pathI >= g.path.length) return true;
  const [r, c] = g.path[g.pathI];
  const t = tileCenterPx(r, c);
  const d = dist(g.x, g.y, t.x, t.y);
  const step = speed * dt;
  if (d <= step + 2) { g.x = t.x; g.y = t.y; g.pathI++; return g.pathI >= g.path.length; }
  g.angle = angleTo(g.x, g.y, t.x, t.y);
  g.x += Math.cos(g.angle) * step;
  g.y += Math.sin(g.angle) * step;
  return false;
}

function setGuardPath(w, g, target) {
  const from = pxToTile(g.x, g.y);
  const path = findPath(w, from.row, from.col, target.row, target.col);
  if (path) { g.path = path; g.pathI = 0; }
}

function guardInvestigate(w, g, x, y, strength) {
  if (g.state === 'chase' || g.stunT > 0) return;
  g.suspicion = Math.max(g.suspicion, strength);
  g.lastSeen = { x, y };
  if (g.state !== 'investigate' && g.state !== 'search') {
    g.state = 'investigate';
    const t = pxToTile(x, y);
    setGuardPath(w, g, t);
  }
}

export function noiseEvent(w, x, y, radius) {
  for (const g of w.guards) {
    if (dist(g.x, g.y, x, y) < radius + 60) guardInvestigate(w, g, x, y, 0.6);
  }
}

export function throwCoin(w, tx, ty) {
  const p = w.player;
  if (p.gadgets.coin <= 0) return false;
  p.gadgets.coin--;
  const d = dist(p.x, p.y, tx, ty);
  const range = GADGET_DEFS.coin.throwRange;
  const t = Math.min(1, range / Math.max(1, d));
  const lx = p.x + (tx - p.x) * t, ly = p.y + (ty - p.y) * t;
  w.coins.push({ x: p.x, y: p.y, tx: lx, ty: ly, t: 0, dur: 0.28, landed: false });
  w.events.push({ type: 'coin-throw' });
  return true;
}

export function useSmoke(w) {
  const p = w.player;
  if (p.gadgets.smoke <= 0) return false;
  p.gadgets.smoke--;
  w.smokes.push({ x: p.x, y: p.y, radius: GADGET_DEFS.smoke.radius, t: GADGET_DEFS.smoke.duration });
  w.events.push({ type: 'smoke' });
  return true;
}

export function useDouse(w) {
  const p = w.player;
  if (p.gadgets.douse <= 0) return false;
  let best = null, bestD = GADGET_DEFS.douse.range;
  for (const lamp of w.lamps) {
    if (lamp.doused) continue;
    const lp = tileCenterPx(lamp.row, lamp.col);
    const d = dist(p.x, p.y, lp.x, lp.y);
    if (d < bestD) { best = lamp; bestD = d; }
  }
  if (!best) return false;
  p.gadgets.douse--;
  best.doused = true;
  w.events.push({ type: 'douse' });
  return true;
}

export function useFlash(w) {
  const p = w.player;
  if (p.gadgets.flash <= 0) return false;
  let hit = false;
  for (const g of w.guards) {
    if (dist(g.x, g.y, p.x, p.y) < GADGET_DEFS.flash.range && los(w, g.x, g.y, p.x, p.y)) {
      g.stunT = GADGET_DEFS.flash.stun;
      g.state = 'patrol';
      g.suspicion = 0;
      hit = true;
    }
  }
  if (!hit) return false;
  p.gadgets.flash--;
  w.flashes.push({ x: p.x, y: p.y, t: 0.35 });
  w.events.push({ type: 'flash' });
  return true;
}

function laserOn(laser, t) {
  return ((t + laser.phase) % laser.period) < laser.period * laser.onFrac;
}
export function laserActive(w, laser) { return laserOn(laser, w.time); }

function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(px, py, x1 + dx * t, y1 + dy * t);
}

export function laserBlocksPath(w, x1, y1, x2, y2) {
  for (const l of w.lasers) {
    const a = tileCenterPx(l.y1, l.x1), b = tileCenterPx(l.y2, l.x2);
    // Sample along the movement segment; a sample near the beam is blocked
    // only if the beam is on when the player actually gets there. Checking
    // the beam state at arrival time (sneak and sprint) matters: a crossing
    // started late in the off-window trips the beam mid-step and summons
    // every guard, which is how the autopilot used to get caught.
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / 10));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = x1 + (x2 - x1) * t, sy = y1 + (y2 - y1) * t;
      if (pointSegDist(sx, sy, a.x, a.y, b.x, b.y) >= 12) continue;
      const s = d * t;
      if (laserOn(l, w.time + s / 62) || laserOn(l, w.time + s / 205)) return true;
    }
  }
  return false;
}

export function updateWorld(w, dt, input) {
  if (w.done || w.failed) return;
  w.time += dt;
  const p = w.player;
  w.events.length = 0;

  // --- Player movement ---
  let dx = 0, dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
  }
  p.gait = input.sneak ? 'sneak' : input.sprint ? 'sprint' : 'walk';
  const speed = GAITS[p.gait].speed;
  if (moving) {
    const step = speed * dt;
    const nx = p.x + dx * step;
    const ny = p.y + dy * step;
    if (!collides(w, nx, p.y, p.r)) p.x = nx;
    if (!collides(w, p.x, ny, p.r)) p.y = ny;
    if (p.gait !== 'sneak') {
      const noise = GAITS[p.gait].noise;
      for (const g of w.guards) {
        if (dist(g.x, g.y, p.x, p.y) < noise && g.state !== 'chase') {
          guardInvestigate(w, g, p.x, p.y, 0.35);
        }
      }
    }
  }

  // --- Gadget inputs ---
  if (input.throwCoin) { throwCoin(w, input.throwX, input.throwY); input.throwCoin = false; }
  if (input.smoke) { useSmoke(w); input.smoke = false; }
  if (input.douse) { useDouse(w); input.douse = false; }
  if (input.flash) { useFlash(w); input.flash = false; }

  // --- Coins in flight ---
  for (const c of w.coins) {
    if (c.landed) continue;
    c.t += dt;
    if (c.t >= c.dur) {
      c.landed = true;
      c.landT = w.time;
      noiseEvent(w, c.tx, c.ty, GADGET_DEFS.coin.noise);
      w.events.push({ type: 'coin-land', x: c.tx, y: c.ty });
    }
  }
  // Lerp coin positions from their start (stored in sx/sy on first update).
  for (const c of w.coins) {
    if (c.sx === undefined) { c.sx = c.x; c.sy = c.y; }
    if (!c.landed) {
      const t = Math.min(1, c.t / c.dur);
      c.x = c.sx + (c.tx - c.sx) * t;
      c.y = c.sy + (c.ty - c.sy) * t;
    }
  }
  w.coins = w.coins.filter((c) => !c.landed || w.time - (c.landT || w.time) < 1.2);
  for (const s of w.smokes) s.t -= dt;
  w.smokes = w.smokes.filter((s) => s.t > 0);
  for (const f of w.flashes) f.t -= dt;
  w.flashes = w.flashes.filter((f) => f.t > 0);

  // --- Pickups ---
  for (const t of w.treasures) {
    if (t.taken) continue;
    const tp = tileCenterPx(t.row, t.col);
    if (dist(p.x, p.y, tp.x, tp.y) < 22) {
      t.taken = true;
      p.loot++;
      p.lootValue += t.value;
      w.events.push({ type: 'pickup', value: t.value });
    }
  }
  const pp = tileCenterPx(w.prize.row, w.prize.col);
  if (!p.prizeTaken && dist(p.x, p.y, pp.x, pp.y) < 24) {
    p.prizeTaken = true;
    w.events.push({ type: 'prize', name: w.level.prize });
  }
  const ep = tileCenterPx(w.exit.row, w.exit.col);
  if (p.prizeTaken && dist(p.x, p.y, ep.x, ep.y) < 24) {
    w.done = true;
    w.result = scoreHeist(w);
    w.events.push({ type: 'escaped' });
    return;
  }

  // --- Lasers ---
  for (const l of w.lasers) {
    if (!laserOn(l, w.time)) continue;
    const a = tileCenterPx(l.y1, l.x1), b = tileCenterPx(l.y2, l.x2);
    if (pointSegDist(p.x, p.y, a.x, a.y, b.x, b.y) < 12) {
      for (const g of w.guards) guardInvestigate(w, g, p.x, p.y, 0.7);
      w.events.push({ type: 'laser-trip' });
      // Push the player slightly off the beam so one trip does not repeat every frame.
      p.x += p.x < (a.x + b.x) / 2 ? -14 : 14;
    }
  }

  // --- Cameras ---
  let maxSeen = 0;
  for (const cam of w.cameras) {
    const ang = cam.baseAngle + Math.sin((w.time * Math.PI * 2) / cam.period) * cam.sweep;
    cam.angle = ang;
    const vis = canSee(w, cam.x, cam.y, ang, cam.range, 0.42);
    if (vis > 0) {
      maxSeen = Math.max(maxSeen, vis);
      for (const g of w.guards) guardInvestigate(w, g, p.x, p.y, 0.55);
      w.events.push({ type: 'camera-seen' });
    }
  }

  // --- Guards ---
  let heat = 0;
  for (const g of w.guards) {
    if (g.stunT > 0) {
      g.stunT -= dt;
      heat = Math.max(heat, 0.2);
      continue;
    }
    const vis = canSee(w, g.x, g.y, g.angle, 252, 0.61);
    if (vis > 0) {
      const wasSpotted = p.spotted;
      p.spotted = true;
      g.suspicion = Math.min(1, g.suspicion + vis * 0.82 * dt);
      g.lastSeen = { x: p.x, y: p.y };
      if (!wasSpotted) w.events.push({ type: 'spotted', guard: g.name });
      if (g.suspicion >= 1 && g.state !== 'chase') {
        g.state = 'chase';
        w.events.push({ type: 'chase', guard: g.name });
      } else if (g.suspicion >= 0.55 && g.state === 'patrol') {
        g.state = 'investigate';
        const t = pxToTile(p.x, p.y);
        setGuardPath(w, g, t);
      }
    } else {
      g.suspicion = Math.max(0, g.suspicion - 0.2 * dt);
    }
    heat = Math.max(heat, g.suspicion);

    switch (g.state) {
      case 'patrol': {
        const target = g.waypoints[g.wpIndex];
        if (!g.path || g.pathI >= g.path.length) {
          const t = pxToTile(target.x, target.y);
          const from = pxToTile(g.x, g.y);
          const path = findPath(w, from.row, from.col, t.row, t.col);
          if (path && path.length) { g.path = path; g.pathI = 0; }
          else { g.path = []; g.pathI = 0; }
        }
        if (moveAlongPath(g, w, dt, g.speed)) {
          // Arrived: pause and look around.
          g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
          g.state = 'pause';
          g.pauseT = g.pause;
          g.lookBase = g.angle;
        }
        break;
      }
      case 'pause': {
        g.pauseT -= dt;
        g.angle = g.lookBase + Math.sin((g.pause - g.pauseT) * 2.2) * 1.0;
        if (g.pauseT <= 0) { g.state = 'patrol'; g.path = null; }
        break;
      }
      case 'investigate': {
        const arrived = moveAlongPath(g, w, dt, g.speed * 1.35);
        if (arrived) { g.state = 'search'; g.searchT = 7; g.lookBase = g.angle; }
        break;
      }
      case 'search': {
        g.searchT -= dt;
        g.angle = g.lookBase + Math.sin((7 - g.searchT) * 1.4) * 1.2;
        if (g.searchT <= 0) {
          g.state = 'return';
          const t = pxToTile(g.waypoints[g.wpIndex].x, g.waypoints[g.wpIndex].y);
          setGuardPath(w, g, t);
        }
        break;
      }
      case 'chase': {
        const t = pxToTile(p.x, p.y);
        g.repathT -= dt;
        if (g.repathT <= 0) { setGuardPath(w, g, t); g.repathT = 0.4; }
        moveAlongPath(g, w, dt, g.speed * 1.9);
        if (dist(g.x, g.y, p.x, p.y) < 24) {
          p.strikes++;
          w.events.push({ type: 'caught', guard: g.name, strikes: p.strikes });
          if (p.strikes >= 3) {
            w.failed = true;
            w.result = scoreHeist(w);
            return;
          }
          // Dragged back to the entrance, guards reset.
          const sp2 = tileCenterPx(w.spawn.row, w.spawn.col);
          p.x = sp2.x; p.y = sp2.y;
          for (const gg of w.guards) {
            gg.state = 'patrol'; gg.suspicion = 0; gg.path = null;
            gg.x = gg.waypoints[0].x; gg.y = gg.waypoints[0].y; gg.wpIndex = 1;
          }
        }
        if (g.suspicion < 0.25 && !canSee(w, g.x, g.y, g.angle, 252, 0.61)) {
          g.state = 'return';
          const t2 = pxToTile(g.waypoints[g.wpIndex].x, g.waypoints[g.wpIndex].y);
          setGuardPath(w, g, t2);
        }
        break;
      }
      case 'return': {
        if (moveAlongPath(g, w, dt, g.speed * 1.2)) { g.state = 'patrol'; g.path = null; }
        break;
      }
      default:
        break;
    }
  }
  w.heat = Math.max(heat, maxSeen);
  w.alarm = w.heat;
}

function collides(w, x, y, r) {
  for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, -r], [-r, r], [r, r]]) {
    const { row, col } = pxToTile(x + dx, y + dy);
    if (!walkable(w, row, col)) return true;
  }
  return false;
}

export function scoreHeist(w) {
  const p = w.player;
  const totalTreasure = w.treasures.length;
  const timeBonus = w.done ? Math.max(0, Math.round((w.level.par - w.time) * 10)) : 0;
  const ghostBonus = !p.spotted && w.done ? 500 : 0;
  const score = (w.done ? 1000 : 0) + (p.prizeTaken ? w.level.prizeValue : 0) + p.lootValue + timeBonus + ghostBonus;
  let rank = 'RUCKUS';
  if (w.done) {
    if (!p.spotted && p.loot === totalTreasure && w.time <= w.level.par) rank = 'GHOST';
    else if (!p.spotted) rank = 'SHADOW';
    else if (p.strikes === 0) rank = 'CUTPURSE';
  }
  return {
    level: w.level.name, prize: w.level.prize, done: w.done, failed: w.failed,
    time: Math.round(w.time * 10) / 10, par: w.level.par, rank,
    loot: p.loot, lootTotal: totalTreasure, lootValue: p.lootValue,
    prizeValue: p.prizeTaken ? w.level.prizeValue : 0,
    timeBonus, ghostBonus, spotted: p.spotted, strikes: p.strikes, score,
  };
}
