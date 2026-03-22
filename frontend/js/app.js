/**
 * app.js — Main entry point for Spectrum 7 (Milestone 1).
 *
 * Wires up event listeners and initialises the UI.
 */

(function init() {
  UI.buildPalette(Selection.select);
  UI.buildReels();

  document.getElementById('btn-undo').addEventListener('click', Selection.undo);
  document.getElementById('btn-reset').addEventListener('click', Selection.reset);
  document.getElementById('btn-spin').addEventListener('click', handleSpin);

  UI.refreshAll();
})();

/**
 * Spin handler.
 *
 * 1. Shuffles all 7 colours (Fisher-Yates — no duplicates, full permutation).
 * 2. Animates the reels with real vertical motion, staggered left-to-right stops.
 * 3. After all reels land, validates the player's sequence against the result.
 *
 * The entire mock flow runs client-side for Milestone 1.
 * In Milestone 2, shuffleColours() + spinReels() will be replaced by a
 * server call whose response drives the animation.
 */
async function handleSpin() {
  if (!GameState.hasSelection() || GameState.spinning) return;

  GameState.spinning    = true;
  GameState.lastOutcome = null;
  UI.refreshAll();

  const result = shuffleColours();

  await UI.spinReels(result);

  GameState.spinning    = false;
  GameState.reelResult  = result;
  GameState.lastOutcome = validateSequence(GameState.selectedColours, result);
  UI.refreshAll();
}
