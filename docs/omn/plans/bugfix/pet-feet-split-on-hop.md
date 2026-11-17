# Fix pet feet splitting from body during hops

- Branch: `bugfix/pet-feet-split-on-hop`
- Target: `main`
- Source: prompt

## Plan

## Problem

In Claude Code, the pet's feet come apart from its body during hops. The body rises 2 rows and the feet stay on the ground, so a gap opens between them. The server frames (`/p/<id>.json`) are fine. The split comes from the plugin's own motion code in `plugin/claude/hooks/register.js`.

Cause:

- `floorAt(raw)` (~line 1336) finds the ground line. It reads only column `x=0`. It starts at the bottom row and moves up while the colour matches the bottom-left ground colour.

- `bodyMask(raw, floor, bg)` (~line 1381) counts only rows `y < floor` as pet.

- `liftPet(buf, lift)` (~line 1442) moves only pixels in that mask. It is called by `hop()` (~line 1546: idle hop, stirring, revive), by the bite lift in `present()` (~line 1099), and by the `seamSplit` nudge (~line 1350).

- Some species draw their feet inside the ground band, at or below the line `floorAt` returns. Those pixels are not in the mask, so they don't move.

- A scene element at the left edge (for example a grey/teal patch in column 0) can also put the ground line in the wrong place, because only column 0 is checked.

## Goal

When the plugin lifts or nudges the pet, every pet pixel moves together, including feet drawn on the ground band. The ground and scene effects stay where they are.

## Details

- Make ground detection robust. Find the ground band from whole rows, not from column 0 only. A row is ground when most of its pixels are the ground colour.

- Make `bodyMask` include the pet pixels inside the ground band. Use non-ground, non-bg, non-`stayPut` pixels that connect (8-neighbour) to the body above the line. Ground texture and scene pixels must stay out of the mask.

- `liftPet` must clear moved pixels back to the right colour: the ground colour where the pixel was in the ground band, and bg above it. Today it always writes bg.

- Check every user of `floorAt`, `bodyMask` and `measure`: `seamSplit`, `petTop` (~line 1551), `shadeFoot` (~line 1472), `measure().foot` / `measure().ground`. Keep their behaviour correct with the new mask.

- Keep the 16×18 RGB frame format and the 16×9 image output unchanged.

- Bump the plugin version in both places: `plugin/claude/.claude-plugin/plugin.json` (`version`, now `0.4.32`) and `const VERSION` at `plugin/claude/hooks/register.js:5`. A test checks that they match.

- Tests run with `node --test` (`node:test`) in `plugin/claude/hooks/register.test.js`. Export any helper you need to test from `register.js`.

## Done when

- [ ] New tests in `plugin/claude/hooks/register.test.js`:
  - a frame whose feet sit on the ground band, after `hop()` / `liftPet(buf, 2)`, shows body and feet shifted together, with no pet pixel left behind on the ground, and the vacated ground cells restored to ground colour;
  - a frame with a non-ground patch in column 0 still finds the right ground line;
  - all existing tests still pass.

- [ ] Plugin version bumped (plugin.json and VERSION match).

- [ ] Note for the user: check by hand in Claude Code that there is no gap between body and feet while the pet hops.
