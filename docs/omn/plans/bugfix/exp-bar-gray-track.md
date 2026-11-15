# Exp bar: gray staircase track, color fills it

- Branch: `bugfix/exp-bar-gray-track`
- Target: `main`
- Source: prompt

## Plan

## Problem

The exp meter in `plugin/claude/hooks/register.js` (`meterText`, `pipGlyphs`, around lines 620-650 and 770-785) changes glyph height as exp grows. Unfilled pips are drawn as low `▁` ticks. Result looks ragged: e.g. `exp ▁▂▄ ▁ 13.4K`. It does not read as a progress bar.

## Goal

Always draw the full staircase `▂▄▆█` (heights from `pipHeights`). Unfilled pips use a gray color. Filled pips use `cExp` (`#9d8cff`). Progress only changes the color, never the glyph shape.

## Details

- Add a gray color constant for the empty track, e.g. `cTrack = '#4a4566'` (same gray as the old unfilled tick). Tune it so it is visible but clearly dimmer than `cExp` on a dark terminal background.

- A pip counts as filled once exp enters its quarter: lit count = `ceil(pct / 25)`, clamped 0..4 (0 when pct <= 0). This matches the old `signalLevel` behavior.

- Rework `pipGlyphs` (or replace it) so it returns the lit count / glyphs at full staircase height. Remove the `▁` unfilled tick logic and its comment.

- Keep the pulse effect (pct > 85 && pct < 100) on the last lit pip.

- Keep the space before the number. Do not change anything else in the status line.

- Update the test `exp pips fill bit by bit up the staircase` in `plugin/claude/hooks/register.test.js` to the new behavior (e.g. 0 -> none lit, 10 -> 1 lit, 50 -> 2 lit, 71.9 -> 3 lit, 100 -> 4 lit).

## Done when

- [ ] Meter shows `▂▄▆█` always, with lit pips in `cExp` and the rest in gray.

- [ ] `node --test plugin/claude/hooks/register.test.js` passes.

- [ ] Committed on the branch.
