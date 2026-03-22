/**
 * audio.js — Web Audio: mechanical reel spin + per-reel stop thunks.
 * Layered: motor/bearing drone + sub weight + bandpassed noise scrape + ratchet pulse.
 */

const ReelAudio = (() => {
  let ctx = null;

  let spin = {
    motor: null,
    sub: null,
    scrape: null,
    master: null,
    filter: null,
    noiseG: null,
    interval: null,
    cleanupTimer: null
  };

  /** Stop previous spin immediately (avoids race when restarting). */
  function hardStopSpinGraph() {
    if (spin.interval) {
      clearInterval(spin.interval);
      spin.interval = null;
    }
    if (spin.cleanupTimer) {
      clearTimeout(spin.cleanupTimer);
      spin.cleanupTimer = null;
    }
    [spin.motor, spin.sub].forEach(osc => {
      if (!osc) return;
      try {
        osc.stop();
        osc.disconnect();
      } catch (_) { /* ignore */ }
    });
    spin.motor = null;
    spin.sub = null;
    try {
      if (spin.scrape) {
        spin.scrape.stop();
        spin.scrape.disconnect();
      }
    } catch (_) { /* ignore */ }
    spin.scrape = null;
    if (spin.filter) spin.filter.disconnect();
    if (spin.noiseG) spin.noiseG.disconnect();
    if (spin.master) spin.master.disconnect();
    spin.filter = null;
    spin.noiseG = null;
    spin.master = null;
  }

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

  function spinStopInternal() {
    const c = getCtx();
    const t = c.currentTime;

    if (spin.interval) {
      clearInterval(spin.interval);
      spin.interval = null;
    }

    try {
      if (spin.master) {
        spin.master.gain.cancelScheduledValues(t);
        spin.master.gain.linearRampToValueAtTime(0, t + 0.35);
      }
    } catch (_) { /* ignore */ }

    if (spin.cleanupTimer) clearTimeout(spin.cleanupTimer);
    spin.cleanupTimer = setTimeout(() => {
      spin.cleanupTimer = null;
      hardStopSpinGraph();
    }, 420);
  }

  /**
   * Mechanical reel rotation (real-machine style):
   *  • Saw motor + lowpass = bearing / gearbox hum
   *  • Sine sub = cabinet weight
   *  • Looped noise + bandpass = metal scrape + air
   *  • JS wobble on filter + ~13 Hz gain pulse = teeth / symbols passing
   */
  async function spinStart() {
    await resume();
    hardStopSpinGraph();

    const c = getCtx();
    const t = c.currentTime;

    const master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    spin.master = master;

    const motor = c.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(56, t);
    motor.frequency.linearRampToValueAtTime(74, t + 0.5);

    const motorLP = c.createBiquadFilter();
    motorLP.type = 'lowpass';
    motorLP.frequency.value = 260;
    motorLP.Q.value = 0.75;

    const motorG = c.createGain();
    motorG.gain.value = 0.02;

    motor.connect(motorLP);
    motorLP.connect(motorG);
    motorG.connect(master);
    motor.start(t);
    spin.motor = motor;

    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 61;
    const subG = c.createGain();
    subG.gain.value = 0.032;
    sub.connect(subG);
    subG.connect(master);
    sub.start(t);
    spin.sub = sub;

    const buf = makeNoiseBuffer(4);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.9;

    const noiseG = c.createGain();
    noiseG.gain.value = 0.09;

    src.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(master);
    src.start(t);
    spin.scrape = src;
    spin.filter = filter;
    spin.noiseG = noiseG;

    let wobbleT = 0;
    spin.interval = setInterval(() => {
      wobbleT += 0.065;
      const fq = 360 + Math.sin(wobbleT * 1.05) * 240 + Math.sin(wobbleT * 2.6) * 90;
      try {
        filter.frequency.setTargetAtTime(fq, c.currentTime, 0.042);
      } catch (_) { /* ignore */ }

      const ratchet = 0.072 + Math.sin(wobbleT * 2 * Math.PI * 13.2) * 0.058;
      try {
        noiseG.gain.setTargetAtTime(Math.max(0.042, ratchet), c.currentTime, 0.022);
      } catch (_) { /* ignore */ }
    }, 40);

    master.gain.linearRampToValueAtTime(0.94, t + 0.1);
  }

  async function spinStop() {
    await resume();
    spinStopInternal();
  }

  function playReelStop() {
    const c = getCtx();
    if (c.state === 'suspended') return;

    const t = c.currentTime;

    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(195, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.24, t + 0.004);
    g.gain.linearRampToValueAtTime(0.001, t + 0.11);

    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.13);

    const buf = makeNoiseBuffer(0.06);
    const nSrc = c.createBufferSource();
    nSrc.buffer = buf;
    const nG = c.createGain();
    nG.gain.setValueAtTime(0.075, t);
    nG.gain.linearRampToValueAtTime(0.001, t + 0.045);
    nSrc.connect(nG);
    nG.connect(c.destination);
    nSrc.start(t);
    nSrc.stop(t + 0.06);
  }

  return {
    resume,
    spinStart,
    spinStop,
    playReelStop
  };
})();
