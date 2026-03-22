/**
 * state.js — Central state module for Spectrum 7.
 *
 * All game state lives here. Other modules read/write via the
 * exported GameState object so there is one source of truth.
 */

const COLOURS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];

const COLOUR_HEX = {
  Red:    '#E53935',
  Orange: '#FB8C00',
  Yellow: '#FDD835',
  Green:  '#43A047',
  Blue:   '#1E88E5',
  Indigo: '#3949AB',
  Violet: '#8E24AA'
};

const MAX_SELECTIONS = 7;

const GameState = {
  selectedColours: [],
  reelResult: [null, null, null, null, null, null, null],
  spinning: false,
  lastOutcome: null,       // 'win' | 'loss' | null

  reset() {
    this.selectedColours = [];
    this.reelResult = [null, null, null, null, null, null, null];
    this.spinning = false;
    this.lastOutcome = null;
  },

  resetSelection() {
    this.selectedColours = [];
    this.lastOutcome = null;
  },

  canSelect() {
    return this.selectedColours.length < MAX_SELECTIONS && !this.spinning;
  },

  isColourSelected(colour) {
    return this.selectedColours.includes(colour);
  },

  addColour(colour) {
    if (!this.canSelect()) return false;
    if (this.isColourSelected(colour)) return false;
    this.selectedColours.push(colour);
    return true;
  },

  undoLast() {
    if (this.selectedColours.length === 0 || this.spinning) return false;
    this.selectedColours.pop();
    this.lastOutcome = null;
    return true;
  },

  hasSelection() {
    return this.selectedColours.length > 0;
  }
};
