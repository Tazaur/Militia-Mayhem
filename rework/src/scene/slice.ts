// Owns: Stage 1's hand-written scene: one block and a sprite bench, sorted or by depth. Stage 2 replaces it.
import {
  ATLAS_SPRITES,
  PLACEHOLDER_RECTS,
  SLICE_BOXES,
  SLICE_DAY,
  SLICE_LAMP,
  SLICE_MOVERS,
  SLICE_NIGHT,
  SLICE_POSTS,
  SLICE_STILLS,
  SPRITE_BENCH,
} from '../content/index.ts';
import type { PlaceholderRect, SlicePart } from '../content/index.ts';
import type { FrameScene, Rgb } from '../contracts/index.ts';
import { createRng } from '../core/index.ts';

const CENTER = 2000;
const FLAG_UPRIGHT = 1;
const FLAG_PLACEHOLDER = 2;
const TILE = 32;
// Sorts after every ground position: crowns and lamp heads are overhead. Stage 4's overhead layer replaces this.
const OVERHEAD = 1e6;
const WORKING_TILT = 0.25;
const MODES = [
  { note: 'NIGHT LAMPS  TAP', bench: false, useDepth: false, night: true },
  { note: 'SLICE SORT  TAP', bench: false, useDepth: false, night: false },
  { note: 'SLICE DEPTH  TAP', bench: false, useDepth: true, night: false },
  { note: `BENCH ${SPRITE_BENCH.count} SORT  TAP`, bench: true, useDepth: false, night: false },
  { note: `BENCH ${SPRITE_BENCH.count} DEPTH  TAP`, bench: true, useDepth: true, night: false },
];

interface Item {
  readonly rect: readonly [x: number, y: number, width: number, height: number];
  readonly pivotX: number;
  readonly pivotY: number;
  readonly flags: number;
  x: number;
  y: number;
  readonly z: number;
  angle: number;
  sortY: number;
}

/** A list of things to draw, and the order that sorting them last left them in. */
interface SortableItems {
  readonly items: readonly Item[];
  readonly order: Int32Array;
}

interface MovingPart {
  readonly item: Item;
  readonly swing: number;
}

export interface SliceScene {
  readonly scene: FrameScene;
  update(nowMs: number, taps: number): void;
  /** What the readout says about the current test. */
  note(): string;
}

function atlasItem(sprite: string, x: number, y: number, z: number, angle: number, sortY: number): Item {
  const art = ATLAS_SPRITES[sprite];
  if (!art) throw new Error(`no sprite ${sprite}`);
  const rect = [art[0], art[1], art[2], art[3]] as const;
  return { rect, pivotX: art[4], pivotY: art[5], flags: 0, x, y, z, angle, sortY };
}

function placeholderItem(
  art: PlaceholderRect,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  flags: number,
  pivotX: number,
  pivotY: number,
  sortY: number,
): Item {
  const rect = [art.x, art.y, width, height] as const;
  return { rect, pivotX, pivotY, flags: FLAG_PLACEHOLDER | flags, x, y, z, angle: 0, sortY };
}

