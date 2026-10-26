# WebGL rewrite (branch `webgl`, worktree `../Militia Mayhem GL`)

Goal: 100+ fps steady (Intel UHD 1280×720 and phones). Live game (main, `/`) stays untouched; this build deploys to `/gl/`.
`?2d` on the URL runs the same build on the old Canvas2D path (A/B compare, fallback when WebGL2 is missing; node tests always 2D).

## Deploy
- Build here: `python build.py` (GL branch build.py writes index.html + version.json here).
- `sh gldeploy.sh` copies index.html → main checkout `gl/index.html` + `gl/version.json`, commits + pushes main (only `gl/`).
- Merge main into `webgl` regularly (`git merge main`) so gameplay fixes carry over.
- Settings: stored under `mmgl.` (falls back to reading the live `combinedarms.` keys), so the two builds never fight.

## Architecture
- `#g` WebGL2 canvas under `#c`. `#c` (2D) is now a transparent overlay: HUD, menus, touch, dev panel, input.
- `src/0_gx.js` **GX**: the Canvas2D API on WebGL2 (batched): transforms, alpha, all composite modes (fixed function;
  multiply exact in two passes; unbounded modes cleared outside; color-dodge / saturation via a dst-copy shader), colours,
  linear / radial gradients (ramp texture), patterns, rects, paths (convex fan / stencil-then-cover), strokes (joins, caps,
  dashes, once-only stencil when translucent), rect clip (scissor) + path clip (stencil bit 7), drawImage of any
  image / canvas (dynamic atlas or own texture, re-uploaded only when its 2D context drew: prototype hook) or GL surface,
  text (string cache), `filter` blur.
- **GL surfaces** (`mkG(w, h)`): canvas-like (width / height / getContext('2d') → GX) on an FBO texture. Used for every
  canvas a GL surface flows into or that is big / redrawn per frame: ground, decals, prints (fade: `fadeAlpha` shader),
  fog memory, FOG_OUT / FOG_TMP / FOG_NOW, smoke SMK_C / SMK_SH / SMK_L, the light maps GC.
- Light module (5e_light) runs on the shared context: units 0–7 are its own, GX uses 8–15; its default framebuffer
  becomes the GC surface's FBO. GX re-establishes its state after any outside GL use (`gxYield`).

## Phases
- A. Infra: worktree, /gl/ deploy, settings namespace, ?2d, compare + perf scripts (scratchpad/pw).
- B. GX + surfaces + overlay; whole game renders on GL with identical code paths. Verify vs 2D screenshots.
- C. GPU systems: light composite in one shader (no 2D blend passes); fog composite shader; smoke as instanced puffs at
  low res with shader self-shade + per-puff light; smoke sight mask on GPU (CPU fieldOcc stays for bots); point lights
  per-light quads, half-res; static height cache; grade / rain / vignette post shader.
- D. CPU: buildNav cache, HUD text cache, GC churn (pooled arrays), frame-spike hunt, dev perf overlay (GPU / CPU per system).
- E. Consolidate (MRT heights + materials, drop dead 2D paths), switch over only on approval.

## Rules
- No gameplay changes here except merges from main. Every phase: tests + GL screenshots vs `?2d`, perf numbers.
