// Owns: everything drawn over the world at full resolution. Stage 0 has only the stats readout.
import type { Gpu, Pass, ProgramHandle } from '../contracts/index.ts';
import { layoutText } from './font.ts';

const FLOATS_PER_RECT = 4;
const MAX_RECTS = 512;

const VERTEX = `
in vec4 aRect;
uniform vec2 uScreen;
void main() {
  vec2 pixel = aRect.xy + aCorner * aRect.zw;
  gl_Position = vec4(pixel.x / uScreen.x * 2.0 - 1.0, 1.0 - pixel.y / uScreen.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
uniform vec4 uColor;
out vec4 outColor;
void main() {
  outColor = uColor;
}`;

export interface FrameStatsView {
  readonly fps: number;
  readonly worstMs: number;
}

export interface Ui {
  frame(stats: FrameStatsView, screenWidth: number, screenHeight: number): void;
}

export function createUi(gpu: Gpu, build: number): Ui {
  const program: ProgramHandle = gpu.createProgram({
    name: 'ui-rect',
    vertex: VERTEX,
    fragment: FRAGMENT,
    instanceAttributes: [{ name: 'aRect', size: FLOATS_PER_RECT }],
  });
  const rects = new Float32Array(MAX_RECTS * FLOATS_PER_RECT);
  const screen = [1, 1];
  const instances = { data: rects, count: 0 };
  const pass: Pass = {
    name: 'ui-stats',
    target: null,
    program,
    inputs: [],
    uniforms: [
      { name: 'uScreen', value: screen },
      { name: 'uColor', value: [0.85, 0.9, 0.75, 1] },
    ],
    blend: 'none',
    instances,
  };

  // Set before each layout, so the callback below is one closure, not one per frame (rule L5).
  let cellSize = 2;
  let margin = 4;
  let count = 0;
  const addCell = (column: number, row: number) => {
    if (count >= MAX_RECTS) return;
    const offset = count * FLOATS_PER_RECT;
    rects[offset] = margin + column * cellSize;
    rects[offset + 1] = margin + row * cellSize;
    rects[offset + 2] = cellSize;
    rects[offset + 3] = cellSize;
    count++;
  };

  let line = '';
  let lineFps = -1;
  let lineWorst = -1;

  return {
    frame(stats, screenWidth, screenHeight) {
      const fps = Math.round(stats.fps);
      const worst = Math.round(stats.worstMs);
      // The numbers change about once a second, so this string is not a per-frame allocation.
      if (fps !== lineFps || worst !== lineWorst) {
        lineFps = fps;
        lineWorst = worst;
        line = `${fps} FPS  WORST ${worst} MS  B${build}`;
      }
      cellSize = Math.max(2, Math.round(Math.min(screenWidth, screenHeight) / 240));
      margin = cellSize * 2;
      count = 0;
      layoutText(line, addCell);
      screen[0] = screenWidth;
      screen[1] = screenHeight;
      instances.count = count;
      gpu.draw(pass);
    },
  };
}
