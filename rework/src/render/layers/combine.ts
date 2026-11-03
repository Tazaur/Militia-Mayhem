// Owns: surfaces times light: the world as lit, which everything after it draws on.
import type { Gpu, Pass, TargetHandle, TextureHandle } from '../../contracts/index.ts';

const VERTEX = `
out vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `
in vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uShade;
out vec4 outColor;
void main() {
  outColor = vec4(texture(uColor, vUv).rgb * texture(uShade, vUv).rgb, 1.0);
}`;

export interface CombineLayer {
  draw(shade: TextureHandle): void;
}

export function createCombineLayer(gpu: Gpu, target: TargetHandle, color: TextureHandle): CombineLayer {
  const inputs = [
    { sampler: 'uColor', texture: color },
    { sampler: 'uShade', texture: color },
  ];
  const pass: Pass = {
    name: 'combine',
    target,
    program: gpu.createProgram({ name: 'combine', vertex: VERTEX, fragment: FRAGMENT, instanceAttributes: [] }),
    inputs,
    uniforms: [],
    blend: 'none',
    instances: null,
  };
  return {
    draw(shade) {
      inputs[1]!.texture = shade;
      gpu.draw(pass);
    },
  };
}
