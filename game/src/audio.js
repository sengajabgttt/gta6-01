// All sound is synthesized with WebAudio: no audio files, no network. A short
// helper builds a tone or a burst of noise, and each game event gets one. The
// engine hum and the police siren are loops whose pitch follows the game.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, gain = 0.2, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.3, lowpass = 1200, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    source.connect(filter);
    filter.connect(g);
    g.connect(master);
    source.start(t0);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSiren() {
    if (!ensure() || sirenOsc || muted) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.05;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let high = false;
    sirenTimer = window.setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
    }, 450);
  }

  function stopSiren() {
    if (sirenTimer) window.clearInterval(sirenTimer);
    sirenTimer = null;
    if (sirenOsc) {
      try {
        sirenOsc.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc = null;
    }
  }

  return {
    /** Call once on the first user gesture; browsers block audio before it. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      startEngine();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) stopSiren();
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** The engine hum follows the player's speed (0 when on foot). */
    setEngine(speed, maxSpeed) {
      if (!ctx || !engineOsc) return;
      const ratio = Math.min(1, speed / maxSpeed);
      engineOsc.frequency.setTargetAtTime(55 + ratio * 130, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.03 + ratio * 0.05, ctx.currentTime, 0.05);
    },
    setSiren(on) {
      if (on) startSiren();
      else stopSiren();
    },
    shot() {
      noise({ dur: 0.12, gain: 0.35, lowpass: 2500 });
      tone({ freq: 180, freqEnd: 60, type: 'square', dur: 0.08, gain: 0.12 });
    },
    enemyShot() {
      noise({ dur: 0.1, gain: 0.2, lowpass: 1800 });
    },
    punch() {
      noise({ dur: 0.08, gain: 0.25, lowpass: 500 });
    },
    crash() {
      noise({ dur: 0.3, gain: 0.4, lowpass: 700 });
      tone({ freq: 90, freqEnd: 40, type: 'sine', dur: 0.25, gain: 0.3 });
    },
    pickup() {
      tone({ freq: 660, dur: 0.09, gain: 0.15 });
      tone({ freq: 990, dur: 0.14, gain: 0.15, when: 0.09 });
    },
    horn() {
      tone({ freq: 370, type: 'square', dur: 0.18, gain: 0.12 });
      tone({ freq: 466, type: 'square', dur: 0.18, gain: 0.1 });
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, dur: 0.16, gain: 0.16, when: i * 0.11 }));
    },
    missionFail() {
      [392, 330, 262].forEach((freq, i) => tone({ freq, dur: 0.2, gain: 0.15, when: i * 0.14 }));
    },
    busted() {
      tone({ freq: 220, freqEnd: 110, type: 'sawtooth', dur: 0.6, gain: 0.2 });
    },
    click() {
      tone({ freq: 880, dur: 0.05, gain: 0.1 });
    },
  };
}
