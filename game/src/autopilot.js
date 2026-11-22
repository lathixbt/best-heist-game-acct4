// Deterministic autopilot: BFS pathfinding with live cone/laser avoidance.
// Drives the world through the same input object a human player uses.
// Lessons baked in: never wait forever on a cone (move through after a cap),
// re-pick the flee tile often, and walk/sprint on safe stretches — sneak only
// when a guard is close.
import { findPath, tileCenterPx, pxToTile, los, lightAt, laserBlocksPath } from './world.js';
import { dist } from './config.js';

function pointVisible(w, x, y) {
  const light = lightAt(w, x, y);
  const { row, col } = pxToTile(x, y);
  const hidden = (light < 0.3 || w.tiles[row]?.[col] === 'g');
  for (const g of w.guards) {
    if (g.stunT > 0) continue;
    const d = dist(g.x, g.y, x, y);
    if (d > 252) continue;
    if (d <= 46) { if (los(w, g.x, g.y, x, y)) return true; continue; }
    if (hidden) continue;
    const ang = Math.atan2(y - g.y, x - g.x);
    let diff = Math.abs(ang - g.angle);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff > 0.61) continue;
    if (!los(w, g.x, g.y, x, y)) continue;
    return true;
  }
  for (const cam of w.cameras) {
    const d = dist(cam.x, cam.y, x, y);
    if (d > cam.range) continue;
    const ang = Math.atan2(y - cam.y, x - cam.x);
    let diff = Math.abs(ang - (cam.angle ?? cam.baseAngle));
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff > 0.42) continue;
    if (!los(w, cam.x, cam.y, x, y)) continue;
    if (hidden && d > 46) continue;
    return true;
  }
  return false;
}

function nearestSafeTile(w) {
  const p = w.player;
  const start = pxToTile(p.x, p.y);
  const seen = new Set([start.row * 32 + start.col]);
  const queue = [[start.row, start.col]];
  while (queue.length) {
    const [r, c] = queue.shift();
    const pt = tileCenterPx(r, c);
    if (!pointVisible(w, pt.x, pt.y) && dist(p.x, p.y, pt.x, pt.y) > 30) return { row: r, col: c };
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 18 || nc < 0 || nc >= 32) continue;
      if (seen.has(nr * 32 + nc)) continue;
      const ch = w.tiles[nr][nc];
      if (ch === '#' || ch === 'C' || ch === 'P') continue;
      seen.add(nr * 32 + nc);
      queue.push([nr, nc]);
    }
  }
  return null;
}

export function createAutopilot(w, cautious = false) {
  return {
    w, path: null, pathI: 0, target: null, targetKind: null,
    waitT: 0, stuckT: 0, lastX: w.player.x, lastY: w.player.y,
    skipSet: new Set(), coinCd: 0, phase: cautious ? 'prize' : 'loot', fleeT: 0, blockCoinThrown: false,
    cautious, detourTried: false,
  };
}

// BFS that avoids tiles currently visible to any guard/camera and steps that
// cross a laser beam. Used as a detour when the direct path is blocked:
// walking around a cone beats standing in front of it.
function findSafePath(w, fromR, fromC, toR, toC) {
  const key = (r, c) => r * 32 + c;
  const prev = new Map();
  const seen = new Set([key(fromR, fromC)]);
  const queue = [[fromR, fromC]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === toR && c === toC) {
      const path = [];
      let k = key(toR, toC);
      while (k !== key(fromR, fromC)) {
        path.unshift([Math.floor(k / 32), k % 32]);
        k = prev.get(k);
      }
      return path;
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 18 || nc < 0 || nc >= 32) continue;
      if (seen.has(key(nr, nc))) continue;
      const ch = w.tiles[nr][nc];
      if (ch === '#' || ch === 'C' || ch === 'P') continue;
      if (!(nr === toR && nc === toC)) {
        const pt = tileCenterPx(nr, nc);
        if (pointVisible(w, pt.x, pt.y)) continue;
        const fromPt = tileCenterPx(r, c);
        if (laserBlocksPath(w, fromPt.x, fromPt.y, pt.x, pt.y)) continue;
      }
      seen.add(key(nr, nc));
      prev.set(key(nr, nc), key(r, c));
      queue.push([nr, nc]);
    }
  }
  return null;
}

