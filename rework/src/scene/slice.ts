// Owns: Stage 1's hand-written scene: the tilt test, one block. Stage 2 replaces it with the sim.
import {
  ATLAS_SPRITES,
  PLACEHOLDER_RECTS,
  SLICE_BOXES,
  SLICE_MOVERS,
  SLICE_POSTS,
  SLICE_STILLS,
} from '../content/index.ts';
import type { PlaceholderRect, SlicePart } from '../content/index.ts';
import type { FrameScene } from '../contracts/index.ts';

const CENTER = 2000;
const FLAG_UPRIGHT = 1;
const FLAG_PLACEHOLDER = 2;
const TILE = 32;
// Sorts after every ground position: crowns and lamp heads are overhead. Stage 4's overhead layer replaces this.
const OVERHEAD = 1e6;
const MODES = [
  { tilt: 0.25, name: 'TILT 0.25' },
  { tilt: 0, name: 'TILT 0' },
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

export function createSliceScene(): SliceScene {
  const items = buildStillItems();
  const moverParts: MovingPart[][] = SLICE_MOVERS.map((mover) =>
    mover.parts.map((part: SlicePart) => {
      const item = atlasItem(part.sprite, CENTER, CENTER, part.z, 0, CENTER);
      items.push(item);
      return { item, swing: part.swing };
    }),
  );

  const capacity = items.length;
  const atlasRect = new Float32Array(capacity * 4);
  const position = new Float32Array(capacity * 3);
  const pivot = new Float32Array(capacity * 2);
  const transform = new Float32Array(capacity * 2);
  const tint = new Float32Array(capacity * 4).fill(1);
  const flags = new Float32Array(capacity);
  const order = new Int32Array(items.length).map((_, index) => index);

  const camera = { x: CENTER, y: CENTER, tilt: 0, zoom: 1 };
  const none = new Float32Array(0);
  const sprites = { count: 0, atlasRect, position, pivot, transform, tint, flags };
  const scene: FrameScene = {
    camera,
    environment: {
      sunDirection: [0, 0, 1],
      sunColor: { r: 1, g: 1, b: 1 },
      ambientColor: { r: 0.05, g: 0.06, b: 0.05 },
    },
    sprites,
    casters: { count: 0, atlasRect: none, position: none, transform: none },
    lights: { count: 0, position: none, color: none, shape: none },
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

  let mode = 0;

  return {
    scene,
    update(nowMs, taps) {
      mode = (mode + taps) % MODES.length;
      const seconds = nowMs / 1000;
      camera.tilt = MODES[mode]!.tilt;
      // Slow, so the art can be studied, but moving, to read dropped frames against the still-camera build 420.
      camera.x = CENTER + 40 * Math.sin(seconds * 0.17);
      camera.y = CENTER + 20 + 25 * Math.sin(seconds * 0.23 + 1);

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

      // Nearly sorted from the last frame, so insertion sort does almost no work. Equal keys keep their list order,
      // which holds a turret on its hull.
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

      sprites.count = 0;
      for (let i = 0; i < order.length; i++) {
        write(items[order[i]!]!);
      }
    },
    note() {
      return `${MODES[mode]!.name}  TAP`;
    },
  };
}
