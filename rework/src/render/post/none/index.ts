// Owns: the null Post (rule A6): a plain nearest-pixel upscale, no effects.
import type { Gpu, Pass, Post, PostInput, ProgramHandle } from '../../../contracts/index.ts';

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
void main() {
  outColor = vec4(texture(uWorld, vUv).rgb, 1.0);
}`;

export function createPlainPost(): Post {
  let gpu: Gpu | null = null;
  let program: ProgramHandle | null = null;
  return {
    init(owner) {
      gpu = owner;
      program = owner.createProgram({
        name: 'post-plain',
        vertex: VERTEX,
        fragment: FRAGMENT,
        instanceAttributes: [],
      });
    },
    render(input: PostInput) {
      if (!gpu || !program) throw new Error('post used before init');
      const pass: Pass = {
        name: 'post-plain',
        target: null,
        program,
        inputs: [{ sampler: 'uWorld', texture: input.world }],
        uniforms: [],
        blend: 'none',
        instances: null,
      };
      gpu.draw(pass);
    },
    dispose() {
      gpu = null;
      program = null;
    },
  };
}
