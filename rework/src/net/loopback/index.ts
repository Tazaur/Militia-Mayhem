// Owns: the null Transport (rule A6): every message sent comes straight back.
import type { Transport } from '../../contracts/index.ts';

export function createLoopbackTransport(): Transport {
  let queue: Uint8Array[] = [];
  return {
    send(message) {
      queue.push(message);
    },
    receive(handler) {
      if (queue.length === 0) return;
      const arrived = queue;
      queue = [];
      for (const message of arrived) handler(message);
    },
    close() {
      queue = [];
    },
  };
}
