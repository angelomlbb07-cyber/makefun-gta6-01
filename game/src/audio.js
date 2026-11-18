// SOLMAR audio: everything synthesized with WebAudio — engine hum, sirens,
// gunshots, radio music. No audio files, no network. Mute with M.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenLfo = null;
let sirenGain = null;
let radioTimer = null;
let muted = false;
let currentStation = 0;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
  if (m) stopSiren();
}

export function isMuted() { return muted; }

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch (e) { /* audio is best-effort */ }
}

export function playGunshot() { blip(900, 0.12, 'square', 0.25, 120); blip(180, 0.08, 'sawtooth', 0.2, 60); }
export function playPunch() { blip(140, 0.08, 'sine', 0.3, 70); }
export function playPickup() { blip(520, 0.1, 'sine', 0.2, 880); }
export function playCash() { blip(660, 0.08, 'sine', 0.2); setTimeout(() => blip(990, 0.12, 'sine', 0.2), 80); }
export function playMissionStart() { [440, 554, 659].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.25), i * 110)); }
export function playMissionPassed() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 120)); }
export function playBusted() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'sawtooth', 0.2), i * 160)); }
export function playCrash() { blip(90, 0.25, 'sawtooth', 0.3, 40); }

export function startEngine() {
  if (!ctx || engineOsc) return;
  try {
    engineOsc = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain.gain.value = 0.0;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400;
    engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  } catch (e) { engineOsc = null; }
}

export function setEngine(speedFrac, on) {
  if (!engineOsc || !engineGain) return;
  engineOsc.frequency.value = 50 + speedFrac * 160;
  engineGain.gain.value = on && !muted ? 0.05 + speedFrac * 0.06 : 0.0;
}

export function startSiren() {
  if (!ctx || sirenOsc || muted) return;
  try {
    sirenOsc = ctx.createOscillator();
    sirenLfo = ctx.createOscillator();
    sirenGain = ctx.createGain();
    const lfoGain = ctx.createGain();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 850;
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 0.7;
    lfoGain.gain.value = 250;
    sirenGain.gain.value = 0.05;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
  } catch (e) { sirenOsc = null; }
}

export function stopSiren() {
  try { if (sirenOsc) sirenOsc.stop(); if (sirenLfo) sirenLfo.stop(); } catch (e) {}
  sirenOsc = null; sirenLfo = null; sirenGain = null;
}

// Tiny generative radio: a looping bass + lead pattern per station mood.
const SCALES = { pop: [0, 2, 4, 7, 9], jazz: [0, 3, 5, 7, 10], synth: [0, 2, 3, 7, 8], talk: [0] };
export function startRadio(stationIndex, bpm) {
  stopRadio();
  currentStation = stationIndex;
  if (!ctx || muted || bpm === 0) return;
  const scale = SCALES[['pop', 'jazz', 'synth', 'talk'][stationIndex]] || SCALES.pop;
  const stepMs = 60000 / bpm / 2;
  let step = 0;
  const base = 110;
  radioTimer = setInterval(() => {
    if (muted || !ctx) return;
    const note = scale[step % scale.length] + 12 * Math.floor(step / scale.length) % 24;
    const f = base * Math.pow(2, note / 12);
    blip(step % 4 === 0 ? f / 2 : f, 0.16, step % 8 === 6 ? 'triangle' : 'sine', 0.07);
    step++;
  }, stepMs);
}

export function stopRadio() {
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
}

export function setStation(i, bpm) {
  startRadio(i, bpm);
}
