# Militia Mayhem rework: start here

This folder is a clean rebuild of the game. The old game (repo root, `src/`) keeps running until the rework replaces it.
These documents are how knowledge survives context loss. **Trust them over your memory of the conversation.**

## Every session, and after every context summary

Read in this order before doing anything:

1. `docs/STATE.md`: where we are, the next step, open questions, bug classes seen.
2. `docs/RULES.md`: the rules. They are not suggestions.
3. `docs/ARCHITECTURE.md`: read the sections for the modules you will touch.
4. `docs/SYSTEMS.md`: one owner per job. Check it before writing anything new.

Read when relevant:

- `docs/PLAN.md`: stages and exit criteria.
- `docs/DECISIONS.md`: what was decided, what was rejected, and the measured numbers. Check it before proposing an idea, because it may already have been tried.
- `docs/MIGRATION.md`: what to bring from the old game, what never to bring, and the feature parity list.
- `docs/VISION.md`: the look we want. Reference images are in `docs/reference/`.

## The five rules that matter most

1. **One job, one owner.** If `SYSTEMS.md` has an owner for the job, extend that owner. Never build a second one.
2. **Capability classes, not specific things.** A flashlight is a row of Light data, not code. Game code never names a specific thing outside `content/`.
3. **Modules meet only at written contracts.** Reworking lighting must not touch anything outside `render/lighting/`. If it would, the contract is wrong, so fix the contract.
4. **A bug class seen twice gets redesigned.** No third patch. Log it in `STATE.md`.
5. **Replacing something means deleting the old one in the same stage.** The old game became a mess because temporary paths stayed forever.

## Commands (run in `rework/`)

- `npm run check`: typecheck, format check, lint, tests, build, then the page in headless Chrome at phone size. Must pass before a push.
- `npm run format`, `npm run build`, `npm run smoke`. The smoke test saves a screenshot and prints where.
- `npm ci` once on a fresh clone. The old game's `build.py` and `tools/test.mjs` are not used here.

## Every round ends with

- `docs/STATE.md` updated: what changed, the exact next step, new open questions.
- `docs/DECISIONS.md` appended if anything was decided, rejected or measured.
- `docs/SYSTEMS.md` updated if an owner changed.
- `docs/MIGRATION.md` updated if something was carried over.

A round whose documents are not updated is not finished.
