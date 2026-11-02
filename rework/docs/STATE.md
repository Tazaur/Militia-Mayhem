# State

Update at the end of every round. Replace old content; history belongs in `DECISIONS.md`.

**Stage:** 0 built and deployed at `/rework/`. Its last exit check is the user seeing the FPS counter on the phone. The illegal-import check passes (`tests/lint.test.mjs`).
**Old game:** frozen at build 417 (`DECISIONS.md` D10), playable at the repo root.

## Next step

Stage 1, question 1 in `PLAN.md`: draw ground art on the 480 px grid with a moving camera and judge the scrolling. Before that round:

1. Add per-pass GPU timers to `gpu/` and show them in the readout, so every Stage 1 round has phone numbers.
2. Port the atlas pair into `rework/` (`MIGRATION.md`, read `atlas_table.py` and `drop.py` fully first).
3. Add `render/layers` sprite drawing and a hand-written slice scene in `scene/`.

## Open questions for the user

| # | Question | Default until answered |
|---|---|---|
| 1 | Tilt: real oblique projection, or straight-down with no wall faces? | Build with `tilt` as a parameter; recommend from Stage 1 screenshots; the user decides |
| 2 | Split-screen and shared-screen fit: does each view keep the pixel size and show fewer tiles, or the tile count with smaller pixels? | Keep pixel size; review in Stage 7 |
| 3 | Ultra-wide: cap the visible width, for fairness online? | Cap at about 21:9 |
| 4 | Which weak phones must run the game? Is iPhone required? | Tiers exist; only the user's Android and laptop are tested |
| 5 | Is `grit` wanted, or is it superseded by the new grade? | Dropped |
| 6 | Vehicle zoom: is "in motion" the player's vehicle moving at all, or above some speed? What level? | Any movement; level from Stage 1 |

## To resolve at their stage

- **WebGL context loss** is not handled: a phone that drops the context shows a black screen. `gpu/` keeps no descriptors to rebuild from yet. Add it before Stage 2.
- **Rule A8 and two browser APIs:** A8 says browser code lives in `platform/` and `gpu/`, and the lint enforces that, but `ARCHITECTURE.md` plans Web Audio under `audio/` and WebRTC under `net/`. Decide in Stage 6 and Stage 8: move them under `platform/`, or ask the user to widen A8.
- **`FrameScene` list layouts and `Intent`** are first versions, written before anything reads them. Stages 1 and 2 finalise them.

## Bug class ledger (rule P1)

A class seen twice gets redesigned, not patched.

| Class | Seen | Status |
|---|---|---|
| (from old game) GPU state leaking between passes | many | Designed out: rule A5; `gpu.draw` throws on an undeclared sampler or uniform, and unbinds after each pass |
| (from old game) Light cap causes flicker from ranking ties | twice | Designed out: light budget + stable ranking; verify in Stage 1 |
| (from old game) Height-buffer phantom shadows | many | Watch in Stage 1 |

## Known risks

1. **Rotation at low resolution.** The biggest visual risk: a top-down shooter rotates everything, constantly. Stage 1 question 2.
2. **Art.** Tilt needs wall-face art. Goal-quality art is not yet available, so Stage 1 can only partly match `goal.png`.
3. **Parity scope.** The old game has about 400 builds of tuning. `MIGRATION.md` must be walked, not assumed.
4. **Old code not fully read.** Not read in depth: most of `3_sim`, `4_ai`, `5c_net`, `5d_dev`, `6_menus`, `2b_ground`, the editors, the Python tools. Read each one fully when its stage begins, and update `MIGRATION.md`.
5. **Measured so far: nothing on real hardware.** The smoke test runs in software rendering, so its frame numbers mean nothing. Real numbers start with Stage 1's timers.
