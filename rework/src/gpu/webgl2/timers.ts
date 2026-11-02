// Owns: measuring GPU time per pass with timer queries, where the device has them.
import type { PassTiming } from '../../contracts/index.ts';

interface Pending {
  readonly query: WebGLQuery;
  readonly row: { name: string; ms: number };
}

// Each reading moves the shown number 5% of the way: about a second of smoothing at 60 fps.
const SMOOTHING = 0.05;

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

  return {
    rows,
    begin(name) {
      if (!extension) return;
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
      if (!extension) return;
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
