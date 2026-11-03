// Owns: what stands in Stage 1's test block, as data. Positions are from the middle of the block.

/** A wall or building: a flat top at height `height`, and a south face down to the ground. */
export interface SliceBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  /** The old game's roofs are 36 to 42 px up (`ROOF_Z`), over walls just below that. */
  readonly height: number;
  readonly top: 'roof' | 'concrete';
}

/** A trunk or a lamp post: stands upright, with something flat on top. */
export interface SlicePost {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly width: number;
  readonly crown: string;
  readonly crownInAtlas: boolean;
}

export interface SliceStill {
  readonly sprite: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly angle: number;
}

export interface SlicePart {
  readonly sprite: string;
  readonly z: number;
  /** Radians either way a turret swings from the way it is going. */
  readonly swing: number;
}

/** Goes round an ellipse. `radiusY` 0 is walking back and forth. */
export interface SliceMover {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Radians of the ellipse per second. */
  readonly rate: number;
  readonly parts: readonly SlicePart[];
}

/** Far more than a fight should need, to find what depth costs a phone. About half lands on screen. */
export const SPRITE_BENCH = {
  count: 2000,
  /** Width and height of the square they stand in, in game pixels. */
  spread: 900,
  /** Radius each one wanders, so sorting has work to do. */
  wander: 12,
  /** In turn; mostly soldiers, with enough vehicles to cover a lot of pixels. */
  parts: [
    { sprite: 'sol_stand', z: 14 },
    { sprite: 'sol_rpg', z: 14 },
    { sprite: 'sol_stand', z: 14 },
    { sprite: 'hull0', z: 14 },
    { sprite: 'sol_stand', z: 14 },
    { sprite: 'sol_rpg', z: 14 },
    { sprite: 'jeep0', z: 12 },
    { sprite: 'sol_stand', z: 14 },
    { sprite: 'tur', z: 24 },
    { sprite: 'sol_stand', z: 14 },
  ],
} as const;

export const SLICE_BOXES: readonly SliceBox[] = [
  { x: -80, y: -48, width: 160, depth: 96, height: 42, top: 'roof' },
  { x: -150, y: 112, width: 110, depth: 12, height: 36, top: 'concrete' },
  { x: 60, y: 116, width: 12, depth: 44, height: 36, top: 'concrete' },
];

export const SLICE_POSTS: readonly SlicePost[] = [
  { x: -200, y: -105, height: 60, width: 6, crown: 'tree1', crownInAtlas: true },
  { x: 205, y: 20, height: 40, width: 4, crown: 'tree2', crownInAtlas: true },
  { x: -215, y: 25, height: 70, width: 8, crown: 'tree0', crownInAtlas: true },
  { x: 25, y: 170, height: 64, width: 4, crown: 'lampHead', crownInAtlas: false },
];

export const SLICE_STILLS: readonly SliceStill[] = [
  { sprite: 'sol_stand', x: 30, y: 135, z: 14, angle: 0.5 },
  { sprite: 'sol_rpg', x: 90, y: 104, z: 14, angle: 2.4 },
  { sprite: 'sol_stand', x: 110, y: 150, z: 14, angle: 3.6 },
];

const SOLDIER: readonly SlicePart[] = [{ sprite: 'sol_stand', z: 14, swing: 0 }];

export const SLICE_MOVERS: readonly SliceMover[] = [
  // Tight round the house, so it passes behind the roof and in front of the south face. 0.6 is about the old 82 px/s.
  {
    x: 0,
    y: 0,
    radiusX: 170,
    radiusY: 76,
    rate: 0.6,
    parts: [
      { sprite: 'hull0', z: 14, swing: 0 },
      { sprite: 'tur_gun', z: 22, swing: 0.6 },
      { sprite: 'tur', z: 24, swing: 0.6 },
    ],
  },
  {
    x: 0,
    y: 40,
    radiusX: 225,
    radiusY: 150,
    rate: -0.7,
    parts: [{ sprite: 'jeep0', z: 12, swing: 0 }],
  },
  // Behind the long wall, then close in front of it: the second shows how depth and sort differ (DECISIONS.md D20).
  { x: -95, y: 100, radiusX: 50, radiusY: 0, rate: 1, parts: SOLDIER },
  { x: -95, y: 130, radiusX: 40, radiusY: 0, rate: 1.3, parts: SOLDIER },
];