function buildStillItems(): Item[] {
  const items: Item[] = [];
  for (const box of SLICE_BOXES) {
    const left = CENTER + box.x;
    const top = CENTER + box.y;
    const south = top + box.depth;
    for (let across = 0; across < box.width; across += TILE) {
      const width = Math.min(TILE, box.width - across);
      for (let down = 0; down < box.depth; down += TILE) {
        const depth = Math.min(TILE, box.depth - down);
        const art = PLACEHOLDER_RECTS[box.top];
        items.push(
          placeholderItem(art, width, depth, left + across, top + down, box.height, 0, 0, 0, top + down + depth),
        );
      }
      const height = box.height;
      items.push(
        placeholderItem(
          PLACEHOLDER_RECTS.brick,
          width,
          height,
          left + across,
          south,
          0,
          FLAG_UPRIGHT,
          0,
          height,
          south,
        ),
      );
    }
  }
  for (const post of SLICE_POSTS) {
    const x = CENTER + post.x;
    const y = CENTER + post.y;
    const art = PLACEHOLDER_RECTS.post;
    const halfWidth = post.width / 2;
    items.push(placeholderItem(art, post.width, post.height, x, y, 0, FLAG_UPRIGHT, halfWidth, post.height, y));
    if (post.crownInAtlas) {
      items.push(atlasItem(post.crown, x, y, post.height, 0, OVERHEAD));
    } else {
      const head = PLACEHOLDER_RECTS.lampHead;
      items.push(
        placeholderItem(head, head.width, head.height, x, y, post.height, 0, head.width / 2, head.height / 2, OVERHEAD),
      );
    }
  }
  for (const still of SLICE_STILLS) {
    items.push(atlasItem(still.sprite, CENTER + still.x, CENTER + still.y, still.z, still.angle, CENTER + still.y));
  }
  return items;
}

function sortable(items: readonly Item[]): SortableItems {
  return { items, order: new Int32Array(items.length).map((_, index) => index) };
}

/** Nearly sorted from the last frame, so this does almost no work. Equal keys keep their list order. */
function sortByGround({ items, order }: SortableItems): void {
  for (let i = 1; i < order.length; i++) {
    const moving = order[i]!;
    const key = items[moving]!.sortY;
    let j = i - 1;
    while (j >= 0 && items[order[j]!]!.sortY > key) {
      order[j + 1] = order[j]!;
      j--;
    }
    order[j + 1] = moving;
  }
}

function buildBenchItems(): Item[] {
  const rng = createRng(1);
  const items: Item[] = [];
  for (let i = 0; i < SPRITE_BENCH.count; i++) {
    const part = SPRITE_BENCH.parts[i % SPRITE_BENCH.parts.length]!;
    const x = CENTER + (rng.next() - 0.5) * SPRITE_BENCH.spread;
    const y = CENTER + (rng.next() - 0.5) * SPRITE_BENCH.spread;
    items.push(atlasItem(part.sprite, x, y, part.z, rng.next() * Math.PI * 2, y));
  }
  return items;
}

