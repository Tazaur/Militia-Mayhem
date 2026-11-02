// Owns: what stands in Stage 1's test block, as data. Later rows draw over earlier ones.
export const SLICE_BLOCK_WIDTH = 900;
export const SLICE_BLOCK_HEIGHT = 620;

export interface SliceProp {
  readonly sprite: string;
  readonly x: number;
  readonly y: number;
}

export const SLICE_PROPS: readonly SliceProp[] = [
  { sprite: 'hull0', x: 160, y: 160 },
  { sprite: 'tur', x: 160, y: 160 },
  { sprite: 'tur_gun', x: 176, y: 160 },
  { sprite: 'jeep0', x: 560, y: 120 },
  { sprite: 'sol_stand', x: 330, y: 250 },
  { sprite: 'sol_rpg', x: 372, y: 262 },
  { sprite: 'sol_stand', x: 520, y: 300 },
  { sprite: 'sol_nogun', x: 600, y: 340 },
  { sprite: 'sol_dead', x: 250, y: 370 },
  { sprite: 'fire2', x: 700, y: 430 },
  { sprite: 'tree0', x: 110, y: 480 },
  { sprite: 'tree1', x: 760, y: 220 },
  { sprite: 'tree2', x: 480, y: 500 },
];
