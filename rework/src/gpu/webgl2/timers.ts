// Owns: measuring GPU time: per pass with timer queries where the device has them, else a whole-frame estimate.
import type { PassTiming } from '../../contracts/index.ts';

interface Pending {
  readonly query: WebGLQuery;
  readonly row: { name: string; ms: number };
}

// Each reading moves the shown number 5% of the way: about a second of smoothing at 60 fps.
const SMOOTHING = 0.05;
// The estimate stalls the page while the GPU catches up, so it measures one frame a second and smooths less.
const ESTIMATE_EVERY_FRAMES = 60;
const ESTIMATE_SMOOTHING = 0.3;

export interface Timers {
  begin(name: string): void;
  end(): void;
  poll(): void;
  readonly rows: readonly PassTiming[];
}

export function createTimers(gl: WebGL2RenderingContext): Timers {
  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  const rows: { name: string; ms: number }[] = [];
  const rowByName = new Map<string, { name: string; ms: number }>();
  const free: WebGLQuery[] = [];
  const pending: Pending[] = [];
  let open = false;

  // Reading a pixel back blocks until the GPU has finished everything before it. So: wait for the GPU, time the next
  // frame's first draw to its end, and read again. Android browsers often hide timer queries; this needs nothing.
  const pixel = new Uint8Array(4);
  const waitForGpu = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const estimate = { name: 'estimate', ms: 0 };
  let frames = 0;
  let armed = false;
  let startedAt = -1;

  const pollEstimate = () => {
    if (startedAt >= 0) {
      waitForGpu();
      const ms = performance.now() - startedAt;
      startedAt = -1;
      armed = false;
      if (rows.length === 0) {
        rows.push(estimate);
        estimate.ms = ms;
      } else {
        estimate.ms += (ms - estimate.ms) * ESTIMATE_SMOOTHING;
      }
      return;
    }
    frames++;
    if (frames % ESTIMATE_EVERY_FRAMES === 0) {
      waitForGpu();
      armed = true;
    }
  };

  return {
    rows,
    begin(name) {
      if (!extension) {
        if (armed && startedAt < 0) startedAt = performance.now();
        return;
      }
      let row = rowByName.get(name);
      if (!row) {
        row = { name, ms: 0 };
        rowByName.set(name, row);
        rows.push(row);
      }
      const query = free.pop() ?? gl.createQuery();
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      pending.push({ query, row });
      open = true;
    },
    end() {
      if (!extension || !open) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      open = false;
    },
    poll() {
      if (!extension) {
        pollEstimate();
        return;
      }
      const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT) as boolean;
      let done = 0;
      while (done < pending.length) {
        const { query, row } = pending[done]!;
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!disjoint) {
          const ms = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
          row.ms += (ms - row.ms) * SMOOTHING;
        }
        free.push(query);
        done++;
      }
      if (done > 0) pending.splice(0, done);
    },
  };
}
