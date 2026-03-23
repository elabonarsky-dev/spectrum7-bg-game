/**
 * audio.js — Web Audio: mechanical reel spin + per-reel hard stop.
 *
 * Spin sound layers:
 *   • Sawtooth motor osc  → lowpass → gain  (bearing / gearbox hum)
 *   • Sine sub osc        → gain             (cabinet weight / body)
 *   • Looped white noise  → bandpass → gain  (metal scrape, air rush)
 *   • JS interval modulates filter + gain    (ratchet / symbol-passing pulse)
 *
 * Stop sound: low-frequency thump + high transient click + noise burst.
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

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  async function resume() {
    const c = getCtx();
    if (c.state === 'suspended') await c.resume();
  }

  function makeNoiseBuffer(seconds) {
    const c = getCtx();
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Hard-stop all audio graph nodes immediately (avoids racing on respin). */
  function hardStopSpinGraph() {
    if (spin.interval) { clearInterval(spin.interval); spin.interval = null; }
    if (spin.cleanupTimer) { clearTimeout(spin.cleanupTimer); spin.cleanupTimer = null; }
    [spin.motor, spin.sub, spin.scrape].forEach(node => {
      if (!node) return;
      try { node.stop(); node.disconnect(); } catch (_) {}
    });
    [spin.filter, spin.noiseG, spin.master].forEach(node => {
      if (!node) return;
      try { node.disconnect(); } catch (_) {}
    });
    spin.motor = spin.sub = spin.scrape = null;
    spin.filter = spin.noiseG = spin.master = null;
  }

  function spinStopInternal() {
    const c = getCtx();
    const t = c.currentTime;

    if (spin.interval) { clearInterval(spin.interval); spin.interval = null; }

    try {
      if (spin.master) {
        spin.master.gain.cancelScheduledValues(t);
        spin.master.gain.setValueAtTime(spin.master.gain.value, t);
        spin.master.gain.linearRampToValueAtTime(0, t + 0.45);
      }
    } catch (_) {}

    if (spin.cleanupTimer) clearTimeout(spin.cleanupTimer);
    spin.cleanupTimer = setTimeout(() => {
      spin.cleanupTimer = null;
      hardStopSpinGraph();
    }, 600);
  }

  /**
   * Start the mechanical spin sound.
   * Must be called from a user-gesture handler (button click) for AudioContext
   * autoplay policy to allow audio.
   */
  async function spinStart() {
    await resume();
    hardStopSpinGraph();

    const c = getCtx();
    const t = c.currentTime;

    // Master gain — fades in quickly
    const master = c.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(1.0, t + 0.18);
    master.connect(c.destination);
    spin.master = master;

    // ── Motor: sawtooth → lowpass (bearing hum) ──────────────────────────
    const motor = c.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(52, t);
    motor.frequency.linearRampToValueAtTime(78, t + 0.4);

    const motorLP = c.createBiquadFilter();
    motorLP.type = 'lowpass';
    motorLP.frequency.value = 320;
    motorLP.Q.value = 0.9;

    const motorG = c.createGain();
    motorG.gain.value = 0.12;

    motor.connect(motorLP);
    motorLP.connect(motorG);
    motorG.connect(master);
    motor.start(t);
    spin.motor = motor;

    // ── Sub: sine (cabinet resonance / weight) ────────────────────────────
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 58;

    const subG = c.createGain();
    subG.gain.value = 0.18;

    sub.connect(subG);
    subG.connect(master);
    sub.start(t);
    spin.sub = sub;

    // ── Noise: bandpass scrape / air rush ─────────────────────────────────
    const buf = makeNoiseBuffer(4);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const filter = c.createBiquadFilter();
    filter.type           = 'bandpass';
    filter.frequency.value = 480;
    filter.Q.value         = 0.8;

    const noiseG = c.createGain();
    noiseG.gain.value = 0.22;

    src.connect(filter);
    filter.connect(noiseG);
    noiseG.connect(master);
    src.start(t);
    spin.scrape = src;
    spin.filter = filter;
    spin.noiseG = noiseG;

    // ── Ratchet pulse — modulates filter freq + noise gain ───────────────
    let wobbleT = 0;
    spin.interval = setInterval(() => {
      wobbleT += 0.065;
      const fq = 380 + Math.sin(wobbleT * 1.05) * 280 + Math.sin(wobbleT * 2.6) * 100;
      try {
        filter.frequency.setTargetAtTime(fq, c.currentTime, 0.04);
      } catch (_) {}

      const ratchet = 0.16 + Math.sin(wobbleT * 2 * Math.PI * 13.2) * 0.1;
      try {
        noiseG.gain.setTargetAtTime(Math.max(0.08, ratchet), c.currentTime, 0.02);
      } catch (_) {}
    }, 40);
  }

  async function spinStop() {
    await resume();
    spinStopInternal();
  }

  /**
   * Per-reel hard stop: low thump + sharp transient click + noise burst.
   * Called immediately after each reel's micro-bounce settles.
   */
  function playReelStop() {
    const c = getCtx();
    if (!c || c.state === 'suspended') return;
    const t = c.currentTime;

    // ── Low thump (body / cabinet impact) ────────────────────────────────
    const thump = c.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(160, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.14);

    const thumpG = c.createGain();
    thumpG.gain.setValueAtTime(0, t);
    thumpG.gain.linearRampToValueAtTime(0.65, t + 0.005);
    thumpG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    thump.connect(thumpG);
    thumpG.connect(c.destination);
    thump.start(t);
    thump.stop(t + 0.18);

    // ── Click transient (mechanical latch snap) ───────────────────────────
    const click = c.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(1800, t);
    click.frequency.exponentialRampToValueAtTime(200, t + 0.025);

    const clickG = c.createGain();
    clickG.gain.setValueAtTime(0, t);
    clickG.gain.linearRampToValueAtTime(0.35, t + 0.002);
    clickG.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    const clickLP = c.createBiquadFilter();
    clickLP.type = 'lowpass';
    clickLP.frequency.value = 4000;

    click.connect(clickLP);
    clickLP.connect(clickG);
    clickG.connect(c.destination);
    click.start(t);
    click.stop(t + 0.035);

    // ── Noise burst (metal ratchet texture) ───────────────────────────────
    const nBuf = makeNoiseBuffer(0.08);
    const nSrc = c.createBufferSource();
    nSrc.buffer = nBuf;

    const nLP = c.createBiquadFilter();
    nLP.type = 'lowpass';
    nLP.frequency.value = 3500;

    const nG = c.createGain();
    nG.gain.setValueAtTime(0.28, t);
    nG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    nSrc.connect(nLP);
    nLP.connect(nG);
    nG.connect(c.destination);
    nSrc.start(t);
    nSrc.stop(t + 0.08);
  }

  return { resume, spinStart, spinStop, playReelStop };
})();
