// Owns: the seams for fog of war, air and post. Each draws into what it is given and hides how.
import type { Camera, ParticleList, VisibilityView, VolumeView } from './frame-scene.ts';
import type { Gpu, TargetHandle, TextureHandle } from './gpu.ts';
import type { LightMaps } from './lighting.ts';
import type { QualityTier } from './quality.ts';

export interface FogInput {
  readonly target: TargetHandle;
  readonly visibility: VisibilityView;
  readonly camera: Camera;
}

export interface FogModel {
  init(gpu: Gpu, quality: QualityTier): void;
  render(input: FogInput): void;
  dispose(): void;
}

export interface AirInput {
  readonly target: TargetHandle;
  readonly volumes: VolumeView;
  readonly particles: ParticleList;
  readonly lightMaps: LightMaps;
  readonly camera: Camera;
}

export interface AirModel {
  init(gpu: Gpu, quality: QualityTier): void;
  render(input: AirInput): void;
  dispose(): void;
}

export interface PostInput {
  readonly world: TextureHandle;
  readonly glow: TextureHandle;
  /** The output size in device pixels. */
  readonly screenWidth: number;
  readonly screenHeight: number;
}

export interface Post {
  init(gpu: Gpu, quality: QualityTier): void;
  /** Draws the finished world to the screen. */
  render(input: PostInput): void;
  dispose(): void;
}
