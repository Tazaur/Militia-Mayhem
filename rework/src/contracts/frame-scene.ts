// Owns: FrameScene, the one per-view frame list every pass reads (rule A3). Nothing in it references sim objects.
// The list layouts are a first version: Stage 1 finalises them when real passes read them.
export type ReadonlyFloats = Omit<Float32Array, 'set' | 'fill' | 'copyWithin' | 'sort' | 'reverse'> & {
  readonly [index: number]: number;
};

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Camera {
  /** World position, sub-pixel. */
  readonly x: number;
  readonly y: number;
  /** screenY = y - tilt * z. See render/projection. */
  readonly tilt: number;
  /** 1 on foot, the set level in moving vehicles. See DECISIONS.md D11. */
  readonly zoom: number;
}

export interface Environment {
  readonly sunDirection: readonly [x: number, y: number, z: number];
  readonly sunColor: Rgb;
  readonly ambientColor: Rgb;
}

export interface SpriteList {
  readonly count: number;
  /** Four per sprite: x, y, width, height in the atlas. */
  readonly atlasRect: ReadonlyFloats;
  /** Three per sprite: world x, y, z. */
  readonly position: ReadonlyFloats;
  /** Four per sprite: angle, scale, layer, flags. */
  readonly transform: ReadonlyFloats;
  /** Four per sprite: RGBA. */
  readonly tint: ReadonlyFloats;
}

export interface CasterList {
  readonly count: number;
  readonly atlasRect: ReadonlyFloats;
  readonly position: ReadonlyFloats;
  /** Two per caster: angle, scale. */
  readonly transform: ReadonlyFloats;
}

export interface LightList {
  readonly count: number;
  /** Three per light: world x, y, z. */
  readonly position: ReadonlyFloats;
  /** Three per light: RGB. */
  readonly color: ReadonlyFloats;
  /** Four per light: reach, intensity, cone direction, cone width (2 pi for a point light). */
  readonly shape: ReadonlyFloats;
}

export interface ParticleList {
  readonly count: number;
  readonly position: ReadonlyFloats;
  readonly color: ReadonlyFloats;
}

export interface VolumeView {
  readonly width: number;
  readonly height: number;
  readonly density: ReadonlyFloats;
}

export interface StainCommand {
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface VisibilityView {
  /** Pairs of world x, y: a triangle fan around the viewer. */
  readonly polygon: ReadonlyFloats;
  readonly pointCount: number;
}

export interface OverlayList {
  readonly count: number;
  readonly position: ReadonlyFloats;
  readonly color: ReadonlyFloats;
}

export interface FrameScene {
  readonly camera: Camera;
  readonly environment: Environment;
  readonly sprites: SpriteList;
  readonly casters: CasterList;
  readonly lights: LightList;
  readonly particles: ParticleList;
  readonly volumes: VolumeView;
  readonly stains: readonly StainCommand[];
  readonly visibility: VisibilityView;
  readonly worldOverlay: OverlayList;
}
