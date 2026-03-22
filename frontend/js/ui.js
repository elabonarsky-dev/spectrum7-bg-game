/**
 * ui.js — DOM rendering helpers for Spectrum 7.
 *
 * Pure rendering functions that read GameState and update the DOM.
 * No game logic lives here.
 *
 * Reel animation model
 * ────────────────────
 * Each reel is a windowed container (overflow: hidden) 3 tiles tall.
 * The middle tile is the win line.
 *
 * On spin, a long strip is built per reel:
 *   [ SPIN_TILES random tiles ] [ 7 result tiles ] [ 3 trailing tiles ]
 *
 * The strip starts at translateY(0) and transitions to a calculated
 * final position where result[i] sits in the centre window slot.
 *
 * Staggered stopping: each reel has a progressively longer transition
 * duration so they stop left-to-right naturally.
 */

const UI = (() => {

  // ─── Constants ─────────────────────────────────────────────────────────────

  // Number of "spinning" tiles before the result region.
  // 28 = 4 complete ROYGBIV cycles — enough depth for the longer ~5 s spin.
  const SPIN_TILES = 28;

  // ─── DOM helpers ───────────────────────────────────────────────────────────

  const $palette       = () => document.getElementById('colour-palette');
  const $sequence      = () => document.getElementById('selected-sequence');
  const $reelContainer = () => document.getElementById('reels-container');
  const $btnSpin       = () => document.getElementById('btn-spin');
  const $btnUndo       = () => document.getElementById('btn-undo');
  const $btnReset      = () => document.getElementById('btn-reset');
  const $resultArea    = () => document.getElementById('result-area');
  const $resultMsg     = () => document.getElementById('result-message');

  /**
   * Reads --tile-h from the CSS root so JS and CSS always agree on tile size.
   * Falls back to 72 if the variable is missing.
   */
  function getTileH() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--tile-h').trim();
    return parseInt(raw) || 72;
  }

  // ─── Reel tile factories ────────────────────────────────────────────────────

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

  // ─── Build / reset reel DOM (called on init and on reset) ──────────────────

  /**
   * Constructs 7 reel windows, each showing three colour tiles in the initial
   * ROYGBIV order. The centre tile of each reel is COLOURS[i].
   */
  function buildReels() {
    const container = $reelContainer();
    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
      const win = document.createElement('div');
      win.className = 'reel-window';
      win.dataset.reel = i;

      const strip = document.createElement('div');
      strip.className = 'reel-strip';

      // Three tiles: colour above, this reel's colour (centre), colour below
      const prev = COLOURS[(i + 6) % 7];
      const curr = COLOURS[i];
      const next = COLOURS[(i + 1) % 7];
      [prev, curr, next].forEach(c => strip.appendChild(createReelTile(c)));

      win.appendChild(strip);
      container.appendChild(win);
    }
  }

  // ─── Spin animation ─────────────────────────────────────────────────────────

  /**
   * Animates all 7 reels downward with staggered stopping (left → right).
   * Returns a Promise that resolves when the last reel has stopped.
   *
   * Strip layout (per reel i):
   *   indices  0 – 27     : SPIN_TILES shuffled prefix tiles  (4 × ROYGBIV)
   *   indices 28 – 34     : the 7 result colours in order
   *   indices 35 – 37     : 3 trailing buffer tiles
   *
   * Target tile for reel i = index (SPIN_TILES + i).
   * Centre-window translateY = -((SPIN_TILES + i - 1) * tileH)
   *
   * Transition durations (ms):
   *   reel 0 → 1 400   reel 1 → 1 780   ...   reel 6 → 3 660
   */
  function spinReels(result) {
    const totalReels  = 7;
    const maxDuration = 3000 + (totalReels - 1) * 320 + 700; // safety margin

    return new Promise(resolve => {
      const tileH   = getTileH();
      const windows = document.querySelectorAll('.reel-window');
      let stoppedCount = 0;

      // Fallback resolver in case transitionend does not fire
      const fallback = setTimeout(resolve, maxDuration);

      windows.forEach((win, i) => {
        const strip = win.querySelector('.reel-strip');

        // ── 1. Instantly reset strip position (no animation) ──────────────
        strip.style.transition = 'none';
        strip.style.transform  = 'translateY(0)';
        strip.innerHTML        = '';

        // ── 2. Prefix: SPIN_TILES tiles with no adjacent duplicate colours ──
        //
        // Rules enforced tile-by-tile:
        //   • Each tile ≠ the tile immediately before it (no same-colour run).
        //   • The LAST prefix tile also ≠ result[0], because that tile sits
        //     directly above result[0] in reel 0's visible window at rest.
        //     Without this, reel 0 would show the same colour in its top and
        //     centre slots after the spin stops.
        //
        // With 7 colours available, excluding at most 2 always leaves ≥ 5
        // choices, so this never deadlocks.
        const prefix = [];
        let prevPrefixColour = null;

        for (let p = 0; p < SPIN_TILES; p++) {
          const isLastTile = (p === SPIN_TILES - 1);
          let available = COLOURS.filter(c => c !== prevPrefixColour);
          if (isLastTile) available = available.filter(c => c !== result[0]);
          const pick = available[Math.floor(Math.random() * available.length)];
          prefix.push(pick);
          prevPrefixColour = pick;
        }

        prefix.forEach(c => strip.appendChild(createReelTile(c)));

        // ── 3. Result tiles (all 7) ───────────────────────────────────────
        result.forEach(c => strip.appendChild(createReelTile(c)));

        // ── 4. Trailing buffer (prevents the strip ending too soon) ───────
        for (let t = 0; t < 3; t++) {
          strip.appendChild(createReelTile(result[(i + t + 1) % 7]));
        }

        // ── 5. Calculate final translateY so result[i] lands at centre ────
        const targetIndex = SPIN_TILES + i;                   // 0-based
        const finalY      = -((targetIndex - 1) * tileH);    // px

        // ── 6. Apply staggered transition (double rAF for reliable reflow) ─
        // Reel 0 → 3 000 ms, Reel 6 → 4 920 ms ≈ 5 s total
        const duration = 3000 + i * 320;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // cubic-bezier: very fast start, smooth deceleration to stop
            strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.9, 0.4, 1.0)`;
            strip.style.transform  = `translateY(${finalY}px)`;
          });
        });

        // ── 7. Resolve promise once all reels have stopped ────────────────
        strip.addEventListener('transitionend', () => {
          stoppedCount++;
          if (stoppedCount >= totalReels) {
            clearTimeout(fallback);
            resolve();
          }
        }, { once: true });
      });
    });
  }

  // ─── Palette ────────────────────────────────────────────────────────────────

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

  // ─── Sequence ───────────────────────────────────────────────────────────────

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

  // ─── Result ─────────────────────────────────────────────────────────────────

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

  // ─── Controls ───────────────────────────────────────────────────────────────

  function updateControls() {
    const hasSelection = GameState.hasSelection();
    const atMax        = GameState.selectedColours.length >= 7;

    $btnSpin().disabled  = !hasSelection || GameState.spinning;
    $btnUndo().disabled  = !hasSelection || GameState.spinning;
    $btnReset().disabled = !hasSelection || GameState.spinning;

    // Each colour button is disabled if:
    //   • a spin is in progress, OR
    //   • the full 7 colours are already chosen, OR
    //   • this specific colour has already been selected
    $palette().querySelectorAll('.colour-btn').forEach(btn => {
      const alreadyPicked = GameState.isColourSelected(btn.dataset.colour);
      btn.disabled = GameState.spinning || atMax || alreadyPicked;
    });
  }

  // ─── Refresh all ────────────────────────────────────────────────────────────
  // Reel rendering is handled exclusively by buildReels() and spinReels().

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
