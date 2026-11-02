// Owns: the real Post. So far the sharp upscale; the grade and bloom come with Stage 1's cinematic pass.
import type { Gpu, Pass, Post, PostInput } from '../../../contracts/index.ts';
import { SCREEN_TO_TARGET_GLSL } from '../../projection/index.ts';

const VERTEX = `
out vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Sharp bilinear: each game pixel stays solid and only its edge, one screen pixel wide, blends with the next. Most
// screens are not a whole multiple of 480 (the S23 Ultra is 1.71x), and this keeps pixels even when the camera moves.
const FRAGMENT = `
in vec2 vUv;
uniform sampler2D uWorld;
uniform float uScale;
out vec4 outColor;
${SCREEN_TO_TARGET_GLSL}
void main() {
  vec2 pixel = screenToTargetPixel(vUv);
  vec2 edge = floor(pixel + 0.5);
  vec2 sharp = edge + clamp((pixel - edge) * uScale, -0.5, 0.5);
  outColor = vec4(texture(uWorld, targetPixelToUv(sharp)).rgb, 1.0);
}`;

export function createFullPost(): Post {
  let gpu: Gpu | null = null;
  let pass: Pass | null = null;
  const grid = new Float32Array(2);
  const offset = new Float32Array(2);
  const target = new Float32Array(2);
  const scale = new Float32Array(1);
  const inputs = [{ sampler: 'uWorld', texture: { __handle: 'texture' } as PostInput['world'] }];
  return {
    init(owner) {
      gpu = owner;
      pass = {
        name: 'post',
        target: null,
        program: owner.createProgram({ name: 'post', vertex: VERTEX, fragment: FRAGMENT, instanceAttributes: [] }),
        inputs,
        uniforms: [
          { name: 'uGrid', value: grid },
          { name: 'uOffset', value: offset },
          { name: 'uTarget', value: target },
          { name: 'uScale', value: scale },
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
      scale[0] = input.screenHeight / input.gridHeight;
      gpu.draw(pass);
    },
    dispose() {
      gpu = null;
      pass = null;
    },
  };
}
