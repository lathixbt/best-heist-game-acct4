// Canvas rendering: night floor, lamplight, raycast cones, HUD, screens.
import { TILE, COLS, ROWS, HUD_H, W, H, COLORS, GADGET_DEFS } from './config.js';
import { tileCenterPx, conePolygon, laserActive, pxToTile } from './world.js';

export function drawWorld(ctx, w, opts = {}) {
  const time = w.time;
  // --- Floor ---
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = w.tiles[r][c];
      const x = c * TILE, y = HUD_H + r * TILE;
      if (ch === '#') {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(x, y, TILE, 4);
      } else {
        ctx.fillStyle = (r + c) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        ctx.fillRect(x, y, TILE, TILE);
        if (ch === 'g') {
          ctx.fillStyle = COLORS.grass;
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          ctx.fillStyle = COLORS.grassDark;
          for (let i = 0; i < 5; i++) {
            const gx = x + 8 + i * 6, gy = y + 10 + ((i * 7) % 16);
            ctx.fillRect(gx, gy, 2, 10);
          }
        }
      }
    }
  }
  // --- Crates & pillars ---
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = w.tiles[r][c];
      const x = c * TILE, y = HUD_H + r * TILE;
      if (ch === 'C') {
        ctx.fillStyle = COLORS.crate;
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = COLORS.crateTop;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + TILE - 3, y + TILE - 3);
        ctx.moveTo(x + TILE - 3, y + 3); ctx.lineTo(x + 3, y + TILE - 3); ctx.stroke();
      } else if (ch === 'P') {
        ctx.fillStyle = COLORS.pillar;
        ctx.beginPath(); ctx.arc(x + TILE / 2, y + TILE / 2, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a5468';
        ctx.beginPath(); ctx.arc(x + TILE / 2, y + TILE / 2, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // --- Lamps (glow pools) ---
  for (const lamp of w.lamps) {
    const lp = tileCenterPx(lamp.row, lamp.col);
    if (!lamp.doused) {
      const g = ctx.createRadialGradient(lp.x, lp.y, 6, lp.x, lp.y, 150);
      g.addColorStop(0, 'rgba(255, 210, 122, 0.55)');
      g.addColorStop(1, 'rgba(255, 210, 122, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(lp.x - 150, lp.y - 150, 300, 300);
    }
    ctx.fillStyle = lamp.doused ? '#3a3a3a' : '#ffd27a';
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(lp.x - 2, lp.y - 2, 4, 12);
  }
  // --- Exit hatch ---
  const ep = tileCenterPx(w.exit.row, w.exit.col);
  ctx.fillStyle = w.player.prizeTaken ? COLORS.exit : COLORS.exitLocked;
  ctx.fillRect(ep.x - 16, ep.y - 16, 32, 32);
  ctx.strokeStyle = '#0c0e16';
  ctx.lineWidth = 3;
  ctx.strokeRect(ep.x - 16, ep.y - 16, 32, 32);
  ctx.fillStyle = '#0c0e16';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(w.player.prizeTaken ? 'EXIT' : 'LOCKED', ep.x, ep.y + 5);
  // --- Treasures & prize ---
  for (const t of w.treasures) {
    if (t.taken) continue;
    const tp = tileCenterPx(t.row, t.col);
    ctx.fillStyle = COLORS.treasure;
    ctx.save();
    ctx.translate(tp.x, tp.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }
  if (!w.player.prizeTaken) {
    const pp = tileCenterPx(w.prize.row, w.prize.col);
    const pulse = 1 + Math.sin(time * 3) * 0.12;
    ctx.fillStyle = COLORS.prize;
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.scale(pulse, pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('◆', pp.x, pp.y + 4);
  }
  // --- Lasers ---
  for (const l of w.lasers) {
    const a = tileCenterPx(l.y1, l.x1), b = tileCenterPx(l.y2, l.x2);
    const on = laserActive(w, l);
    ctx.strokeStyle = on ? COLORS.laser : 'rgba(255, 70, 90, 0.25)';
    ctx.lineWidth = on ? 3 : 2;
    if (!on) ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c65a3a';
    ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  // --- Camera cones + bodies ---
  for (const cam of w.cameras) {
    const ang = cam.angle ?? cam.baseAngle;
    const poly = conePolygon(w, cam.x, cam.y, ang, cam.range, 0.42);
    ctx.fillStyle = 'rgba(255, 210, 122, 0.16)';
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.camera;
    ctx.fillRect(cam.x - 8, cam.y - 8, 16, 16);
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath(); ctx.arc(cam.x, cam.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  // --- Guard vision cones ---
  for (const g of w.guards) {
    const col = g.state === 'chase' ? COLORS.coneAlert
      : g.state === 'investigate' || g.state === 'search' ? COLORS.coneSearch
      : g.suspicion > 0.3 ? COLORS.coneSuspicious : COLORS.conePatrol;
    const poly = conePolygon(w, g.x, g.y, g.angle, 252, 0.61);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath(); ctx.fill();
  }
  // --- Guard bodies ---
  for (const g of w.guards) {
    ctx.fillStyle = g.stunT > 0 ? '#8a8f9e' : COLORS.guardCoat;
    ctx.beginPath(); ctx.arc(g.x, g.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.state === 'chase' ? '#ff3b30' : COLORS.guard;
    ctx.beginPath(); ctx.arc(g.x, g.y, 8, 0, Math.PI * 2); ctx.fill();
    // Facing tick
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.angle) * 16, g.y + Math.sin(g.angle) * 16);
    ctx.stroke();
    // Name + state mark
    ctx.fillStyle = '#e8e4d8';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.name, g.x, g.y - 18);
    if (g.state === 'chase') {
      ctx.fillStyle = '#ff3b30'; ctx.font = 'bold 18px Georgia, serif';
      ctx.fillText('!', g.x, g.y - 30);
    } else if (g.state === 'investigate' || g.state === 'search') {
      ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 18px Georgia, serif';
      ctx.fillText('?', g.x, g.y - 30);
    } else if (g.stunT > 0) {
      ctx.fillStyle = '#cdd3e0'; ctx.font = 'bold 14px Georgia, serif';
      ctx.fillText('z z', g.x, g.y - 30);
    }
    // Suspicion arc
    if (g.suspicion > 0.05) {
      ctx.strokeStyle = g.suspicion > 0.55 ? '#ff3b30' : '#ffd27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 18, -Math.PI / 2, -Math.PI / 2 + g.suspicion * Math.PI * 2);
      ctx.stroke();
    }
  }
  // --- Smoke ---
  for (const s of w.smokes) {
    ctx.fillStyle = COLORS.smoke;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.fill();
  }
  for (const f of w.flashes) {
    ctx.fillStyle = 'rgba(255, 255, 230, 0.7)';
    ctx.beginPath(); ctx.arc(f.x, f.y, 60, 0, Math.PI * 2); ctx.fill();
  }
  // --- Player ---
  const p = w.player;
  const crouch = p.gait === 'sneak' ? 0.8 : 1;
  ctx.fillStyle = COLORS.playerDark;
  ctx.beginPath(); ctx.arc(p.x, p.y, 14 * crouch, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.player;
  ctx.beginPath(); ctx.arc(p.x, p.y, 10 * crouch, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0c0e16';
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('KESTREL', p.x, p.y - 20);
  // Coins in flight
  for (const c of w.coins) {
    ctx.fillStyle = COLORS.treasure;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.stroke();
  }
  // --- Night vignette: darken everything except lamp pools and the player ---
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 18, 0.34)';
  ctx.fillRect(0, HUD_H, W, H - HUD_H);
  ctx.restore();

  if (opts.notes) drawNotes(ctx, opts.notes);
}

export function drawNotes(ctx, notes) {
  ctx.font = '13px Georgia, serif';
  for (const n of notes) {
    const tw = ctx.measureText(n.text).width;
    const bw = tw + 8;
    // Clamp the box inside the canvas so long labels near the right edge
    // are never cut off.
    let bx = n.x + 14;
    if (bx + bw > W - 8) bx = W - 8 - bw;
    if (bx < 8) bx = 8;
    const by = n.below ? n.y + 24 : n.y - 34;
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(bx, by + 10); ctx.stroke();
    ctx.fillStyle = 'rgba(12, 14, 22, 0.88)';
    ctx.fillRect(bx - 4, by - 14, tw + 8, 20);
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.6)';
    ctx.strokeRect(bx - 4, by - 14, tw + 8, 20);
    ctx.fillStyle = '#ffd27a';
    ctx.textAlign = 'left';
    ctx.fillText(n.text, bx, by + 1);
  }
}

export function drawHUD(ctx, w, campaign, mode) {
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(0, 0, W, HUD_H);
  ctx.strokeStyle = '#2c3550';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(W, HUD_H); ctx.stroke();
  const p = w.player;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 19px Georgia, serif';
  ctx.fillText(`${w.levelIndex + 1}. ${w.level.name.toUpperCase()}`, 18, 30);
  ctx.font = '14px Georgia, serif';
  ctx.fillStyle = COLORS.hudMuted;
  ctx.fillText(p.prizeTaken ? `ESCAPE THROUGH THE GREEN EXIT` : `STEAL ${w.level.prize.toUpperCase()}`, 18, 54);
  // Alert state + visibility eye
  const state = w.guards.some((g) => g.state === 'chase') ? 'ALERT — RUN' :
    w.heat > 0.55 ? 'SEARCHING' : w.heat > 0.25 ? 'SUSPICIOUS' : 'UNSEEN';
  ctx.fillStyle = state === 'ALERT — RUN' ? '#ff3b30' : state === 'UNSEEN' ? COLORS.exit : '#ffd27a';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText(state, 470, 30);
  ctx.fillStyle = COLORS.hudMuted;
  ctx.font = '13px Georgia, serif';
  ctx.fillText('HEAT', 470, 54);
  ctx.fillStyle = '#222a40';
  ctx.fillRect(520, 44, 120, 10);
  ctx.fillStyle = w.heat > 0.55 ? '#ff3b30' : '#ffd27a';
  ctx.fillRect(520, 44, 120 * Math.min(1, w.heat), 10);
  // Timer / loot / score
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 17px Georgia, serif';
  const mm = Math.floor(w.time / 60), ss = Math.floor(w.time % 60);
  ctx.fillText(`⏱ ${mm}:${String(ss).padStart(2, '0')} / par ${w.level.par}s`, 700, 30);
  ctx.fillText(`◆ ${p.loot}/${w.treasures.length}   $ ${p.lootValue + (p.prizeTaken ? w.level.prizeValue : 0)}`, 700, 54);
  // Gadgets + gait
  ctx.font = '14px Georgia, serif';
  ctx.fillStyle = COLORS.hudMuted;
  ctx.fillText(`Q coin×${p.gadgets.coin}  E smoke×${p.gadgets.smoke}  R douse×${p.gadgets.douse}  F flash×${p.gadgets.flash}`, 990, 30);
  ctx.fillText(`gait: ${p.gait.toUpperCase()}${mode === 'autopilot' ? '  ·  AUTOPILOT' : ''}`, 990, 54);
}

export function drawTitle(ctx, totalGuards, totalTreasures) {
  ctx.fillStyle = '#0c0e16';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.lampGlow;
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('the city sleeps in lamplight', W / 2, 150);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 58px Georgia, serif';
  ctx.fillText('FIVE HEISTS IN THE', W / 2, 230);
  ctx.fillText('CITY OF AURELUNE', W / 2, 300);
  ctx.fillStyle = COLORS.player;
  ctx.font = '20px Georgia, serif';
  ctx.fillText('Kestrel takes what the night leaves unguarded.', W / 2, 350);
  ctx.fillStyle = COLORS.hudMuted;
  ctx.font = '18px Georgia, serif';
  ctx.fillText(`5 heists  ·  ${totalGuards} guards  ·  ${totalTreasures} treasures  ·  4 gadgets`, W / 2, 400);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '16px Georgia, serif';
  ctx.fillText('WASD move  ·  Ctrl sneak  ·  Shift walk  ·  Space sprint', W / 2, 470);
  ctx.fillText('Q coin  ·  E smoke  ·  R douse lamp  ·  F flash  ·  M mute  ·  P pause', W / 2, 500);
  ctx.fillStyle = COLORS.lampGlow;
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('Press ENTER to begin — or A for autopilot', W / 2, 580);
}

export function drawResults(ctx, results, campaignTotal) {
  ctx.fillStyle = 'rgba(12, 14, 22, 0.92)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.lampGlow;
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('THE NIGHT IS DONE', W / 2, 110);
  let y = 180;
  ctx.font = '19px Georgia, serif';
  for (const r of results) {
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(`${r.level} — ${r.prize}  ·  ${r.time}s / par ${r.par}s  ·  ${r.loot}/${r.lootTotal} loot  ·  ${r.rank}  ·  $${r.score}`, W / 2, y);
    y += 42;
  }
  ctx.fillStyle = COLORS.player;
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(`CAMPAIGN TOTAL  $${campaignTotal}`, W / 2, y + 30);
  ctx.fillStyle = COLORS.hudMuted;
  ctx.font = '16px Georgia, serif';
  ctx.fillText('5/5 heists clear  ·  Kestrel was never caught', W / 2, y + 70);
}

export function drawFailed(ctx, result) {
  ctx.fillStyle = 'rgba(20, 8, 10, 0.92)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6b5e';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('CAUGHT IN THE LAMPLIGHT', W / 2, 300);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '19px Georgia, serif';
  ctx.fillText(`${result.level} — three strikes. The night keeps its prizes tonight.`, W / 2, 350);
  ctx.fillStyle = COLORS.hudMuted;
  ctx.fillText('Press R to retry the heist', W / 2, 400);
}

export function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(12, 14, 22, 0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText('PAUSED', W / 2, 380);
}
