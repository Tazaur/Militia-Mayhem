// Owns: everything the game needs from what it runs on (rule A8). The browser is one implementation.
export type RenderSurface = { readonly __surface: true };
/** A decoded image, opaque to everything but the matching gpu/ backend. */
export type ImageHandle = { readonly __image: true };

export interface ScreenSize {
  /** Device pixels. */
  readonly width: number;
  readonly height: number;
}

export interface Platform {
  /** Opaque to everything but the matching gpu/ backend. */
  readonly surface: RenderSurface;
  /** The same object every call, updated in place. */
  screenSize(): ScreenSize;
  /** Milliseconds; only differences mean anything. */
  now(): number;
  startLoop(frame: (nowMs: number) => void): void;
  /** Taps or clicks since the last call. Stage 2's input module replaces this. */
  takeTaps(): number;
  /** Decodes without colour conversion or premultiplying, because material images hold numbers, not colours. */
  decodeImage(url: string): Promise<ImageHandle>;
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  /** The browser and screen, for reports. */
  deviceInfo(): string;
  /** Puts a way on screen to take a report off the device. `make` runs only when the player asks. */
  offerReport(make: () => string): void;
  /** Tells the player the game cannot continue. */
  fatal(message: string): void;
}
