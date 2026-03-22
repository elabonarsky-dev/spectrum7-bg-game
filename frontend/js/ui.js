/**
 * ui.js — DOM rendering helpers for Spectrum 7.
 *
 * Reel animation model
 * ────────────────────
 * Each reel is a windowed container (overflow: hidden) 3 tiles tall.
 * The middle tile is the win line.
 *
 * Spin direction: the strip starts translated UP (more negative) and animates
 * toward the landing position (less negative). Visually, symbols move DOWN —
 * like a physical drum rotating forward.
 *
 * Strip layout per reel:
 *   [ PRE_SPIN padding ] [ SPIN_TILES prefix ] [ 7 result ] [ 3 trailing ] [ POST padding ]
 *
 * Staggered stopping: each reel has a longer total duration so they lock
 * left → right with a heavy ease-out (momentum feel).
 */

const UI = (() => {

  const SPIN_TILES = 28;

  /** Extra tiles before the prefix — allows starting the animation further “up” the strip. */
  const PRE_SPIN_TILES = 22;

  /** Extra tiles after trailing buffer — headroom so translateY never runs off the strip. */
  const POST_SPIN_TILES = 24;

  /**
   * How many tile-heights of travel before the landing position.
   * More tiles = longer path for the ~10 s spin so motion stays visible.
   */
  const SPIN_EXTRA_TILES = 26;

  /**
   * Two-phase spin so “fast rotating” lasts longer than 7 s:
   *   Phase 1 — linear motion over FAST_ROTATE_MS (constant blur, >7 s).
   *   Phase 2 — heavy ease from a blend point to the final stop (staggered).
   */
  const FAST_ROTATE_MS = 7500;

  /** Share of total translateY covered in phase 1 (rest decelerates in phase 2). */
  const BLEND_FRACTION = 0.88;

  /** Slow / lock phase: reel i runs SLOW_BASE_MS + i * STAGGER_MS. */
  const SLOW_BASE_MS = 2200;
  const STAGGER_MS = 400;

  /** Phase 2 only — drum losing energy, mechanical stop. */
  const SPIN_EASING = 'cubic-bezier(0.08, 0.82, 0.12, 1)';

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
    return parseInt(raw) || 72;
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

  /**
   * Random tiles with no adjacent duplicate colours.
   * @param {number} count
   * @param {string|null} notFirst - optional colour forbidden at index 0
   */
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
      strip.className = 'reel-strip';

      const prev = COLOURS[(i + 6) % 7];
      const curr = COLOURS[i];
      const next = COLOURS[(i + 1) % 7];
      [prev, curr, next].forEach(c => strip.appendChild(createReelTile(c)));

      win.appendChild(strip);
      container.appendChild(win);
    }
  }

  /**
   * Brief mechanical “lock” after the main ease: tiny overshoot then settle.
   */
  function applyMechanicalSettle(strip, finalY, tileH) {
    const overshoot = Math.max(4, Math.min(8, tileH * 0.1));

    strip.style.transition = 'none';
    strip.style.transform = `translateY(${finalY}px)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        strip.style.transition = 'transform 0.09s cubic-bezier(0.45, 0, 0.55, 1)';
        strip.style.transform = `translateY(${finalY + overshoot}px)`;

        const onNudgeEnd = () => {
          strip.removeEventListener('transitionend', onNudgeEnd);
          strip.style.transition = 'transform 0.22s cubic-bezier(0.22, 1.15, 0.35, 1)';
          strip.style.transform = `translateY(${finalY}px)`;
        };
        strip.addEventListener('transitionend', onNudgeEnd, { once: true });
      });
    });
  }

  /**
   * Downward spin: start at startY (more negative), end at finalY (less negative).
   * Symbols scroll visually downward.
   */
  function spinReels(result) {
    const totalReels = 7;
    const maxDuration =
      FAST_ROTATE_MS + SLOW_BASE_MS + (totalReels - 1) * STAGGER_MS + 1800;

    return new Promise(resolve => {
      const tileH = getTileH();
      const windows = document.querySelectorAll('.reel-window');
      let stoppedCount = 0;

      const fallback = setTimeout(resolve, maxDuration);

      windows.forEach((win, i) => {
        const strip = win.querySelector('.reel-strip');

        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        strip.innerHTML = '';

        const prefix = [];
        let prevPrefixColour = null;
        for (let p = 0; p < SPIN_TILES; p++) {
          const isLastTile = (p === SPIN_TILES - 1);
          let available = COLOURS.filter(c => c !== prevPrefixColour);
          if (isLastTile) {
            available = available.filter(
              c => c !== result[0] && c !== result[1]
            );
          }
          const pick = available[Math.floor(Math.random() * available.length)];
          prefix.push(pick);
          prevPrefixColour = pick;
        }

        const preSpin = buildRandomRun(PRE_SPIN_TILES);
        if (preSpin[PRE_SPIN_TILES - 1] === prefix[0]) {
          const prev = PRE_SPIN_TILES > 1 ? preSpin[PRE_SPIN_TILES - 2] : null;
          let fix = COLOURS.filter(
            c => c !== prefix[0] && c !== prev
          );
          preSpin[PRE_SPIN_TILES - 1] =
            fix[Math.floor(Math.random() * fix.length)];
        }

        preSpin.forEach(c => strip.appendChild(createReelTile(c)));
        prefix.forEach(c => strip.appendChild(createReelTile(c)));
        result.forEach(c => strip.appendChild(createReelTile(c)));

        for (let t = 0; t < 3; t++) {
          strip.appendChild(createReelTile(result[(i + t + 1) % 7]));
        }

        const lastTrail = result[(i + 3) % 7];
        const postSpin = buildRandomRun(POST_SPIN_TILES, lastTrail);
        postSpin.forEach(c => strip.appendChild(createReelTile(c)));

        const centerIndex = PRE_SPIN_TILES + SPIN_TILES + i;
        const finalY = -((centerIndex - 1) * tileH);
        const startY = finalY - SPIN_EXTRA_TILES * tileH;
        const blendY =
          startY + (finalY - startY) * BLEND_FRACTION;

        const phase2Ms = SLOW_BASE_MS + i * STAGGER_MS;

        strip.style.willChange = 'transform';
        strip.style.transform = `translateY(${startY}px)`;

        function runPhase2() {
          strip.style.transition = 'none';
          strip.style.transform = `translateY(${blendY}px)`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              strip.style.transition =
                `transform ${phase2Ms}ms ${SPIN_EASING}`;
              strip.style.transform = `translateY(${finalY}px)`;

              strip.addEventListener('transitionend', function onPhase2End(e) {
                if (e.propertyName !== 'transform') return;
                strip.removeEventListener('transitionend', onPhase2End);
                strip.style.willChange = 'auto';

                if (typeof ReelAudio !== 'undefined') {
                  ReelAudio.playReelStop();
                }
                applyMechanicalSettle(strip, finalY, tileH);

                stoppedCount++;
                if (stoppedCount >= totalReels) {
                  clearTimeout(fallback);
                  resolve();
                }
              }, { once: true });
            });
          });
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            strip.style.transition =
              `transform ${FAST_ROTATE_MS}ms linear`;
            strip.style.transform = `translateY(${blendY}px)`;
          });
        });

        strip.addEventListener('transitionend', function onPhase1End(e) {
          if (e.propertyName !== 'transform') return;
          strip.removeEventListener('transitionend', onPhase1End);
          runPhase2();
        }, { once: true });
      });
    });
  }

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
      msg.textContent = 'Match! You win!';
      msg.className = 'outcome-win';
    } else {
      msg.textContent = 'No match — you lose.';
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

  return {
    buildPalette,
    buildReels,
    spinReels,
    refreshAll
  };

})();
