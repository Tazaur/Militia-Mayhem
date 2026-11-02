// Owns: the small bitmap font of the stats readout. Stage 7 brings the real HUD text.
const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
export const CELLS_PER_CHARACTER = GLYPH_WIDTH + 1;
export const CELLS_PER_LINE = GLYPH_HEIGHT + 2;

// Each glyph is five rows of three bits.
const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 3, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
  '.': [0, 0, 0, 0, 2],
  '-': [0, 0, 7, 0, 0],
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [7, 4, 4, 4, 7],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [7, 4, 5, 5, 7],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 7],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 5, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [7, 5, 5, 5, 7],
  P: [7, 5, 7, 4, 4],
  Q: [7, 5, 5, 7, 1],
  R: [6, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 5, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
};

/** Calls `cell` for each lit cell of the text. */
export function layoutText(text: string, cell: (column: number, row: number) => void): void {
  let column = 0;
  for (const character of text) {
    const glyph = GLYPHS[character];
    if (glyph) {
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const bits = glyph[row] ?? 0;
        for (let bit = 0; bit < GLYPH_WIDTH; bit++) {
          if (bits & (1 << (GLYPH_WIDTH - 1 - bit))) cell(column + bit, row);
        }
      }
    }
    column += CELLS_PER_CHARACTER;
  }
}
