/**
 * audio.js — Web Audio spin rumble + per-reel stop thunks (no external files).
 * Unlocks AudioContext on first user gesture (spin button).
 */

const ReelAudio = (() => {
  let ctx = null;
  let noiseSource = null;
  let noiseGain = null;
  let noiseFilter = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  async function resume() {
    const c = getCtx();
    if (c.state === 'suspended') {
      await c.resume();
    }
  }

  function makeNoiseBuffer(seconds) {
    const c = getCtx();
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** Continuous band-pass noise — “drum under spin”. */
  async function spinStart() {
    await resume();
    spinStopInternal();

    const c = getCtx();
    const buf = makeNoiseBuffer(2);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    noiseFilter = c.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 650;
    noiseFilter.Q.value = 0.4;

    noiseGain = c.createGain();
    noiseGain.gain.value = 0;

    src.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(c.destination);

    const t = c.currentTime;
    noiseGain.gain.linearRampToValueAtTime(0.11, t + 0.08);

    src.start();
    noiseSource = src;
  }

  function spinStopInternal() {
    if (!noiseSource || !noiseGain) return;
    try {
      const c = getCtx();
      const t = c.currentTime;
      noiseGain.gain.cancelScheduledValues(t);
      noiseGain.gain.linearRampToValueAtTime(0, t + 0.2);
      const src = noiseSource;
      setTimeout(() => {
        try {
          src.stop();
        } catch (_) { /* already stopped */ }
      }, 250);
    } catch (_) { /* ignore */ }
    noiseSource = null;
    noiseGain = null;
    noiseFilter = null;
  }

  async function spinStop() {
    await resume();
    spinStopInternal();
  }

  /** Short mechanical “clunk” when a reel locks (staggered L→R). */
  function playReelStop() {
    const c = getCtx();
    if (c.state === 'suspended') return;

    const t = c.currentTime;

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.004);
    g.gain.linearRampToValueAtTime(0.001, t + 0.1);

    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    const buf = makeNoiseBuffer(0.05);
    const nSrc = c.createBufferSource();
    nSrc.buffer = buf;
    const nG = c.createGain();
    nG.gain.setValueAtTime(0.06, t);
    nG.gain.linearRampToValueAtTime(0.001, t + 0.04);
    nSrc.connect(nG);
    nG.connect(c.destination);
    nSrc.start(t);
    nSrc.stop(t + 0.05);
  }

  return {
    resume,
    spinStart,
    spinStop,
    playReelStop
  };
})();
