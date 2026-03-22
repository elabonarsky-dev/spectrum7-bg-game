/**
 * selection.js — Colour selection handlers for Spectrum 7.
 */

const Selection = (() => {

  function select(colour) {
    if (GameState.addColour(colour)) {
      UI.refreshAll();
    }
  }

  function undo() {
    if (GameState.undoLast()) {
      UI.refreshAll();
    }
  }

  function reset() {
    GameState.resetSelection();
    GameState.reelResult  = [null, null, null, null, null, null, null];
    GameState.lastOutcome = null;
    UI.buildReels();
    UI.refreshAll();
  }

  return { select, undo, reset };
})();
