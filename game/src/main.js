// Game loop + state machine. ?autopilot=1 plays the whole campaign.
// ?shot=cover|spotted|lure stages a screenshot scene; ?shot=win runs the
// autopilot to the campaign results screen.
import { LEVELS, TOTAL_GUARDS, TOTAL_TREASURES } from './levels.js';
import { createWorld, updateWorld } from './world.js';
import { createAutopilot, autopilotInput } from './autopilot.js';
import { drawWorld, drawHUD, drawTitle, drawResults, drawFailed, drawPaused } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { stageCover, stageSpotted, stageLure } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const audio = createAudio();
const input = createInput();

let mode = 'title'; // title | play | heistResult | campaignResult | failed | paused
let levelIndex = 0;
let world = null;
let autopilot = null;
let results = [];
let campaignTotal = 0;
let retries = 0; // autopilot heist restarts after 3 strikes (debug aid)
let levelRetries = 0; // retries on the current heist; a retry plays cautious (prize first, no loot sweep)
let modeT = 0;
let staged = null;
let paused = false;
const isAutopilot = params.get('autopilot') === '1' || params.get('shot') === 'win';
const shotName = params.get('shot');

function startHeist(i, cautious = false) {
  levelIndex = i;
  world = createWorld(LEVELS[i], i);
  autopilot = createAutopilot(world, cautious);
  mode = 'play';
  modeT = 0;
}

function startCampaign(auto) {
  results = [];
  campaignTotal = 0;
  levelRetries = 0;
  startHeist(0);
  if (auto) mode = 'play';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') paused = true;
  if (!document.hidden && mode === 'play') paused = false;
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

function step(dt) {
  if (input.wasPressed('m')) audio.toggleMute();
  if (input.wasPressed('p') && mode === 'play') paused = !paused;

  if (mode === 'title') {
    if (input.wasPressed('enter')) { audio.ensure(); startCampaign(false); }
    else if (input.wasPressed('a')) { audio.ensure(); startCampaign(true); }
    return;
  }
  if (mode === 'failed') {
    if (input.wasPressed('r')) startHeist(levelIndex);
    return;
  }
  if (mode === 'heistResult') {
    modeT += dt;
    if (modeT > (isAutopilot ? 1.2 : 2.5) || input.wasPressed('enter') || input.wasPressed(' ')) {
      if (levelIndex + 1 < LEVELS.length) { levelRetries = 0; startHeist(levelIndex + 1); }
      else { mode = 'campaignResult'; window.__campaignDone = true; }
    }
    return;
  }
  if (mode === 'campaignResult') return;
  if (paused) return;

  // mode === 'play'
  let wi;
  if (isAutopilot) wi = autopilotInput(autopilot, dt);
  else wi = input.readWorldInput(canvas);
  audio.ensure();
  updateWorld(world, dt, wi);
  audio.setTension(world.heat);
  for (const ev of world.events) audio.onEvent(ev);
  if (world.done) {
    results.push(world.result);
    campaignTotal += world.result.score;
    mode = 'heistResult';
    modeT = 0;
  } else if (world.failed) {
    mode = 'failed';
    if (isAutopilot) { retries++; levelRetries++; startHeist(levelIndex, levelRetries >= 1); } // a retry plays cautious
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === 'title') { drawTitle(ctx, TOTAL_GUARDS, TOTAL_TREASURES); return; }
  if (staged) {
    drawWorld(ctx, staged.world, { notes: staged.notes });
    drawHUD(ctx, staged.world, null, 'staged');
    return;
  }
  if (!world) return;
  if (mode === 'campaignResult') { drawResults(ctx, results, campaignTotal); return; }
  drawWorld(ctx, world);
  drawHUD(ctx, world, null, isAutopilot ? 'autopilot' : 'play');
  if (mode === 'heistResult') {
    // Overlay the just-finished heist tally on top of the frozen frame.
    ctx.fillStyle = 'rgba(12, 14, 22, 0.82)';
    ctx.fillRect(240, 260, 800, 220);
    ctx.textAlign = 'center';
    const r = world.result;
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(`${r.level} — ${r.rank}`, 640, 330);
    ctx.fillStyle = '#e8e4d8';
    ctx.font = '20px Georgia, serif';
    ctx.fillText(`${r.prize}  ·  ${r.time}s / par ${r.par}s  ·  ${r.loot}/${r.lootTotal} loot  ·  $${r.score}`, 640, 380);
    ctx.fillStyle = '#9aa3b8';
    ctx.font = '16px Georgia, serif';
    ctx.fillText(levelIndex + 1 < LEVELS.length ? 'Next heist loading…' : 'Campaign complete…', 640, 420);
  }
  if (mode === 'failed') drawFailed(ctx, world.result);
  if (paused) drawPaused(ctx);
}

// --- Staged screenshot modes: render one deterministic frame and signal ready. ---
if (shotName === 'cover' || shotName === 'spotted' || shotName === 'lure') {
  staged = shotName === 'cover' ? stageCover() : shotName === 'spotted' ? stageSpotted() : stageLure();
  world = staged.world;
  mode = 'play';
  render();
  window.__shotReady = true;
} else if (isAutopilot) {
  startCampaign(true);
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}

window.__game = { get world() { return world; }, get mode() { return mode; }, get results() { return results; }, get retries() { return retries; }, get autopilot() { return autopilot; } };
