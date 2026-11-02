// Owns: the list of null versions (rule A6). Stage 0's game runs entirely on these.
import { createSilentAudio } from '../audio/silent/index.ts';
import type { AudioOut, Transport } from '../contracts/index.ts';
import { createLoopbackTransport } from '../net/loopback/index.ts';
import { createNoAir } from '../render/air/none/index.ts';
import { createNoFog } from '../render/fog/none/index.ts';
import type { RenderModules } from '../render/frame/index.ts';
import { createUnlitLighting } from '../render/lighting/unlit/index.ts';
import { createPlainPost } from '../render/post/none/index.ts';

export function createNullParts(): RenderModules & { audio: AudioOut; transport: Transport } {
  return {
    lighting: createUnlitLighting(),
    fog: createNoFog(),
    air: createNoAir(),
    post: createPlainPost(),
    audio: createSilentAudio(),
    transport: createLoopbackTransport(),
  };
}
