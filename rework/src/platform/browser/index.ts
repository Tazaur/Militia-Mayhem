// Owns: the browser: canvas, resize, frame loop, storage, and showing fatal errors on the screen.
import type { ImageHandle, Platform, RenderSurface } from '../../contracts/index.ts';

export function createBrowserPlatform(): Platform {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);

  const size = { width: 1, height: 1 };
  const syncSize = () => {
    // In a browser's desktop-site mode the page is laid out wider than the screen and shrunk to fit. Without this the
    // canvas gets more pixels than the screen has (measured on the S23 Ultra: 2573x4641 on a 1080 wide screen).
    const shrink = Math.min(1, window.visualViewport?.scale ?? 1);
    const pixelRatio = (window.devicePixelRatio || 1) * shrink;
    size.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    size.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    canvas.width = size.width;
    canvas.height = size.height;
  };
  syncSize();
  window.addEventListener('resize', syncSize);
  window.visualViewport?.addEventListener('resize', syncSize);

  let taps = 0;
  canvas.addEventListener('pointerdown', () => taps++);

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
    takeTaps() {
      const taken = taps;
      taps = 0;
      return taken;
    },
    async decodeImage(url) {
      const blob = await (await fetch(url)).blob();
      const options: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
      return (await createImageBitmap(blob, options)) as unknown as ImageHandle;
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
    deviceInfo() {
      return `${navigator.userAgent}  ratio ${window.devicePixelRatio}  page scale ${window.visualViewport?.scale}`;
    },
    offerReport(make) {
      const button = document.createElement('button');
      button.textContent = 'COPY REPORT';
      button.style.cssText =
        'position:fixed;right:8px;bottom:8px;padding:12px;font:bold 14px monospace;' +
        'color:#fff;background:#000a;border:1px solid #fff8';
      button.addEventListener('click', () => {
        const report = make();
        // Clipboard access can be refused, so a text box the player can copy from by hand is the fallback.
        navigator.clipboard
          .writeText(report)
          .then(() => {
            button.textContent = 'COPIED';
            setTimeout(() => (button.textContent = 'COPY REPORT'), 2000);
          })
          .catch(() => {
            const box = document.createElement('textarea');
            box.value = report;
            box.style.cssText = 'position:fixed;inset:10%;width:80%;height:80%;font:12px monospace';
            box.addEventListener('blur', () => box.remove());
            document.body.append(box);
            box.select();
          });
      });
      document.body.append(button);
    },
    fatal,
  };
}
