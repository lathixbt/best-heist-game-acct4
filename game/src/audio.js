// WebAudio: soft night drone + rising tension when the alarm climbs. M mutes.
export function createAudio() {
  let ctx = null, master = null, drone = null, droneGain = null, muted = false;
  let tensionOsc = null, tensionGain = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Low drone: two detuned sines.
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneGain.connect(master);
    for (const freq of [55, 55.7, 110.3]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(droneGain);
      o.start();
    }
    // Tension voice, silent until the alarm rises.
    tensionGain = ctx.createGain();
    tensionGain.gain.value = 0;
    tensionGain.connect(master);
    tensionOsc = ctx.createOscillator();
    tensionOsc.type = 'triangle';
    tensionOsc.frequency.value = 220;
    tensionOsc.connect(tensionGain);
    tensionOsc.start();
  }

  function blip(freq, dur, vol, type = 'sine') {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  return {
    ensure,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    setTension(v) {
      if (!ctx || muted) return;
      tensionGain.gain.setTargetAtTime(v * 0.06, ctx.currentTime, 0.3);
      tensionOsc.frequency.setTargetAtTime(220 + v * 160, ctx.currentTime, 0.3);
    },
    onEvent(ev) {
      if (!ctx || muted) return;
      switch (ev.type) {
        case 'pickup': blip(880, 0.18, 0.12); break;
        case 'prize': blip(660, 0.3, 0.14); setTimeout(() => blip(990, 0.35, 0.14), 120); break;
        case 'coin-land': blip(1320, 0.12, 0.1, 'triangle'); break;
        case 'spotted': blip(180, 0.4, 0.2, 'sawtooth'); break;
        case 'chase': blip(140, 0.5, 0.22, 'sawtooth'); break;
        case 'caught': blip(90, 0.7, 0.25, 'sawtooth'); break;
        case 'escaped': blip(523, 0.25, 0.14); setTimeout(() => blip(784, 0.4, 0.14), 160); break;
        default: break;
      }
    },
  };
}