function pickTarget(ap) {
  const w = ap.w, p = w.player;
  const here = pxToTile(p.x, p.y);
  const key = (r, c) => r * 32 + c;
  if (ap.phase === 'loot' || ap.phase === 'leftover') {
    let best = null, bestLen = Infinity;
    for (const t of w.treasures) {
      if (t.taken || ap.skipSet.has(key(t.row, t.col))) continue;
      const path = findPath(w, here.row, here.col, t.row, t.col);
      if (path && path.length < bestLen) { bestLen = path.length; best = { row: t.row, col: t.col, kind: 'treasure' }; }
    }
    if (best) return best;
    ap.phase = ap.phase === 'loot' ? 'prize' : 'exit';
  }
  if (ap.phase === 'prize') {
    if (!p.prizeTaken) return { row: w.prize.row, col: w.prize.col, kind: 'prize' };
    // Cautious (post-failure) runs skip the leftover sweep and head straight out.
    ap.phase = ap.cautious ? 'exit' : 'leftover';
    return pickTarget(ap);
  }
  if (ap.phase === 'exit') return { row: w.exit.row, col: w.exit.col, kind: 'exit' };
  return null;
}

function nearestGuardDist(w) {
  let best = Infinity;
  for (const g of w.guards) best = Math.min(best, dist(g.x, g.y, w.player.x, w.player.y));
  return best;
}

export function autopilotInput(ap, dt) {
  const w = ap.w, p = w.player;
  const input = { up: false, down: false, left: false, right: false, sneak: false, sprint: false, throwCoin: false, throwX: 0, throwY: 0, smoke: false, douse: false, flash: false };
  if (w.done || w.failed) return input;
  ap.coinCd = Math.max(0, ap.coinCd - dt);

  // Teleport guard: a caught player is dragged back to the spawn. A jump of
  // >40px in one tick is impossible at any gait (max ~10px), so it must be a
  // respawn — drop the stale path/target and re-plan from the new position.
  if (ap.prevX !== undefined && dist(p.x, p.y, ap.prevX, ap.prevY) > 40) {
    ap.target = null; ap.path = null; ap.pathI = 0;
    ap.waitT = 0; ap.stuckT = 0; ap.fleeT = 0;
  }
  ap.prevX = p.x; ap.prevY = p.y;

  // Gait by nearest guard: sneak close, walk mid-range, sprint when clear.
  const ngd = nearestGuardDist(w);
  if (ngd < 220) { input.sneak = true; }
  else if (ngd > 320) { input.sprint = true; }

  const chasing = w.guards.some((g) => g.state === 'chase');
  const dangerHere = pointVisible(w, p.x, p.y);
  ap.debug = { danger: dangerHere, chasing, pathLen: ap.path ? ap.path.length : -1, pathI: ap.pathI, fleeT: ap.fleeT, waitT: ap.waitT, target: ap.target, targetKind: ap.targetKind };

  // Flee: run to the nearest safe tile, re-picking it often (cones move).
  if (chasing || dangerHere) {
    ap.fleeT += dt;
    const from = pxToTile(p.x, p.y);
    const needNew = !ap.target || ap.targetKind !== 'flee' || ap.pathI >= (ap.path?.length || 0) || ap.fleeT > 1.5;
    if (needNew) {
      const safe = nearestSafeTile(w);
      ap.fleeT = 0;
      if (safe) {
        ap.path = findPath(w, from.row, from.col, safe.row, safe.col);
        ap.pathI = 0;
        ap.target = safe; ap.targetKind = 'flee';
        ap.waitT = 0; ap.blockCoinThrown = false;
      } else {
        // Nowhere safe: sprint straight away from the nearest guard.
        let ng = null, nd = Infinity;
        for (const g of w.guards) { const d = dist(g.x, g.y, p.x, p.y); if (d < nd) { nd = d; ng = g; } }
        if (ng) {
          const a = Math.atan2(p.y - ng.y, p.x - ng.x);
          input.right = Math.cos(a) > 0.3; input.left = Math.cos(a) < -0.3;
          input.down = Math.sin(a) > 0.3; input.up = Math.sin(a) < -0.3;
          input.sprint = true; input.sneak = false;
        }
        return input;
      }
    }
    input.sprint = true; input.sneak = false;
    // Fleeing ignores the step-safety check: the player is ALREADY being
    // seen, so standing in the cone is the worst option — sprint out.
    return stepAlong(ap, input, dt, true);
  }

  // Normal target flow. A leftover flee target is not a real target: once the
  // danger is gone, drop it and pick a treasure/prize/exit instead.
  const from = pxToTile(p.x, p.y);
  if (!ap.target || ap.targetKind === 'flee' || (ap.path && ap.pathI >= ap.path.length)) {
    const t = pickTarget(ap);
    if (!t) return input;
    ap.target = t; ap.targetKind = t.kind;
    ap.path = findPath(w, from.row, from.col, t.row, t.col);
    ap.pathI = 0;
    ap.waitT = 0; ap.stuckT = 0; ap.lastX = p.x; ap.lastY = p.y; ap.blockCoinThrown = false;
  }

  // Stuck detection (only counts time actually spent trying to move).
  if (dist(p.x, p.y, ap.lastX, ap.lastY) > 6) { ap.stuckT = 0; ap.lastX = p.x; ap.lastY = p.y; }
  else ap.stuckT += dt;

  // Lure: if blocked on a cone for a while, throw a coin toward the spawn
  // to pull the blocking guard away.
  if (ap.waitT > 2.5 && !ap.blockCoinThrown && p.gadgets.coin > 0 && ap.coinCd <= 0) {
    const sp = tileCenterPx(w.spawn.row, w.spawn.col);
    input.throwCoin = true;
    input.throwX = sp.x; input.throwY = sp.y;
    ap.coinCd = 6; ap.blockCoinThrown = true;
    return input;
  }
  // If stuck for 10s, skip this treasure (or lure again for prize/exit).
  if (ap.stuckT > 10) {
    if (ap.targetKind === 'treasure') {
      ap.skipSet.add(ap.target.row * 32 + ap.target.col);
      ap.target = null; ap.path = null;
    } else if (p.gadgets.coin > 0 && ap.coinCd <= 0) {
      const sp = tileCenterPx(w.spawn.row, w.spawn.col);
      input.throwCoin = true; input.throwX = sp.x; input.throwY = sp.y;
      ap.coinCd = 6;
    }
    ap.stuckT = 0;
  }

  return stepAlong(ap, input, dt);
}

