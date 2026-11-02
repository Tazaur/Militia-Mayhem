// Owns: game data. Stage 0 has only the default quality tier; classes arrive as data from Stage 1 onward.
import type { QualityTier } from '../contracts/index.ts';

export const DEFAULT_QUALITY: QualityTier = 'high';
