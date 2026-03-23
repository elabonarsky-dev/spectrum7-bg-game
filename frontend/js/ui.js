/**
 * ui.js — DOM rendering helpers for Spectrum 7.
 *
 * Reel animation model
 * ────────────────────
 * Each reel is a windowed container (overflow: hidden) 3 tiles tall.
 * The middle tile is the win line.
 *
 * SPIN DIRECTION: strip Y starts LESS negative (early tiles visible),
 * animates toward MORE negative (finalY). Strip moves UP → symbols
 * scroll DOWNWARD through the window, like a physical drum rotating forward.
 *
 * ANIMATION APPROACH: requestAnimationFrame physics loop (NOT CSS transitions).
 * CSS transitions were discarded because they always restart from velocity=0,
 * creating a jarring "bump" at every phase boundary (fast→medium→slow).
 * A physics loop maintains continuous velocity across all phase transitions.
 *
 * Velocity profile per reel:
 *   Phase 1  RAMP   (200 ms)       Linear acceleration 0 → V_MAX.
 *   Phase 2  FAST   (2000 ms)      Constant velocity V_MAX. Heavy blur.
 *   Phase 3  MEDIUM (1400 ms)      Linear deceleration V_MAX → V_SLOW.
 *   Phase 4  SLOW   (2400+stagger) Linear deceleration V_SLOW → 0. Reels stagger L→R.
 *   Clunk                          55 ms snap-back + 95 ms settle (mechanical latch).
 *
 * V_MAX is calculated per-reel so that the integral of velocity over all phases
 * equals exactly the required travel distance (SPIN_EXTRA_TILES × tileH).
 * This guarantees every reel lands precisely on its result tile.
 */

