// Owns: every WebGL call. Each draw states its full needs and leaves nothing bound, so state cannot leak (rule A5).
import type {
  Filter,
  Gpu,
  ImageHandle,
  Pass,
  PassUniform,
  RenderSurface,
  Rgba,
  TargetHandle,
  TextureHandle,
} from '../../contracts/index.ts';
import { createInternalProgram } from './program.ts';
import type { InternalProgram, UniformSlot } from './program.ts';
import { createTimers } from './timers.ts';

interface InternalTexture extends TextureHandle {
  readonly texture: WebGLTexture;
}

interface InternalTarget extends TargetHandle {
  readonly framebuffer: WebGLFramebuffer;
  readonly color: InternalTexture;
  width: number;
  height: number;
}

function setUniform(gl: WebGL2RenderingContext, slot: UniformSlot, uniform: PassUniform): void {
  const { location, type } = slot;
  const value = uniform.value;
  if (typeof value === 'number') {
    if (type !== gl.FLOAT) throw new Error(`uniform ${uniform.name}: a number was given for a non-float`);
    gl.uniform1f(location, value);
    return;
  }
  const list = value as Float32Array;
  if (type === gl.FLOAT) gl.uniform1fv(location, list);
  else if (type === gl.FLOAT_VEC2) gl.uniform2fv(location, list);
  else if (type === gl.FLOAT_VEC3) gl.uniform3fv(location, list);
  else if (type === gl.FLOAT_VEC4) gl.uniform4fv(location, list);
  else if (type === gl.FLOAT_MAT4) gl.uniformMatrix4fv(location, false, list);
  else throw new Error(`uniform ${uniform.name}: unsupported type ${type}`);
}

/** Returns null if this device has no WebGL2. */
export function createWebGl2Gpu(surface: RenderSurface): Gpu | null {
  const canvas = surface as unknown as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const cornerBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const timers = createTimers(gl);

  const newTexture = (filter: Filter): InternalTexture => {
    const texture = gl.createTexture();
    const mode = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { __handle: 'texture', texture };
  };

  const allocate = (width: number, height: number, pixels: Uint8Array | null) => {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  };

  const bindOutput = (target: InternalTarget | null, pass: Pass | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    const viewport = pass?.viewport;
    if (viewport) gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    else if (target) gl.viewport(0, 0, target.width, target.height);
    else gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  };

  const setBlend = (blend: Pass['blend']) => {
    if (blend === 'none') {
      gl.disable(gl.BLEND);
      return;
    }
    gl.enable(gl.BLEND);
    if (blend === 'alpha') gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);
  };

  return {
    createTexture(desc) {
      const created = newTexture(desc.filter);
      allocate(desc.width, desc.height, desc.pixels);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return created;
    },
    createImageTexture(image: ImageHandle, filter) {
      const created = newTexture(filter);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const bitmap = image as unknown as ImageBitmap;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return created;
    },
    createTarget(desc) {
      const color = newTexture(desc.filter);
      allocate(desc.width, desc.height, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color.texture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      const target: InternalTarget = {
        __handle: 'target',
        framebuffer,
        color,
        width: desc.width,
        height: desc.height,
      };
      return target;
    },
    resizeTarget(handle, width, height) {
      const target = handle as InternalTarget;
      target.width = width;
      target.height = height;
      gl.bindTexture(gl.TEXTURE_2D, target.color.texture);
      allocate(width, height, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    targetTexture: (handle) => (handle as InternalTarget).color,
    createProgram: (desc) => createInternalProgram(gl, desc, cornerBuffer),
    clear(handle, color: Rgba) {
      bindOutput(handle as InternalTarget | null, null);
      gl.clearColor(color.r, color.g, color.b, color.a);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    draw(pass) {
      const program = pass.program as InternalProgram;
      const target = pass.target as InternalTarget | null;
      // A sampler or uniform nobody declared would read what an earlier pass left: the old game's worst bug class.
      if (pass.inputs.length !== program.samplers.size) {
        throw new Error(`pass ${pass.name}: program ${program.name} needs ${program.samplers.size} inputs`);
      }
      if (pass.uniforms.length !== program.uniforms.size) {
        throw new Error(`pass ${pass.name}: program ${program.name} needs ${program.uniforms.size} uniforms`);
      }

      bindOutput(target, pass);
      setBlend(pass.blend);
      gl.useProgram(program.program);

      for (let unit = 0; unit < pass.inputs.length; unit++) {
        const input = pass.inputs[unit]!;
        const location = program.samplers.get(input.sampler);
        if (!location) throw new Error(`pass ${pass.name}: no sampler ${input.sampler}`);
        const texture = input.texture as InternalTexture;
        if (target && texture === target.color) throw new Error(`pass ${pass.name} reads the target it draws to`);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture.texture);
        gl.uniform1i(location, unit);
      }
      for (const uniform of pass.uniforms) {
        const slot = program.uniforms.get(uniform.name);
        if (!slot) throw new Error(`pass ${pass.name}: no uniform ${uniform.name}`);
        setUniform(gl, slot, uniform);
      }

      gl.bindVertexArray(program.vertexArray);
      const instances = pass.instances;
      if (program.stride > 0 && !instances) throw new Error(`pass ${pass.name}: program needs instance data`);
      if (instances) {
        gl.bindBuffer(gl.ARRAY_BUFFER, program.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, instances.data, gl.DYNAMIC_DRAW, 0, instances.count * program.stride);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      }
      timers.begin(pass.name);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances ? instances.count : 1);
      timers.end();

      gl.bindVertexArray(null);
      for (let unit = 0; unit < pass.inputs.length; unit++) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    endFrame() {
      timers.poll();
    },
    passTimings: () => timers.rows,
  };
}
