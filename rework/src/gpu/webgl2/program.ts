// Owns: compiling programs, finding what they need, and their vertex state.
import type { ProgramDesc, ProgramHandle } from '../../contracts/index.ts';

export interface UniformSlot {
  readonly location: WebGLUniformLocation;
  readonly type: number;
}

export interface InternalProgram extends ProgramHandle {
  readonly name: string;
  readonly program: WebGLProgram;
  readonly vertexArray: WebGLVertexArrayObject;
  readonly instanceBuffer: WebGLBuffer;
  /** Floats per instance; 0 if the program has no instance attributes. */
  readonly stride: number;
  readonly samplers: ReadonlyMap<string, WebGLUniformLocation>;
  readonly uniforms: ReadonlyMap<string, UniformSlot>;
}

const HEADER = '#version 300 es\nprecision highp float;\n';
const CORNER_LOCATION = 0;

function compile(gl: WebGL2RenderingContext, type: number, source: string, name: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`shader ${name}: could not create`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader ${name}: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function readUniforms(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const samplers = new Map<string, WebGLUniformLocation>();
  const uniforms = new Map<string, UniformSlot>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    const location = info && gl.getUniformLocation(program, info.name);
    if (!info || !location) continue;
    if (info.type === gl.SAMPLER_2D) samplers.set(info.name, location);
    else uniforms.set(info.name.replace('[0]', ''), { location, type: info.type });
  }
  return { samplers, uniforms };
}

export function createInternalProgram(
  gl: WebGL2RenderingContext,
  desc: ProgramDesc,
  cornerBuffer: WebGLBuffer,
): InternalProgram {
  const program = gl.createProgram();
  const vertexSource = `${HEADER}in vec2 aCorner;\n${desc.vertex}`;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource, desc.name));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, HEADER + desc.fragment, desc.name));
  gl.bindAttribLocation(program, CORNER_LOCATION, 'aCorner');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program ${desc.name}: ${gl.getProgramInfoLog(program)}`);
  }

  const vertexArray = gl.createVertexArray();
  const instanceBuffer = gl.createBuffer();
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.enableVertexAttribArray(CORNER_LOCATION);
  gl.vertexAttribPointer(CORNER_LOCATION, 2, gl.FLOAT, false, 0, 0);

  let stride = 0;
  for (const attribute of desc.instanceAttributes) stride += attribute.size;
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  let offset = 0;
  for (const attribute of desc.instanceAttributes) {
    const location = gl.getAttribLocation(program, attribute.name);
    if (location >= 0) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, attribute.size, gl.FLOAT, false, stride * 4, offset * 4);
      gl.vertexAttribDivisor(location, 1);
    }
    offset += attribute.size;
  }
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    __handle: 'program',
    name: desc.name,
    program,
    vertexArray,
    instanceBuffer,
    stride,
    ...readUniforms(gl, program),
  };
}