function stepAlong(ap, input, dt, fleeing = false) {
  const w = ap.w, p = w.player;
  if (!ap.path || ap.pathI >= ap.path.length) { ap.target = null; return input; }
  const [r, c] = ap.path[ap.pathI];
  const node = tileCenterPx(r, c);
  const d = dist(p.x, p.y, node.x, node.y);
  if (d < 8) { ap.pathI++; ap.waitT = 0; ap.blockCoinThrown = false; ap.detourTried = false; return stepAlong(ap, input, dt, fleeing); }

  // Is the next step safe? If not, wait — but never forever: after 5s of
  // waiting, step through anyway (a brief glimpse beats standing in a cone).
  // Fleeing never waits at all (see the caller).
  const stepSafe = fleeing || (!pointVisible(w, node.x, node.y) && !laserBlocksPath(w, p.x, p.y, node.x, node.y));
  if (!stepSafe) {
    ap.waitT += dt;
    // Detour first: if the direct step has been blocked for a while, try a
    // route around the cone/laser instead of standing in front of it.
    if (ap.waitT > 1.5 && !ap.detourTried && ap.target && !fleeing) {
      ap.detourTried = true;
      const here = pxToTile(p.x, p.y);
      const detour = findSafePath(w, here.row, here.col, ap.target.row, ap.target.col);
      const remaining = ap.path.length - ap.pathI;
      if (detour && detour.length > 0 && detour.length <= remaining + 12) {
        ap.path = detour; ap.pathI = 0; ap.waitT = 0;
        return stepAlong(ap, input, dt, fleeing);
      }
    }
    if (ap.waitT <= 5) return input; // stand still (in shadow/grass ideally)
    ap.waitT = 0; // move through now
  } else {
    ap.waitT = Math.max(0, ap.waitT - dt * 2);
  }

  const ang = Math.atan2(node.y - p.y, node.x - p.x);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  if (Math.abs(dx) > Math.abs(dy)) { input.right = dx > 0; input.left = dx < 0; }
  else { input.down = dy > 0; input.up = dy < 0; }
  return input;
}
