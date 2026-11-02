// Owns: the small bitmap font of the stats readout. Stage 7 brings the real HUD text.
const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;

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
  B: [6, 5, 6, 5, 6],
  F: [7, 4, 6, 4, 4],
  M: [5, 7, 5, 5, 5],
  O: [7, 5, 5, 5, 7],
  P: [7, 5, 7, 4, 4],
  R: [6, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7],
  T: [7, 2, 2, 2, 2],
  W: [5, 5, 5, 7, 5],
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
    column += GLYPH_WIDTH + 1;
  }
}
