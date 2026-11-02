// Owns: everything drawn over the world at full resolution. Stage 0 has only the stats readout.
import type { Gpu, Pass } from '../contracts/index.ts';
import { CELLS_PER_CHARACTER, CELLS_PER_LINE, layoutText } from './font.ts';

const FLOATS_PER_RECT = 8;
const MAX_RECTS = 4096;

const VERTEX = `
in vec4 aRect;
in vec4 aColor;
uniform vec2 uScreen;
out vec4 vColor;
void main() {
  vec2 pixel = aRect.xy + aCorner * aRect.zw;
  gl_Position = vec4(pixel.x / uScreen.x * 2.0 - 1.0, 1.0 - pixel.y / uScreen.y * 2.0, 0.0, 1.0);
  vColor = aColor;
}`;

const FRAGMENT = `
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = vColor;
}`;

export interface Ui {
  /** Draws the lines; only rebuilds its rectangles when `lines` is a new array or the screen changes. */
  frame(lines: readonly string[], screenWidth: number, screenHeight: number): void;
}

export function createUi(gpu: Gpu): Ui {
  const program = gpu.createProgram({
    name: 'ui-rect',
    vertex: VERTEX,
    fragment: FRAGMENT,
    instanceAttributes: [
      { name: 'aRect', size: 4 },
      { name: 'aColor', size: 4 },
    ],
  });
  const rects = new Float32Array(MAX_RECTS * FLOATS_PER_RECT);
  const screen = new Float32Array(2);
  const instances = { data: rects, count: 0 };
  const pass: Pass = {
    name: 'ui',
    target: null,
    program,
    inputs: [],
    uniforms: [{ name: 'uScreen', value: screen }],
    blend: 'alpha',
    instances,
  };

  let cellSize = 2;
  let lineTop = 0;
  const addRect = (x: number, y: number, width: number, height: number, shade: number, alpha: number) => {
    if (instances.count >= MAX_RECTS) return;
    const offset = instances.count * FLOATS_PER_RECT;
    rects[offset] = x;
    rects[offset + 1] = y;
    rects[offset + 2] = width;
    rects[offset + 3] = height;
    rects[offset + 4] = shade;
    rects[offset + 5] = shade;
    rects[offset + 6] = shade * 0.9;
    rects[offset + 7] = alpha;
    instances.count++;
  };
  const addCell = (column: number, row: number) => {
    addRect(cellSize * (column + 1), lineTop + row * cellSize, cellSize, cellSize, 0.95, 1);
  };

  let shownLines: readonly string[] | null = null;
  let shownSize = 0;

  return {
    frame(lines, screenWidth, screenHeight) {
      const size = Math.min(screenWidth, screenHeight);
      if (lines !== shownLines || size !== shownSize) {
        shownLines = lines;
        shownSize = size;
        cellSize = Math.max(2, Math.round(size / 200));
        instances.count = 0;
        lines.forEach((line, index) => {
          lineTop = cellSize * (1 + index * CELLS_PER_LINE);
          const width = cellSize * (line.length * CELLS_PER_CHARACTER + 1);
          addRect(0, lineTop - cellSize, width, cellSize * CELLS_PER_LINE, 0, 0.6);
          layoutText(line, addCell);
        });
      }
      screen[0] = screenWidth;
      screen[1] = screenHeight;
      gpu.draw(pass);
    },
  };
}
