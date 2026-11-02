// Owns: the browser: canvas, resize, frame loop, storage, and showing fatal errors on the screen.
import type { Platform, RenderSurface } from '../../contracts/index.ts';

export function createBrowserPlatform(): Platform {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);

  const size = { width: 1, height: 1 };
  const syncSize = () => {
    const pixelRatio = window.devicePixelRatio || 1;
    size.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    size.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    canvas.width = size.width;
    canvas.height = size.height;
  };
  syncSize();
  window.addEventListener('resize', syncSize);

  const fatal = (message: string) => {
    const box = document.createElement('pre');
    box.textContent = message;
    box.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;color:#fff;background:#300;white-space:pre-wrap';
    document.body.append(box);
  };
  // A phone has no console, so errors have to reach the screen.
  window.addEventListener('error', (event) => fatal(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => fatal(String(event.reason)));

  return {
    surface: canvas as unknown as RenderSurface,
    screenSize: () => size,
    now: () => performance.now(),
    startLoop(frame) {
      const step = (nowMs: number) => {
        requestAnimationFrame(step);
        frame(nowMs);
      };
      requestAnimationFrame(step);
    },
    storageGet(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    storageSet(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Private windows can refuse storage. Settings then last only for this session.
      }
    },
    fatal,
  };
}
