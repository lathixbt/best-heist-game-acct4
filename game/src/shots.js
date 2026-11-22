// Staged screenshot scenes, all built from the real simulation state.
// Each stages a deterministic frame, then the shooter captures it.
import { createWorld, tileCenterPx } from './world.js';
import { LEVELS } from './levels.js';

export function stageCover() {
  const w = createWorld(LEVELS[0], 0);
  w.time = 31.5;
  // Kestrel crouched at (4,2); the crate at (4,3) sits between him and Dorian.
  const pp = tileCenterPx(4, 2);
  w.player.x = pp.x; w.player.y = pp.y;
  w.player.gait = 'sneak';
  const gp = tileCenterPx(4, 8);
  const g = w.guards[0];
  g.x = gp.x; g.y = gp.y;
  g.angle = Math.PI; // facing left, cone runs into the crate
  g.state = 'patrol';
  g.suspicion = 0.35;
  const g2 = w.guards[1];
  const g2p = tileCenterPx(14, 12);
  g2.x = g2p.x; g2.y = g2p.y;
  g2.angle = -Math.PI / 2;
  g2.state = 'patrol';
  w.heat = 0.35;
  const notes = [
    { x: pp.x, y: pp.y, text: 'YOU: hidden where the cone stops at the crates' },
    { x: gp.x, y: gp.y, text: 'DORIAN: his cone cannot see through cover', below: true },
    { x: tileCenterPx(8, 28).x, y: tileCenterPx(8, 28).y, text: 'THE HARBOR BELL waits across the hall' },
  ];
  return { world: w, notes };
}

export function stageSpotted() {
  const w = createWorld(LEVELS[1], 1);
  w.time = 42.3;
  // Kestrel caught standing in the lamp pool at (8,10); Anselm is on him.
  const pp = tileCenterPx(8, 10);
  w.player.x = pp.x; w.player.y = pp.y;
  w.player.gait = 'sprint';
  w.player.spotted = true;
  const gp = tileCenterPx(8, 14);
  const g = w.guards[0];
  g.x = gp.x; g.y = gp.y;
  g.angle = Math.PI;
  g.state = 'chase';
  g.suspicion = 1;
  const g2 = w.guards[1];
  const g2p = tileCenterPx(9, 18);
  g2.x = g2p.x; g2.y = g2p.y;
  g2.angle = Math.PI;
  g2.state = 'investigate';
  g2.suspicion = 0.7;
  g2.lastSeen = { x: pp.x, y: pp.y };
  const g3 = w.guards[2];
  const g3p = tileCenterPx(14, 10);
  g3.x = g3p.x; g3.y = g3p.y;
  g3.angle = -Math.PI / 2;
  g3.state = 'patrol';
  w.heat = 1;
  const notes = [
    { x: pp.x, y: pp.y, text: 'SPOTTED! The lamplight gave you away' },
    { x: gp.x, y: gp.y, text: 'ANSELM: red cone, closing in fast', below: true },
  ];
  return { world: w, notes };
}

export function stageLure() {
  const w = createWorld(LEVELS[1], 1);
  w.time = 57.8;
  // A coin just landed at (9,20); Beatrix left her post to look at it.
  const coin = tileCenterPx(9, 20);
  w.coins.push({ x: coin.x, y: coin.y, tx: coin.x, ty: coin.y, t: 0.3, dur: 0.28, landed: true, landT: w.time });
  const g2 = w.guards[1];
  const g2p = tileCenterPx(9, 17);
  g2.x = g2p.x; g2.y = g2p.y;
  g2.angle = 0; // facing right, toward the coin
  g2.state = 'investigate';
  g2.suspicion = 0.6;
  g2.lastSeen = { x: coin.x, y: coin.y };
  const g = w.guards[0];
  const gp = tileCenterPx(8, 6);
  g.x = gp.x; g.y = gp.y;
  g.angle = 0;
  g.state = 'patrol';
  const g3 = w.guards[2];
  const g3p = tileCenterPx(14, 20);
  g3.x = g3p.x; g3.y = g3p.y;
  g3.angle = Math.PI / 2;
  g3.state = 'patrol';
  // Kestrel waits in the tall grass at (10,6).
  const pp = tileCenterPx(10, 6);
  w.player.x = pp.x; w.player.y = pp.y;
  w.player.gait = 'sneak';
  w.player.gadgets.coin = 2;
  w.heat = 0.6;
  const notes = [
    { x: coin.x, y: coin.y, text: 'THE COIN: thrown far — the guard went to look' },
    { x: pp.x, y: pp.y, text: 'YOU: waiting in the grass, unseen' },
  ];
  return { world: w, notes };
}
