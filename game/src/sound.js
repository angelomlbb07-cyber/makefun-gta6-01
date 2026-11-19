// SOLMAR sound — all audio is synthesized with WebAudio: gunshots,
// pickups, crashes, an engine hum, and four radio stations that play
// simple sequenced melodies. Nothing is loaded from the network.

import { RADIO_STATIONS } from './tuning.js';

export function createSound() {
  const S = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    radioTimer: null,
    beat: 0,
    nextNote: 0,
    enabled: true,
  };

  S.ensure = function () {
    if (S.ctx) {
      if (S.ctx.state === 'suspended') S.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.ctx = new AC();
      S.master = S.ctx.createGain();
      S.master.gain.value = 0.35;
      S.master.connect(S.ctx.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      S.engineOsc = S.ctx.createOscillator();
      S.engineOsc.type = 'sawtooth';
      S.engineOsc.frequency.value = 55;
      S.engineGain = S.ctx.createGain();
      S.engineGain.gain.value = 0;
      const filt = S.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      S.engineOsc.connect(filt);
      filt.connect(S.engineGain);
      S.engineGain.connect(S.master);
      S.engineOsc.start();
      S.startRadio();
    } catch (err) {
      S.ctx = null;
    }
  };

  S.tone = function (freq, dur, type, vol, when = 0) {
    if (!S.ctx || !S.enabled) return;
    const t = S.ctx.currentTime + when;
    const o = S.ctx.createOscillator();
    const g = S.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(S.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  S.noise = function (dur, vol, freq) {
    if (!S.ctx || !S.enabled) return;
    const len = Math.floor(S.ctx.sampleRate * dur);
    const buf = S.ctx.createBuffer(1, len, S.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = S.ctx.createBufferSource();
    src.buffer = buf;
    const filt = S.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq || 2400;
    const g = S.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filt);
    filt.connect(g);
    g.connect(S.master);
    src.start();
  };

  S.shot = function () { S.noise(0.12, 0.4, 1800); S.tone(140, 0.08, 'square', 0.12); };
  S.foeShot = function () { S.noise(0.1, 0.2, 1400); };
  S.pickup = function () { S.tone(660, 0.09, 'sine', 0.25); S.tone(990, 0.12, 'sine', 0.22, 0.08); };
  S.cash = function () { S.tone(880, 0.08, 'triangle', 0.25); S.tone(1174, 0.14, 'triangle', 0.25, 0.07); };
  S.crash = function () { S.noise(0.3, 0.5, 700); };
  S.siren = function () { S.tone(720, 0.35, 'sine', 0.06); S.tone(960, 0.35, 'sine', 0.06, 0.35); };
  S.levelUp = function () {
    [523, 659, 784, 1046].forEach((f, i) => S.tone(f, 0.16, 'triangle', 0.25, i * 0.1));
  };
  S.missionOk = function () {
    [392, 523, 659].forEach((f, i) => S.tone(f, 0.18, 'triangle', 0.25, i * 0.12));
  };

  S.setEngine = function (speed01, driving) {
    if (!S.ctx || !S.engineOsc) return;
    const target = driving ? 0.05 + speed01 * 0.06 : 0;
    S.engineGain.gain.setTargetAtTime(target, S.ctx.currentTime, 0.1);
    S.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, S.ctx.currentTime, 0.08);
  };

  // Radio: a tiny step sequencer. Each station has a root note and a
  // scale pattern; a timer schedules one short note per beat.
  const SCALES = [
    [0, 3, 5, 7, 10, 12, 15],
    [0, 2, 4, 7, 9, 12, 14],
    [0, 3, 5, 6, 10, 12],
    [0, 2, 3, 7, 8, 12],
  ];
  S.startRadio = function () {
    if (S.radioTimer || !S.ctx) return;
    S.radioTimer = setInterval(() => {
      if (!S.ctx || !S.enabled) return;
      const st = RADIO_STATIONS[S.station || 0];
      const scale = SCALES[S.station || 0];
      const now = S.ctx.currentTime;
      if (now < S.nextNote - 0.05) return;
      const step = 60 / st.bpm / 2;
      S.nextNote = Math.max(now + 0.01, S.nextNote + step);
      if (!S.radioOn) return;
      const deg = scale[S.beat % scale.length];
      const freq = st.root * Math.pow(2, deg / 12) * (S.beat % 8 === 6 ? 0.5 : 1);
      const o = S.ctx.createOscillator();
      const g = S.ctx.createGain();
      o.type = st.wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.07, S.nextNote);
      g.gain.exponentialRampToValueAtTime(0.001, S.nextNote + step * 1.8);
      o.connect(g);
      g.connect(S.master);
      o.start(S.nextNote);
      o.stop(S.nextNote + step * 2);
      // Soft bass on the beat.
      if (S.beat % 2 === 0) {
        const b = S.ctx.createOscillator();
        const bg = S.ctx.createGain();
        b.type = 'sine';
        b.frequency.value = st.root / 2;
        bg.gain.setValueAtTime(0.09, S.nextNote);
        bg.gain.exponentialRampToValueAtTime(0.001, S.nextNote + step * 1.6);
        b.connect(bg);
        bg.connect(S.master);
        b.start(S.nextNote);
        b.stop(S.nextNote + step * 2);
      }
      S.beat++;
    }, 60);
  };

  S.station = 0;
  S.radioOn = true;
  S.nextStation = function () {
    S.station = (S.station + 1) % RADIO_STATIONS.length;
    S.beat = 0;
    return RADIO_STATIONS[S.station].name;
  };

  return S;
}
