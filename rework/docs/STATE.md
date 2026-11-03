# State

Update at the end of every round. Replace old content; history belongs in `DECISIONS.md`.

**Stage:** 1, questions 1 to 3 decided (`DECISIONS.md` D13, D15, D16). Question 4, depth buffer or sort, is next.
**Old game:** frozen at build 417 (`DECISIONS.md` D10), playable at the repo root.

## Next step

Stage 1 question 4 in `PLAN.md`: depth buffer or sort, including cost on the phone. At one screen pixel, a higher `z` is always nearer the camera, so depth can be `z` alone (`DECISIONS.md` D9). That would remove the sort and the splitting of walls into tiles. Bench it with many sprites, because the slice's 50 say nothing about cost. Alpha test may be what costs on the phone.

A tap in the slice switches between tilt 0.25 and 0. The atlas has no wall, roof or post art, so the slice uses generated placeholders. No shadows yet, so raised units float a little; lighting comes in question 5.

Phone frame timing is unexplained (`DECISIONS.md` D14, D15): build 419 showed DROP 6 with a moving camera; build 420 showed DROP 0 with a still one. Ask for a COPY REPORT paste from the phone: none has arrived yet, and the recorder has not run on a real phone.

## Open questions for the user

| # | Question | Default until answered |
|---|---|---|
| 1 | Tilt with real buildings: is 0.25 still right, given how much tall buildings hide? (D16) | 0.25; judge again in Stage 4, or when building art arrives |
| 2 | Split-screen and shared-screen fit: does each view keep the pixel size and show fewer tiles, or the tile count with smaller pixels? | Keep pixel size; review in Stage 7 |
| 3 | Ultra-wide: cap the visible width, for fairness online? | Cap at about 21:9 |
| 4 | Which weak phones must run the game? Is iPhone required? | Tiers exist; only the user's Android and laptop are tested |
| 5 | Is `grit` wanted, or is it superseded by the new grade? | Dropped |
| 6 | Vehicle zoom: is "in motion" the player's vehicle moving at all, or above some speed? What level? | Any movement; level from Stage 1 |

## To resolve at their stage

- **WebGL context loss** is not handled: a phone that drops the context shows a black screen. `gpu/` keeps no descriptors to rebuild from yet. Add it before Stage 2.
- **Rule A8 and two browser APIs:** A8 says browser code lives in `platform/` and `gpu/`, and the lint enforces that, but `ARCHITECTURE.md` plans Web Audio under `audio/` and WebRTC under `net/`. Decide in Stage 6 and Stage 8: move them under `platform/`, or ask the user to widen A8.
- **The `nsh_` sprites draw black, and `bagarc` shows a solid fill,** in the slice. Find out what the old game does with them (tint, or a mask) when Stage 3 reads `drawSoldier` and the bag code. Both are left out of the slice for now.
- **Timer accuracy on a tile GPU:** per-pass numbers may land on the wrong pass, because Adreno defers work. Trust the total first.
- **`FrameScene` list layouts and `Intent`** are first versions, written before anything reads them. Stages 1 and 2 finalise them.

## Bug class ledger (rule P1)

A class seen twice gets redesigned, not patched.

| Class | Seen | Status |
|---|---|---|
| (from old game) GPU state leaking between passes | many | Designed out: rule A5; `gpu.draw` throws on an undeclared sampler or uniform, and unbinds after each pass |
| (from old game) Light cap causes flicker from ranking ties | twice | Designed out: light budget + stable ranking; verify in Stage 1 |
| (from old game) Height-buffer phantom shadows | many | Watch in Stage 1 |

## Known risks

1. **Art.** Tilt needs wall-face art. Goal-quality art is not yet available, so Stage 1 can only partly match `goal.png`.
2. **Parity scope.** The old game has about 400 builds of tuning. `MIGRATION.md` must be walked, not assumed.
3. **Old code not fully read.** Not read in depth: most of `3_sim`, `4_ai`, `5c_net`, `5d_dev`, `6_menus`, `2b_ground`, the editors, the Python tools. Read each one fully when its stage begins, and update `MIGRATION.md`.
4. **Phone numbers are so far from nearly empty scenes.** The real test of the budget starts with lighting.
