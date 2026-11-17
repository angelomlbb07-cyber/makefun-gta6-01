// All sound is synthesised with WebAudio — no audio files, no network. Engine hum, sirens,
// thuds, blips and jingles from oscillators and filtered noise. Everything is guarded so the
// game plays fine where audio is unavailable (headless screenshots included).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is best-effort.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 800;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Audio is best-effort.
    }
  }

  return {
    resume,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.35;
      if (muted) this.engine(0, false);
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum; speed 0..1, on/off. */
    engine(speed, on) {
      if (!ensure() || muted) {
        if (engineOsc) {
          try { engineOsc.stop(); } catch { /* already stopped */ }
          engineOsc = null;
        }
        return;
      }
      try {
        if (!on) {
          if (engineOsc) {
            engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          }
          return;
        }
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 420;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speed * 130, ctx.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(0.05 + speed * 0.05, ctx.currentTime, 0.08);
      } catch {
        // Audio is best-effort.
      }
    },
    /** Two-tone police siren loop while wanted. */
    siren(on) {
      if (!ensure() || muted) {
        if (sirenOsc) {
          try { sirenOsc.stop(); } catch { /* already stopped */ }
          sirenOsc = null;
        }
        return;
      }
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'triangle';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 1.4;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 140;
          lfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          lfo.start();
          sirenOsc.frequency.value = 780;
          sirenOsc._lfo = lfo;
        } else if (!on && sirenOsc) {
          try { sirenOsc._lfo.stop(); } catch { /* already stopped */ }
          try { sirenOsc.stop(); } catch { /* already stopped */ }
          sirenOsc = null;
        }
      } catch {
        // Audio is best-effort.
      }
    },
    punch() {
      noise(0.12, 0.5, 500);
      tone(140, 0.1, 'square', 0.25, 70);
    },
    crash() {
      noise(0.3, 0.7, 400);
      tone(90, 0.25, 'sawtooth', 0.3, 40);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.3);
      setTimeout(() => tone(880, 0.14, 'sine', 0.3), 90);
    },
    complete() {
      tone(523, 0.14, 'triangle', 0.3);
      setTimeout(() => tone(659, 0.14, 'triangle', 0.3), 120);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.3), 240);
    },
    click() {
      tone(700, 0.05, 'square', 0.15);
    },
    busted() {
      tone(440, 0.3, 'sawtooth', 0.3, 220);
      setTimeout(() => tone(220, 0.5, 'sawtooth', 0.3, 110), 250);
    },
  };
}
