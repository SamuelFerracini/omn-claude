# Animate new egg arriving and hatching on letgo

- Branch: `feature/letgo-hatch-animation`
- Target: `main`
- Source: prompt

## Plan

# Animate new egg arriving and hatching on letgo

## Problem

In the omn Claude Code plugin (`plugin/claude/hooks/register.js`), `/omn-letgo confirm` runs `letgoConfirm` (~line 1312). It posts `op:"letgo"`, calls `resetPortraitState()`, then `refresh($)`. The old pet vanishes and the new egg pops in with no animation. The letgo should feel like an event.

## Goal

After a successful letgo, the portrait plays a short scene: the old pet leaves, the new egg arrives, then the egg hatches.

## Details

- Follow the existing revive animation pattern: `beginRevive` (~line 331), `tickRevive` (~line 363), `revivePhase`, the phase constants (`reviveStill`, `reviveGlow`...), `stepFrame` (~line 279) at 100ms per tick, and `busy()` (~line 312). Add the same shape for a new `arrive` sequence (e.g. `arriveFrom`, `arriveTo`, `arriveLeft`, `arrivePhase()`).

- Phases, roughly 4s in total:
  1. **leave** (~10 ticks): the old portrait floats up and fades or dims out.
  2. **drop** (~10 ticks): the new egg (stage-0 frames) drops in from above with a small bounce.
  3. **wobble** (~16 ticks): the egg wobbles side to side and the wobble speeds up. Cracks may be drawn as an overlay if feasible in both the Raster and Svg render paths.
  4. **hatch** (~4 ticks): a flash, then the normal stage-0 portrait. Show the note `hatched! meet <name>` through the existing `note`/`noteLeft` mechanism. Use `$.ui.toast` as revive does.

- The server keeps the newborn at stage 0 (egg) until growth 500. The animation ends on the stage-0 frames, not stage 1.

- In `letgoConfirm`: snapshot the old `portrait` before `resetPortraitState()`, then fetch the new pet's frames (`refresh`). Start the sequence only after the new frames load. If the fetch fails, skip the animation and keep today's behaviour.

- The sequence cancels any wake, evolve or revive in progress, the same way `beginRevive` does. `busy()` must return true while it runs. `resetPortraitState()` must clear its state.

- Name: the letgo 200 response is `{"id","name","growth"}`. A separate server change makes `name` a random nick. Use `done.pet.name` (through `cleanLabel`) in the note and in the confirm reply text, e.g. `omn let go. meet <name> (<id>)`. If `name` is empty, fall back to the id.

- Keep the code style of the file: small functions, a short comment on each new sequence the way the revive comment explains its own.

## Done when

- [ ] `/omn-letgo` then `/omn-letgo confirm` plays leave, drop, wobble and hatch, and ends on the egg portrait with the `hatched! meet <name>` note.

- [ ] A failed letgo or a failed frame fetch plays no animation and nothing breaks.

- [ ] A wake, evolve or revive starting during the sequence cannot corrupt it, and the sequence does not leave stale state.

- [ ] Existing tests (if any) pass. The plugin loads without errors.
