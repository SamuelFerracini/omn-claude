# Exp bar: gray staircase, current stage fills purple bit by bit

- Branch: `bugfix/exp-bar-staircase-progress`
- Target: `main`
- Source: prompt

## Plan

## Problem

The exp bar in `plugin/claude/hooks/register.js` (see `pipGlyphs` and the exp row render near `stageAt` / `pipLevels` / `pipHeights`) now draws 4 equal full-block pips (commit `d3cdd95`). The user does not want that. They want the old ascending staircase `▂▄▆█`.

Commit `c6bf844` had the staircase with gray for unfilled pips. But it lit the whole current pip purple as soon as exp entered it. That is misleading: it looks like the user already reached the next stage.

## Goal

The exp bar shows the staircase `▂▄▆█` with real progress inside the current stage:

- Pips for completed quarters: purple (`cExp`), at full staircase height.

- The current pip (the quarter exp is in now): purple, with its height growing in eighths from `▁` up to that pip's staircase height, in proportion to progress within that quarter.

- **Round the current pip's height DOWN** (floor), with a minimum of `▁` once exp is in that quarter. A pip reaches its full staircase height only when its quarter is fully done. Rounding up would make an unfinished pip look complete, which is the misleading signal we are removing.

- Pips not reached yet: gray, at full staircase height (`▂`, `▄`, `▆`, `█`).

- Keep the lighter gray track color from `d3cdd95`.

A terminal cell has only one fg and one bg color. So the current pip has no gray cap above its purple fill. That is accepted. Do not use background colors.

## Details

- Use `git show c6bf844` and `git show d3cdd95` to see the earlier versions. Start from the `c6bf844` staircase, change only the current-pip logic, and keep the `d3cdd95` gray.

- Keep the pulse behavior working on the purple pips.

- Update the `pipGlyphs` tests in `plugin/claude/hooks/register.test.js`. Expected values:
  - `pipGlyphs(0)` → `[]`
  - `pipGlyphs(1)` → `['▁']` (min `▁`)
  - `pipGlyphs(20)` → `['▁']` (80% of pip 1's 2 eighths = 1.6, floor 1)
  - `pipGlyphs(24.9)` → `['▁']`
  - `pipGlyphs(25)` → `['▂']`
  - `pipGlyphs(50)` → `['▂','▄']`
  - `pipGlyphs(62.5)` → `['▂','▄','▃']`
  - `pipGlyphs(100)` → `['▂','▄','▆','█']`
  - The gray rest is the staircase glyphs for the remaining pips.

- Bump the version in the plugin's `plugin.json` (every plugin change bumps it).

## Done when

- [ ] The exp bar renders as described above. Example: 40K exp (stage 20K–120K, 20%) renders `exp ▁▄▆█ 40K`, with `▁` purple and `▄▆█` gray.

- [ ] Tests pass (`node --test` on the plugin tests).

- [ ] The change is committed on this branch.
