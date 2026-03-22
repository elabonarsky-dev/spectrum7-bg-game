/**
 * app.js — Main entry point for Spectrum 7 (Milestone 1).
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
 * Spin: shuffle → audio → reel animation (downward, staggered) → validate.
 */
async function handleSpin() {
  if (!GameState.hasSelection() || GameState.spinning) return;

  GameState.spinning    = true;
  GameState.lastOutcome = null;
  UI.refreshAll();

  const result = shuffleColours();

  if (typeof ReelAudio !== 'undefined') {
    await ReelAudio.spinStart();
  }

  try {
    await UI.spinReels(result);
  } finally {
    if (typeof ReelAudio !== 'undefined') {
      await ReelAudio.spinStop();
    }
  }

  GameState.spinning    = false;
  GameState.reelResult  = result;
  GameState.lastOutcome = validateSequence(GameState.selectedColours, result);
  UI.refreshAll();
}