export function createSliceScene(): SliceScene {
  const sliceItems = buildStillItems();
  const moverParts: MovingPart[][] = SLICE_MOVERS.map((mover) =>
    mover.parts.map((part: SlicePart) => {
      const item = atlasItem(part.sprite, CENTER, CENTER, part.z, 0, CENTER);
      sliceItems.push(item);
      return { item, swing: part.swing };
    }),
  );
  const slice = sortable(sliceItems);
  const benchItems = buildBenchItems();
  const bench = sortable(benchItems);
  const benchHomes = Float32Array.from(benchItems.flatMap((item) => [item.x, item.y]));

  const capacity = Math.max(sliceItems.length, benchItems.length);
  const atlasRect = new Float32Array(capacity * 4);
  const position = new Float32Array(capacity * 3);
  const pivot = new Float32Array(capacity * 2);
  const transform = new Float32Array(capacity * 2);
  const tint = new Float32Array(capacity * 4).fill(1);
  const flags = new Float32Array(capacity);

  const camera = { x: CENTER, y: CENTER, tilt: WORKING_TILT, zoom: 1 };
  const none = new Float32Array(0);
  const lamps = SLICE_POSTS.filter((post) => post.lamp);
  const lightPosition = Float32Array.from(lamps.flatMap((post) => [CENTER + post.x, CENTER + post.y, post.height]));
  const { color: lampColor, reach, intensity } = SLICE_LAMP;
  const lightColor = Float32Array.from(lamps.flatMap(() => [lampColor.r, lampColor.g, lampColor.b]));
  const lightShape = Float32Array.from(lamps.flatMap(() => [reach, intensity, 0, Math.PI * 2]));
  const lights = { count: 0, position: lightPosition, color: lightColor, shape: lightShape };
  const environment: { sunDirection: readonly [number, number, number]; sunColor: Rgb; ambientColor: Rgb } = {
    sunDirection: [0, 0, 1],
    sunColor: SLICE_DAY.sunColor,
    ambientColor: SLICE_DAY.ambientColor,
  };
  const sprites = { count: 0, atlasRect, position, pivot, transform, tint, flags, useDepth: false };
  const scene: FrameScene = {
    camera,
    environment,
    sprites,
    casters: { count: 0, atlasRect: none, position: none, transform: none },
    lights,
    particles: { count: 0, position: none, color: none },
    volumes: { width: 0, height: 0, density: none },
    stains: [],
    visibility: { polygon: none, pointCount: 0 },
    worldOverlay: { count: 0, position: none, color: none },
  };

  const write = (item: Item) => {
    const index = sprites.count++;
    atlasRect[index * 4] = item.rect[0];
    atlasRect[index * 4 + 1] = item.rect[1];
    atlasRect[index * 4 + 2] = item.rect[2];
    atlasRect[index * 4 + 3] = item.rect[3];
    position[index * 3] = item.x;
    position[index * 3 + 1] = item.y;
    position[index * 3 + 2] = item.z;
    pivot[index * 2] = item.pivotX;
    pivot[index * 2 + 1] = item.pivotY;
    transform[index * 2] = item.angle;
    transform[index * 2 + 1] = 1;
    flags[index] = item.flags;
  };

  const moveSlice = (seconds: number) => {
    for (let m = 0; m < SLICE_MOVERS.length; m++) {
      const mover = SLICE_MOVERS[m]!;
      const parts = moverParts[m]!;
      const around = seconds * mover.rate;
      const x = CENTER + mover.x + mover.radiusX * Math.cos(around);
      const y = CENTER + mover.y + mover.radiusY * Math.sin(around);
      const heading = Math.atan2(
        mover.radiusY * Math.cos(around) * mover.rate,
        -mover.radiusX * Math.sin(around) * mover.rate,
      );
      for (let p = 0; p < parts.length; p++) {
        const { item, swing } = parts[p]!;
        item.x = x;
        item.y = y;
        item.sortY = y;
        item.angle = heading + swing * Math.sin(seconds * 0.9);
      }
    }
  };

  const moveBench = (seconds: number) => {
    for (let i = 0; i < benchItems.length; i++) {
      const item = benchItems[i]!;
      const phase = seconds + i;
      item.x = benchHomes[i * 2]! + SPRITE_BENCH.wander * Math.cos(phase);
      item.y = benchHomes[i * 2 + 1]! + SPRITE_BENCH.wander * Math.sin(phase);
      item.sortY = item.y;
    }
  };

  let mode = 0;

  return {
    scene,
    update(nowMs, taps) {
      mode = (mode + taps) % MODES.length;
      const { bench: useBench, useDepth, night } = MODES[mode]!;
      const sky = night ? SLICE_NIGHT : SLICE_DAY;
      environment.sunColor = sky.sunColor;
      environment.ambientColor = sky.ambientColor;
      lights.count = night ? lamps.length : 0;
      const seconds = nowMs / 1000;
      camera.x = CENTER + 40 * Math.sin(seconds * 0.17);
      camera.y = CENTER + 20 + 25 * Math.sin(seconds * 0.23 + 1);

      if (useBench) moveBench(seconds);
      else moveSlice(seconds);
      const current = useBench ? bench : slice;

      sprites.useDepth = useDepth;
      sprites.count = 0;
      if (useDepth) {
        // List order, on purpose: if depth is right, order only settles exact ties.
        for (let i = 0; i < current.items.length; i++) write(current.items[i]!);
      } else {
        sortByGround(current);
        for (let i = 0; i < current.order.length; i++) write(current.items[current.order[i]!]!);
      }
    },
    note() {
      return MODES[mode]!.note;
    },
  };
}
