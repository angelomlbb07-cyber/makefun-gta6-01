// sound.js — all audio is synthesized with WebAudio: four procedural radio
// stations and every sound effect. No audio files, no network. One job:
// sound. Every function is a safe no-op when there is no AudioContext
// (headless tests, muted browsers), so the game never depends on audio.

import { RADIO } from './tuning.js';

// Chord roots per station (semitone offsets from A2 = 110 Hz), one bar each.
const STATION_CHORDS = [
  [0, 3, 7, 10],    // SOL FM — minor synthwave
  [0, 4, 7, 9],     // CORAL — bright pop
  [0, 5, 7, 12],    // NEON TIDE — night drive
  [0, 2, 5, 7],     // MARINA TALK — sparse talk-bed
];
const BASE_FREQ = 110;

export function createAudio() {
  return {
    ctx: null, master: null, radioGain: null, sfxGain: null,
    station: 0, muted: false, nextNoteTime: 0, step: 0,
    sirenOsc: null, sirenGain: null, started: false,
  };
}

function ensureCtx(audio) {
  if (audio.ctx) return true;
  if (typeof window === 'undefined' || !window.AudioContext) return false;
  try {
    audio.ctx = new window.AudioContext();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    audio.radioGain = audio.ctx.createGain();
    audio.radioGain.gain.value = 0.16;
    audio.radioGain.connect(audio.master);
    audio.sfxGain = audio.ctx.createGain();
    audio.sfxGain.gain.value = 0.5;
    audio.sfxGain.connect(audio.master);
    audio.nextNoteTime = audio.ctx.currentTime + 0.1;
    return true;
  } catch (e) {
    return false;
  }
}

function noteFreq(semi) { return BASE_FREQ * Math.pow(2, semi / 12); }

function playNote(audio, freq, time, dur, type, gain, dest) {
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// Schedule one 8th-note step of the current station's loop.
export function updateRadio(audio, dt) {
  if (!audio.started || audio.muted) return;
  if (!ensureCtx(audio)) return;
  const station = RADIO[audio.station];
  const stepDur = 60 / station.bpm / 2;
  while (audio.nextNoteTime < audio.ctx.currentTime + 0.25) {
    const chords = STATION_CHORDS[audio.station];
    const bar = Math.floor(audio.step / 8) % chords.length;
    const root = chords[bar];
    const inBar = audio.step % 8;
    // Bass on beats, sparkle arp on off-beats, pad on bar start.
    if (inBar % 2 === 0) playNote(audio, noteFreq(root - 12), audio.nextNoteTime, stepDur * 1.8, 'triangle', 0.5, audio.radioGain);
    if (inBar % 2 === 1) playNote(audio, noteFreq(root + 12 + [0, 3, 7, 10][inBar % 4]), audio.nextNoteTime, stepDur * 0.9, 'square', 0.08, audio.radioGain);
    if (inBar === 0) playNote(audio, noteFreq(root), audio.nextNoteTime, stepDur * 7, 'sine', 0.22, audio.radioGain);
    audio.step++;
    audio.nextNoteTime += stepDur;
  }
}

export function startRadio(audio) {
  audio.started = true;
  if (!ensureCtx(audio)) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
}

export function setStation(audio, index) {
  audio.station = ((index % RADIO.length) + RADIO.length) % RADIO.length;
  audio.step = 0;
  if (audio.ctx) audio.nextNoteTime = audio.ctx.currentTime + 0.05;
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
  if (audio.muted) stopSiren(audio);
  return audio.muted;
}

export function playSfx(audio, name) {
  if (!audio.started || audio.muted) return;
  if (!ensureCtx(audio)) return;
  const t = audio.ctx.currentTime;
  if (name === 'shoot') {
    playNote(audio, 880, t, 0.08, 'square', 0.25, audio.sfxGain);
    playNote(audio, 220, t, 0.12, 'sawtooth', 0.2, audio.sfxGain);
  } else if (name === 'explosion') {
    playNote(audio, 60, t, 0.7, 'sawtooth', 0.5, audio.sfxGain);
    playNote(audio, 40, t, 0.9, 'sine', 0.5, audio.sfxGain);
  } else if (name === 'pickup') {
    playNote(audio, 660, t, 0.12, 'sine', 0.3, audio.sfxGain);
    playNote(audio, 990, t + 0.1, 0.18, 'sine', 0.3, audio.sfxGain);
  } else if (name === 'cash') {
    playNote(audio, 1320, t, 0.1, 'sine', 0.25, audio.sfxGain);
    playNote(audio, 1760, t + 0.08, 0.14, 'sine', 0.25, audio.sfxGain);
  } else if (name === 'click') {
    playNote(audio, 440, t, 0.05, 'square', 0.15, audio.sfxGain);
  } else if (name === 'passed') {
    [523, 659, 784, 1046].forEach((f, i) => playNote(audio, f, t + i * 0.12, 0.25, 'triangle', 0.3, audio.sfxGain));
  }
}

// Two-tone police siren while wanted >= 1. Stopped on mute (no leak).
export function updateSiren(audio, wanted) {
  if (!audio.started || audio.muted || wanted < 1) { stopSiren(audio); return; }
  if (!ensureCtx(audio)) return;
  if (!audio.sirenOsc) {
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'sine';
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0.04;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.sirenLfo = audio.ctx.createOscillator();
    audio.sirenLfo.frequency.value = 0.6;
    const lfoGain = audio.ctx.createGain();
    lfoGain.gain.value = 180;
    audio.sirenLfo.connect(lfoGain);
    lfoGain.connect(audio.sirenOsc.frequency);
    audio.sirenLfo.start();
    audio.sirenOsc.frequency.value = 750;
  }
}

export function stopSiren(audio) {
  if (audio.sirenOsc) {
    try { audio.sirenOsc.stop(); audio.sirenLfo.stop(); } catch (e) { /* already stopped */ }
    audio.sirenOsc = null;
    audio.sirenGain = null;
    audio.sirenLfo = null;
  }
}
