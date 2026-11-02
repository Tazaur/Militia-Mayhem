// Owns: game data. Classes arrive as data as their stages come.
import type { QualityTier } from '../contracts/index.ts';

export { ATLAS_SPRITES } from './atlas-table.ts';
export type { AtlasSprite } from './atlas-table.ts';
export { makePlaceholderGround, PLACEHOLDER_GROUND_SIZE } from './placeholder-ground.ts';
export { ROTATION_FRAMES, ROTATION_TABLE } from './rotation-frames.ts';
export { ROTATION_COLUMN_SPACING, ROTATION_ITEMS } from './slice-props.ts';

export const DEFAULT_QUALITY: QualityTier = 'high';
