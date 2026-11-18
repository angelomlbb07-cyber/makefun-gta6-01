// SOLMAR — audio.js
// Synthesised WebAudio sound: no audio files, no network. Engine hum that
// follows speed, police sirens, gunshots, cash dings, a mission-passed
// jingle, and four radio stations that each play their own little
// generative melody. Everything is created lazily on the first user gesture
// (browsers block audio before that) and every call is guarded so the game
// never breaks when audio is unavailable.

import { RADIOS } from './config.js';

export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    radioTimer: 0,
    radioStep: 0,
    muted: false,
    started: false,
  };
}

function ensure(audio) {
  if (audio.ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    audio.started = true;
    return true;
  } catch (e) {
    return false;
  }
}

export function resumeAudio(audio) {
  if (!ensure(audio)) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
}

function tone(audio, freq, dur, type, vol, when) {
  if (!audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime + (when || 0);
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* audio is best-effort */ }
}

function noise(audio, dur, vol, lowpass) {
  if (!audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = audio.ctx.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t0);
  } catch (e) { /* audio is best-effort */ }
}

export function playShot(audio) {
  noise(audio, 0.12, 0.35, 2400);
  tone(audio, 180, 0.08, 'square', 0.12);
}

export function playCash(audio) {
  tone(audio, 880, 0.09, 'sine', 0.18);
  tone(audio, 1318, 0.14, 'sine', 0.18, 0.08);
}

export function playPassed(audio) {
  const notes = [523, 659, 784, 1046];
  notes.forEach((n, i) => tone(audio, n, 0.22, 'triangle', 0.22, i * 0.13));
}

export function playBusted(audio) {
  tone(audio, 220, 0.4, 'sawtooth', 0.2);
  tone(audio, 165, 0.6, 'sawtooth', 0.2, 0.3);
}

export function playClick(audio) {
  tone(audio, 660, 0.05, 'square', 0.1);
}

// Engine hum: a low oscillator whose pitch follows the player's speed.
// Called every frame; it creates its nodes once and then just retunes.
export function updateEngine(audio, speedKmh, onFoot) {
  if (!ensure(audio) || audio.muted) return;
  try {
    if (!audio.engineOsc) {
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
    }
    const target = onFoot ? 0 : 0.05 + Math.min(0.16, speedKmh / 1200);
    audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(50 + speedKmh * 0.9, audio.ctx.currentTime, 0.1);
  } catch (e) { /* audio is best-effort */ }
}

// Two-tone siren while any wanted stars are up.
export function updateSiren(audio, wanted) {
  if (!ensure(audio)) return;
  try {
    if (wanted <= 0 || audio.muted) {
      if (audio.sirenGain) audio.sirenGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.2);
      return;
    }
    if (!audio.sirenOsc) {
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
    }
    const t = audio.ctx.currentTime;
    const f = (Math.floor(t * 1.4) % 2 === 0) ? 720 : 540;
    audio.sirenOsc.frequency.setTargetAtTime(f, t, 0.05);
    audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
  } catch (e) { /* audio is best-effort */ }
}

// Radio: a tiny generative sequencer. Each station has its own scale,
// tempo and waveform from config.js, so switching stations changes the
// music you hear. Notes walk the scale with a slow random walk.
export function updateRadio(audio, state, dt) {
  if (!ensure(audio) || audio.muted || !state) return;
  const station = RADIOS[state.radioStation % RADIOS.length];
  audio.radioTimer -= dt;
  if (audio.radioTimer > 0) return;
  const beat = 60 / station.tempo / 2;
  audio.radioTimer = beat;
  try {
    const scale = station.scale;
    const idx = (audio.radioStep * 3 + 2) % scale.length;
    audio.radioStep += 1;
    const degree = scale[idx];
    const freq = 220 * Math.pow(2, degree / 12);
    tone(audio, freq, beat * 0.9, station.wave, 0.08);
    if (audio.radioStep % 4 === 0) tone(audio, freq / 2, beat * 1.8, 'sine', 0.1);
  } catch (e) { /* audio is best-effort */ }
}

export function cycleRadio(state, audio) {
  state.radioStation = (state.radioStation + 1) % RADIOS.length;
  audio.radioStep = 0;
  audio.radioTimer = 0;
}
