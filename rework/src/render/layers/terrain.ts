// Owns: drawing the ground. For now one repeating texture; pages and stamps come in Stage 4.
import type { Gpu, Pass, TargetHandle, TextureHandle } from '../../contracts/index.ts';
import type { GridView } from '../projection/index.ts';

const VERTEX = `
out vec2 vPixel;
uniform vec2 uTarget;
void main() {
  vPixel = vec2(aCorner.x, 1.0 - aCorner.y) * uTarget;
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `
in vec2 vPixel;
uniform vec2 uOrigin;
uniform sampler2D uGround;
out vec4 outColor;
void main() {
  vec2 world = floor(vPixel) + uOrigin;
  outColor = vec4(texelFetch(uGround, ivec2(mod(world, vec2(textureSize(uGround, 0)))), 0).rgb, 1.0);
}`;

export interface TerrainLayer {
  draw(view: GridView): void;
}

export function createTerrainLayer(gpu: Gpu, target: TargetHandle, ground: TextureHandle): TerrainLayer {
  const program = gpu.createProgram({ name: 'terrain', vertex: VERTEX, fragment: FRAGMENT, instanceAttributes: [] });
  const origin = new Float32Array(2);
  const size = new Float32Array(2);
  const pass: Pass = {
    name: 'terrain',
    target,
    program,
    inputs: [{ sampler: 'uGround', texture: ground }],
    uniforms: [
      { name: 'uOrigin', value: origin },
      { name: 'uTarget', value: size },
    ],
    blend: 'none',
    instances: null,
  };
  return {
    draw(view) {
      origin[0] = view.originX;
      origin[1] = view.originY;
      size[0] = view.targetWidth;
      size[1] = view.targetHeight;
      gpu.draw(pass);
    },
  };
}
