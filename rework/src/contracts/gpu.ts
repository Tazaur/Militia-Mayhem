// Owns: the GPU seam. Only gpu/ implements it. WebGL never appears outside gpu/ (rule A5).
export interface Handle<Kind extends string> {
  readonly __handle: Kind;
}
import type { ImageHandle } from './platform.ts';

export type TextureHandle = Handle<'texture'>;
export type TargetHandle = Handle<'target'>;
export type ProgramHandle = Handle<'program'>;

export type Filter = 'nearest' | 'linear';
export type BlendMode = 'none' | 'alpha' | 'additive';
export type UniformValue = number | readonly number[] | Float32Array;

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextureDesc {
  readonly width: number;
  readonly height: number;
  readonly filter: Filter;
  /** RGBA8, row by row. */
  readonly pixels: Uint8Array;
}

export interface TargetDesc {
  readonly width: number;
  readonly height: number;
  readonly filter: Filter;
}

export interface InstanceAttribute {
  readonly name: string;
  /** Floats per instance: 1 to 4. */
  readonly size: number;
}

export interface ProgramDesc {
  readonly name: string;
  /** GLSL ES 3.00 bodies. gpu/ adds the version and precision lines and provides `in vec2 aCorner` (0 to 1). */
  readonly vertex: string;
  readonly fragment: string;
  readonly instanceAttributes: readonly InstanceAttribute[];
}

export interface PassInput {
  readonly sampler: string;
  readonly texture: TextureHandle;
}

export interface PassUniform {
  readonly name: string;
  readonly value: UniformValue;
}

export interface InstanceData {
  readonly data: Float32Array;
  readonly count: number;
}

/**
 * One draw, with everything it depends on stated. gpu/ binds it all, draws, and unbinds it.
 * It throws if a program's sampler or uniform is not declared here, so nothing can be read from an earlier pass.
 */
export interface Pass {
  readonly name: string;
  /** null is the screen. */
  readonly target: TargetHandle | null;
  /** Defaults to the whole target. */
  readonly viewport?: Viewport;
  readonly program: ProgramHandle;
  readonly inputs: readonly PassInput[];
  readonly uniforms: readonly PassUniform[];
  readonly blend: BlendMode;
  /** null draws one quad. */
  readonly instances: InstanceData | null;
}

/** GPU time of one named pass, smoothed. Empty where the device has no timers. */
export interface PassTiming {
  readonly name: string;
  readonly ms: number;
}

export interface Gpu {
  createTexture(desc: TextureDesc): TextureHandle;
  createImageTexture(image: ImageHandle, filter: Filter): TextureHandle;
  createTarget(desc: TargetDesc): TargetHandle;
  resizeTarget(target: TargetHandle, width: number, height: number): void;
  targetTexture(target: TargetHandle): TextureHandle;
  createProgram(desc: ProgramDesc): ProgramHandle;
  clear(target: TargetHandle | null, color: Rgba): void;
  draw(pass: Pass): void;
  /** Call once per frame, after the last draw. */
  endFrame(): void;
  passTimings(): readonly PassTiming[];
  /** What the graphics chip calls itself, for reports. */
  deviceName(): string;
}
