// Owns: the lighting seam. Nothing else in the game knows how shadows are made.
import type { Camera, CasterList, Environment, LightList, Rgb } from './frame-scene.ts';
import type { Gpu, TextureHandle } from './gpu.ts';
import type { QualityTier } from './quality.ts';

export interface Surfaces {
  readonly color: TextureHandle;
  /** Height, reflect, glow. Exact layout is private to surfaces and lighting. */
  readonly material: TextureHandle;
}

export interface LightingInput {
  readonly surfaces: Surfaces;
  readonly casters: CasterList;
  readonly lights: LightList;
  readonly environment: Environment;
  readonly camera: Camera;
  /** The world target's size, and the world position of its top-left pixel. Light maps match it. */
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly originX: number;
  readonly originY: number;
}

export interface LightMaps {
  readonly shade: TextureHandle;
  readonly highlight: TextureHandle;
  readonly glow: TextureHandle;
}

export interface LightingModel {
  init(gpu: Gpu, quality: QualityTier): void;
  render(input: LightingInput): LightMaps;
  /** The one CPU light query (bots, smoke puffs). */
  query(x: number, y: number, z: number): Rgb;
  dispose(): void;
}
