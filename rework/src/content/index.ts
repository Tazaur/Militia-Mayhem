// Owns: game data. Classes arrive as data as their stages come.
import type { QualityTier } from '../contracts/index.ts';

export { ATLAS_SPRITES } from './atlas-table.ts';
export type { AtlasSprite } from './atlas-table.ts';
export { makePlaceholderGround, PLACEHOLDER_GROUND_SIZE } from './placeholder-ground.ts';
export { makePlaceholderProps, PLACEHOLDER_PROPS_SIZE, PLACEHOLDER_RECTS } from './placeholder-props.ts';
export type { PlaceholderRect } from './placeholder-props.ts';
export {
  SLICE_BOXES,
  SLICE_DAY,
  SLICE_LAMP,
  SLICE_MOVERS,
  SLICE_NIGHT,
  SLICE_POSTS,
  SLICE_STILLS,
  SPRITE_BENCH,
} from './slice-props.ts';
export type { SlicePart } from './slice-props.ts';

export const DEFAULT_QUALITY: QualityTier = 'high';
