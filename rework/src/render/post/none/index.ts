// Owns: the null Post (rule A6): a plain nearest-pixel upscale, no effects.
import type { Gpu, Pass, PostInput, Post, ProgramHandle } from '../../../contracts/index.ts';
import { SCREEN_TO_TARGET_GLSL } from '../../projection/index.ts';

const VERTEX = `
out vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `
in vec2 vUv;
uniform sampler2D uWorld;
out vec4 outColor;
${SCREEN_TO_TARGET_GLSL}
void main() {
  vec2 pixel = floor(screenToTargetPixel(vUv)) + 0.5;
  outColor = vec4(texture(uWorld, targetPixelToUv(pixel)).rgb, 1.0);
}`;

export function createPlainPost(): Post {
  let gpu: Gpu | null = null;
  let program: ProgramHandle | null = null;
  const grid = new Float32Array(2);
  const offset = new Float32Array(2);
  const target = new Float32Array(2);
  let pass: Pass | null = null;
  const inputs = [{ sampler: 'uWorld', texture: { __handle: 'texture' } as PostInput['world'] }];
  return {
    init(owner) {
      gpu = owner;
      program = owner.createProgram({
        name: 'post-plain',
        vertex: VERTEX,
        fragment: FRAGMENT,
        instanceAttributes: [],
      });
      pass = {
        name: 'post-plain',
        target: null,
        program,
        inputs,
        uniforms: [
          { name: 'uGrid', value: grid },
          { name: 'uOffset', value: offset },
          { name: 'uTarget', value: target },
        ],
        blend: 'none',
        instances: null,
      };
    },
    render(input) {
      if (!gpu || !pass) throw new Error('post used before init');
      inputs[0]!.texture = input.world;
      grid[0] = input.gridWidth;
      grid[1] = input.gridHeight;
      offset[0] = input.offsetX;
      offset[1] = input.offsetY;
      target[0] = input.targetWidth;
      target[1] = input.targetHeight;
      gpu.draw(pass);
    },
    dispose() {
      gpu = null;
      program = null;
      pass = null;
    },
  };
}