const UI = (() => {

  /** Random tiles before result, seen while drum spins. */
  const SPIN_TILES = 28;

  /** Leading random tiles at start of strip — visible at kick-off. */
  const PRE_SPIN_TILES = 22;

  /** Buffer tiles after result section. */
  const POST_SPIN_TILES = 18;

  /** Total tiles of strip travel across all four phases (ramp+fast+medium+slow). */
  const SPIN_EXTRA_TILES = 42;

  /** Duration constants (ms). FAST_MS = RAMP_MS + full-speed time. */
  const RAMP_MS    = 200;   // spin-up
  const FAST_MS    = 2200;  // RAMP_MS + 2000 at full speed
  const MEDIUM_MS  = 1400;
  const SLOW_MS    = 2400;
  const STAGGER_MS = 480;   // extra ms per reel on slow phase

  /** V_SLOW = V_MAX × this ratio. */
  const V_SLOW_RATIO = 0.15;

  /* ── Strip phase CSS classes (toggled instantly, NOT via CSS transition) ── */

  function setStripPhase(strip, phase) {
    strip.classList.remove(
      'reel-strip--phase-fast',
      'reel-strip--phase-medium',
      'reel-strip--phase-slow',
      'reel-strip--idle'
    );
    if (phase === 'fast')        strip.classList.add('reel-strip--phase-fast');
    else if (phase === 'medium') strip.classList.add('reel-strip--phase-medium');
    else if (phase === 'slow')   strip.classList.add('reel-strip--phase-slow');
    else                         strip.classList.add('reel-strip--idle');
  }

  function stripY(y) {
    return `translate3d(0, ${y}px, 0)`;
  }

  const $palette       = () => document.getElementById('colour-palette');
  const $sequence      = () => document.getElementById('selected-sequence');
  const $reelContainer = () => document.getElementById('reels-container');
  const $btnSpin       = () => document.getElementById('btn-spin');
  const $btnUndo       = () => document.getElementById('btn-undo');
  const $btnReset      = () => document.getElementById('btn-reset');
  const $resultArea    = () => document.getElementById('result-area');
  const $resultMsg     = () => document.getElementById('result-message');

  function getTileH() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--tile-h').trim();
    return parseInt(raw) || 88;
  }

  function createReelTile(colour) {
    const tile = document.createElement('div');
    tile.className = 'reel-tile';
    tile.style.backgroundColor = COLOUR_HEX[colour];
    tile.dataset.colour = colour;

    const label = document.createElement('span');
    label.className = 'reel-label';
    label.textContent = colour;
    tile.appendChild(label);

    return tile;
  }

  /** Random tile run with no adjacent duplicates. */
  function buildRandomRun(count, notFirst = null) {
    const out = [];
    let prev = null;
    for (let p = 0; p < count; p++) {
      let avail = COLOURS.filter(c => c !== prev);
      if (p === 0 && notFirst) avail = avail.filter(c => c !== notFirst);
      const pick = avail[Math.floor(Math.random() * avail.length)];
      out.push(pick);
      prev = pick;
    }
    return out;
  }

  function buildReels() {
    const container = $reelContainer();
    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
      const win = document.createElement('div');
      win.className = 'reel-window';
      win.dataset.reel = i;

      const strip = document.createElement('div');
      strip.className = 'reel-strip reel-strip--idle';

      const prev = COLOURS[(i + 6) % 7];
      const curr = COLOURS[i];
      const next = COLOURS[(i + 1) % 7];
      [prev, curr, next].forEach(c => strip.appendChild(createReelTile(c)));

      win.appendChild(strip);
      container.appendChild(win);
    }
  }

  /**
   * Animate all 7 reels with a continuous physics loop.
   *
   * Strip position coordinate:
   *   startY > finalY  (both negative; startY is less negative)
   *   Each frame:  currentY -= v * dt  (moves strip upward, symbols downward)
   */
  function spinReels(result) {
    const totalReels = 7;

    return new Promise(resolve => {
      const tileH    = getTileH();
      const windows  = document.querySelectorAll('.reel-window');
      let stoppedCount = 0;

      function onAllStopped() {
        resolve();
      }

      windows.forEach((win, i) => {
        const strip = win.querySelector('.reel-strip');

        strip.className   = 'reel-strip';
        strip.style.transition = 'none';
        strip.style.transform  = stripY(0);
        strip.style.filter     = '';
        strip.innerHTML        = '';

        /* ── Build prefix (random tiles before result section) ──────────── */
        const prefix = [];
        let prevPC = null;
        for (let p = 0; p < SPIN_TILES; p++) {
          const isLast = (p === SPIN_TILES - 1);
          let avail = COLOURS.filter(c => c !== prevPC);
          if (isLast) avail = avail.filter(c => c !== result[0] && c !== result[1]);
          const pick = avail[Math.floor(Math.random() * avail.length)];
          prefix.push(pick);
          prevPC = pick;
        }

        /* ── Build preSpin (tiles visible at animation start) ────────────── */
        const preSpin = buildRandomRun(PRE_SPIN_TILES);
        if (preSpin[PRE_SPIN_TILES - 1] === prefix[0]) {
          const prevC = PRE_SPIN_TILES > 1 ? preSpin[PRE_SPIN_TILES - 2] : null;
          const fix = COLOURS.filter(c => c !== prefix[0] && c !== prevC);
          preSpin[PRE_SPIN_TILES - 1] = fix[Math.floor(Math.random() * fix.length)];
        }

        /* ── Populate strip ────────────────────────────────────────────────── */
        preSpin.forEach(c => strip.appendChild(createReelTile(c)));
        prefix.forEach(c  => strip.appendChild(createReelTile(c)));
        result.forEach(c  => strip.appendChild(createReelTile(c)));
        for (let t = 0; t < 3; t++) {
          strip.appendChild(createReelTile(result[(i + t + 1) % 7]));
        }
        buildRandomRun(POST_SPIN_TILES, result[(i + 3) % 7])
          .forEach(c => strip.appendChild(createReelTile(c)));

        /* ── Position maths ────────────────────────────────────────────────
         *
         * centerIndex: strip array index of result[i] (the win-line tile).
         * finalY     : strip transform so result[i] sits on the win line.
         *              win line = 1 tile from top of the 3-tile window.
         *              result[i] at strip offset centerIndex*tileH:
         *              centerIndex*tileH + finalY = tileH  →  finalY = -(centerIndex-1)*tileH
         *
         * startY     : strip starts with early preSpin tiles showing.
         *              startY = finalY + SPIN_EXTRA_TILES*tileH  (less negative)
         *
         * D          : total travel = SPIN_EXTRA_TILES * tileH (positive px)
         */
        const centerIndex = PRE_SPIN_TILES + SPIN_TILES + i;
        const finalY = -((centerIndex - 1) * tileH);
        const startY = finalY + SPIN_EXTRA_TILES * tileH;
        const D      = startY - finalY; // always = SPIN_EXTRA_TILES * tileH

        const slowMsReel = SLOW_MS + i * STAGGER_MS;
        const k          = V_SLOW_RATIO;

        /* ── Solve V_MAX so ∫v dt = D ──────────────────────────────────────
         *
         *   D = ramp_area  + fast_area   + medium_area              + slow_area
         *     = V_MAX*R/2  + V_MAX*(F-R) + (V_MAX+V_SLOW)/2*M      + V_SLOW/2*S
         *     = V_MAX * [R/2 + (F-R) + (1+k)/2*M + k/2*S]
         *
         *   where R=RAMP_MS, F=FAST_MS, M=MEDIUM_MS, S=slowMsReel.
         */
        const R = RAMP_MS;
        const F = FAST_MS;
        const M = MEDIUM_MS;
        const S = slowMsReel;

        const V_MAX  = D / (R/2 + (F - R) + (1 + k)/2 * M + k/2 * S);
        const V_SLOW = k * V_MAX;

        /* Phase boundaries (elapsed ms from tick start) */
        const T_RAMP   = R;          // end of ramp
        const T_FAST   = F;          // end of full-speed
        const T_MEDIUM = F + M;      // end of medium decel
        const T_SLOW   = F + M + S;  // end of slow decel

        /* Linear decel rates (px/ms²) — negative (slowing positive velocity) */
        const A_MEDIUM = (V_SLOW - V_MAX) / M;
        const A_SLOW   = (0      - V_SLOW) / S;

        /* ── Physics state ─────────────────────────────────────────────── */
        let currentY   = startY;
        let startTs    = null;
        let lastTs     = null;
        let lastPhase  = '';

        function applyPhase(phase) {
          if (phase !== lastPhase) {
            setStripPhase(strip, phase);
            lastPhase = phase;
          }
        }

        /* ── Mechanical clunk + completion ──────────────────────────────── */
        function clunkAndComplete() {
          // Micro-bounce: 5 px back toward start (strip moves slightly DOWN,
          // symbols jump UP briefly), then snap back — simulates latch click.
          strip.style.transition = 'transform 55ms ease-out';
          strip.style.transform  = stripY(finalY + 5);
          setTimeout(() => {
            strip.style.transition = 'transform 95ms cubic-bezier(0.25, 1.5, 0.5, 1)';
            strip.style.transform  = stripY(finalY);
            setTimeout(() => {
              strip.style.transition = 'none';
              setStripPhase(strip, 'idle');
              if (typeof ReelAudio !== 'undefined') ReelAudio.playReelStop();
              stoppedCount++;
              if (stoppedCount >= totalReels) onAllStopped();
            }, 95);
          }, 55);
        }

        /* ── rAF physics tick ────────────────────────────────────────────── */
        function tick(ts) {
          if (!startTs) { startTs = ts; lastTs = ts; }

          const elapsed = ts - startTs;
          const dt      = Math.min(ts - lastTs, 32); // cap at ~2 frames to survive tab-switch
          lastTs = ts;

          if (dt <= 0) { requestAnimationFrame(tick); return; }

          /* Velocity (px/ms) — always positive; strip moves in -Y direction */
          let v;
          if (elapsed <= T_RAMP) {
            v = V_MAX * (elapsed / R);      // linear ramp-up
            applyPhase('fast');
          } else if (elapsed <= T_FAST) {
            v = V_MAX;                       // constant speed
            applyPhase('fast');
          } else if (elapsed <= T_MEDIUM) {
            v = V_MAX + A_MEDIUM * (elapsed - T_FAST);
            applyPhase('medium');
          } else if (elapsed <= T_SLOW) {
            v = V_SLOW + A_SLOW * (elapsed - T_MEDIUM);
            applyPhase('slow');
          } else {
            /* Time budget exhausted — snap to final */
            currentY = finalY;
            strip.style.transform = stripY(currentY);
            clunkAndComplete();
            return;
          }

          /* Integrate: strip moves in -Y direction (upward → symbols scroll down) */
          currentY -= v * dt;

          /* Overshoot guard */
          if (currentY <= finalY) {
            currentY = finalY;
            strip.style.transform = stripY(currentY);
            clunkAndComplete();
            return;
          }

          strip.style.transform = stripY(currentY);
          requestAnimationFrame(tick);
        }

        /* ── Kick off ────────────────────────────────────────────────────── */
        strip.style.willChange = 'transform';
        strip.style.transform  = stripY(startY);
        applyPhase('fast');

        /* Double-rAF: guarantees the initial transform is painted before tick. */
        requestAnimationFrame(() => requestAnimationFrame(tick));
      });
    });
  }

  /* ── Palette, sequence, result, controls ──────────────────────────────── */

  function buildPalette(onSelect) {
    const container = $palette();
    container.innerHTML = '';

    COLOURS.forEach(colour => {
      const btn = document.createElement('button');
      btn.className = 'colour-btn';
      btn.dataset.colour = colour;
      btn.style.backgroundColor = COLOUR_HEX[colour];
      btn.textContent = colour;
      btn.addEventListener('click', () => onSelect(colour));
      container.appendChild(btn);
    });
  }

  function renderSequence() {
    const container = $sequence();
    container.innerHTML = '';

    if (GameState.selectedColours.length === 0) {
      container.innerHTML = '<span class="empty-hint">No colours selected yet</span>';
      return;
    }

    GameState.selectedColours.forEach((colour, i) => {
      const chip = document.createElement('span');
      chip.className = 'colour-chip';
      chip.style.backgroundColor = COLOUR_HEX[colour];
      chip.textContent = `${i + 1}`;
      chip.title = colour;
      container.appendChild(chip);
    });
  }

  function renderResult() {
    const area = $resultArea();
    const msg  = $resultMsg();

    if (GameState.lastOutcome === null) {
      area.classList.add('hidden');
      msg.textContent = '';
      return;
    }

    area.classList.remove('hidden');
    if (GameState.lastOutcome === 'win') {
      msg.textContent = '✓ Match! You win!';
      msg.className = 'outcome-win';
    } else {
      msg.textContent = '✗ No match — you lose.';
      msg.className = 'outcome-loss';
    }
  }

  function updateControls() {
    const hasSelection = GameState.hasSelection();
    const atMax        = GameState.selectedColours.length >= 7;

    $btnSpin().disabled  = !hasSelection || GameState.spinning;
    $btnUndo().disabled  = !hasSelection || GameState.spinning;
    $btnReset().disabled = !hasSelection || GameState.spinning;

    $palette().querySelectorAll('.colour-btn').forEach(btn => {
      const alreadyPicked = GameState.isColourSelected(btn.dataset.colour);
      btn.disabled = GameState.spinning || atMax || alreadyPicked;
    });
  }

  function refreshAll() {
    renderSequence();
    renderResult();
    updateControls();
  }

  return { buildPalette, buildReels, spinReels, refreshAll };

})();
