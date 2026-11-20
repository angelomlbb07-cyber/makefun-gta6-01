// sound.js — WebAudio synth: engine hum, gunshots, sirens, and a radio
// with 4 procedural stations. One job: sound. Everything is synthesised;
// no audio files, no network. All calls are safe before any user gesture.
import { TUNING } from './tuning.js';

export const RADIO_STATIONS = [
  { id: 0, name: 'SOL 98.5 — Sunset FM', scale: [0, 3, 5, 7, 10], base: 220, tempo: 112, wave: 'triangle' },
  { id: 1, name: 'MARINA 101 — Night Drive', scale: [0, 2, 5, 7, 9], base: 196, tempo: 96, wave: 'sawtooth' },
  { id: 2, name: 'PLAZA 88 — Latin Heat', scale: [0, 2, 4, 7, 9], base: 233, tempo: 132, wave: 'square' },
  { id: 3, name: 'DOCK 76 — Lo-Fi Coast', scale: [0, 3, 5, 8, 10], base: 174, tempo: 78, wave: 'sine' },
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioOn = false;
    this.radioStation = 0;
    this.radioTimer = null;
    this.radioStep = 0;
    this.muted = false;
  }

  // Create the AudioContext on first user gesture; safe to call any time.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
      this.startSiren();
      return true;
    } catch (err) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // Continuous engine hum whose pitch follows the player's speed.
  startEngineHum() {
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch (err) { /* sound is optional */ }
  }

  setEngine(speedFrac, driving) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(52 + speedFrac * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedFrac * 0.06 : 0.015, t, 0.1);
  }

  // Two-tone police siren, quiet until wanted.
  startSiren() {
    try {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      lfo.start();
    } catch (err) { /* sound is optional */ }
  }

  setSiren(wanted) {
    if (!this.sirenGain || !this.ctx) return;
    const target = wanted > 0 ? 0.018 + wanted * 0.008 : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  }

  blip(freq, dur, type, gain) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain || 0.12, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(g); g.connect(this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + dur + 0.02);
    } catch (err) { /* ignore */ }
  }

  noiseBurst(dur, gain, filterFreq) {
    if (!this.ctx || this.muted) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1800;
      const g = this.ctx.createGain();
      g.gain.value = gain || 0.25;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start();
    } catch (err) { /* ignore */ }
  }

  shoot() { this.noiseBurst(0.12, 0.3, 2400); this.blip(180, 0.08, 'square', 0.1); }
  enemyShoot() { this.noiseBurst(0.1, 0.14, 1600); }
  punch() { this.noiseBurst(0.08, 0.2, 700); }
  pickup() { this.blip(660, 0.12, 'sine', 0.16); this.blip(990, 0.14, 'sine', 0.14); }
  missionStart() { this.blip(523, 0.14, 'triangle', 0.18); this.blip(784, 0.2, 'triangle', 0.18); }
  missionPassed() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 110));
  }
  missionFailed() { this.blip(392, 0.3, 'sawtooth', 0.16); this.blip(311, 0.4, 'sawtooth', 0.16); }
  crash() { this.noiseBurst(0.25, 0.3, 900); }

  // Radio: a procedural step sequencer per station. Notes are picked from
  // the station's scale so every station sounds different.
  toggleRadio() {
    if (!this.ensure()) return null;
    this.radioOn = !this.radioOn;
    if (this.radioOn) this.startRadioStep();
    else if (this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
    return this.radioOn ? RADIO_STATIONS[this.radioStation] : null;
  }

  nextStation() {
    this.radioStation = (this.radioStation + 1) % RADIO_STATIONS.length;
    this.radioStep = 0;
    return RADIO_STATIONS[this.radioStation];
  }

  startRadioStep() {
    const station = RADIO_STATIONS[this.radioStation];
    const stepMs = 60000 / station.tempo / 2;
    this.radioStep = 0;
    if (this.radioTimer) clearInterval(this.radioTimer);
    this.radioTimer = setInterval(() => {
      if (!this.radioOn || !this.ctx || this.muted) return;
      const step = this.radioStep++;
      const degree = station.scale[step % station.scale.length];
      const octave = Math.floor(step / station.scale.length) % 2;
      const freq = station.base * Math.pow(2, degree / 12 + octave);
      if (step % 2 === 0) this.blip(freq, stepMs / 1000 * 0.9, station.wave, 0.07);
      if (step % 8 === 4) this.blip(station.base / 2, 0.22, 'sine', 0.12);
      if (step % 4 === 2) this.noiseBurst(0.03, 0.05, 4000);
    }, stepMs);
  }

  // Keep the engine + siren in step with the game each frame.
  update(state) {
    if (!this.ctx) return;
    const driving = !state.player.onFoot && state.playerCar;
    const frac = driving ? Math.abs(state.playerCar.speed) / TUNING.carMaxSpeed : 0;
    this.setEngine(frac, !!driving);
    this.setSiren(state.wantedWhole);
  }
}
