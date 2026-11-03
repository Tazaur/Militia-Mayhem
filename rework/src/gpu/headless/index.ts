// Owns: the null Gpu (rule A6): no GPU, it records which passes ran so tests can check the frame.
import type { Gpu, Pass, ProgramHandle, TargetHandle, TextureHandle } from '../../contracts/index.ts';

export interface HeadlessGpu extends Gpu {
  /** Pass names since the last `takePasses`. */
  takePasses(): string[];
}

export function createHeadlessGpu(): HeadlessGpu {
  const targetTextures = new Map<TargetHandle, TextureHandle>();
  const depthTargets = new Set<TargetHandle>();
  let passes: string[] = [];
  const newTexture = (): TextureHandle => ({ __handle: 'texture' });
  return {
    createTexture: newTexture,
    createImageTexture: newTexture,
    createTarget(desc) {
      const target: TargetHandle = { __handle: 'target' };
      targetTextures.set(target, newTexture());
      if (desc.depth) depthTargets.add(target);
      return target;
    },
    resizeTarget() {},
    targetTexture(target) {
      const texture = targetTextures.get(target);
      if (!texture) throw new Error('unknown target');
      return texture;
    },
    createProgram(): ProgramHandle {
      return { __handle: 'program' };
    },
    clear() {},
    draw(pass: Pass) {
      const output = pass.target && targetTextures.get(pass.target);
      for (const input of pass.inputs) {
        if (input.texture === output) throw new Error(`pass ${pass.name} reads the target it draws to`);
      }
      if (pass.depthTest && !(pass.target && depthTargets.has(pass.target))) {
        throw new Error(`pass ${pass.name} tests depth on a target without any`);
      }
      passes.push(pass.name);
    },
    discardDepth() {},
    endFrame() {},
    passTimings: () => [],
    deviceName: () => 'headless gpu',
    takePasses() {
      const taken = passes;
      passes = [];
      return taken;
    },
  };
}
