// Owns: the network seam. Local play uses the loopback, so online and local follow one code path.
export interface Transport {
  send(message: Uint8Array): void;
  /** Hands over every message that has arrived since the last call. */
  receive(handler: (message: Uint8Array) => void): void;
  close(): void;
}
