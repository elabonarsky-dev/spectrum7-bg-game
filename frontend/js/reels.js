/**
 * reels.js — Validation logic and colour shuffle for Spectrum 7.
 *
 * Core rule (left-to-right match):
 *   The player's selected sequence is compared against the reel results
 *   starting from reel 1 (index 0) and moving rightward.
 *
 *   - Every colour in the player's sequence must match the reel at the
 *     same position (sequence[i] === reelResult[i]).
 *   - If ALL selected colours match their corresponding reels, it is a WIN.
 *   - If ANY selected colour fails to match, it is a LOSS.
 *   - A player who selected fewer than 7 colours only needs those first N
 *     reels to match; the remaining reels are irrelevant to the outcome.
 *
 * @param {string[]} selected    - ordered array of colour names the player chose
 * @param {string[]} reelResult  - 7-element array of colour names from the reels
 * @returns {'win'|'loss'} outcome
 */
function validateSequence(selected, reelResult) {
  if (!selected || selected.length === 0) return 'loss';

  for (let i = 0; i < selected.length; i++) {
    if (selected[i] !== reelResult[i]) return 'loss';
  }
  return 'win';
}

/**
 * Returns a Fisher-Yates shuffle of all 7 ROYGBIV colours.
 *
 * Every colour appears EXACTLY ONCE — no duplicates per spin.
 * The result is a permutation of the full set, not a random
 * selection with replacement.
 *
 * Replaces the old mockSpin() which allowed repeated colours.
 *
 * @returns {string[]} shuffled 7-element array of all colour names
 */
function shuffleColours() {
  const arr = [...COLOURS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
