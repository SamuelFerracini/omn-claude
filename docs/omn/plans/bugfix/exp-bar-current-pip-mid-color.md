# Exp bar: one solid staircase, current pip in mid color

- Branch: `bugfix/exp-bar-current-pip-mid-color`
- Target: `main`
- Source: prompt

## Plan

# Exp bar: one solid staircase, current pip in mid color

## Problem

The exp meter in `plugin/claude/hooks/register.js` (`meterText`, about line 633, and `pipGlyphs`, about line 773) looks broken. Example: 47.6K exp at stage 2 (20K–120K, so 27.6%) renders as `exp ▂▁ ▆█ 47.6K`.

- **Gap:** the lit pips and the dim pips are separate `Text` nodes in a `Box` row with `columnGap: 1`. A space lands in the middle of the bar.

- **Staircase dips:** the current pip grows in eighths from `▁`, so it is shorter than the finished pip before it. The dim track starts at the next pip, so the current pip has no full-height track behind it.

This bar has been "fixed" 5 times already. The user wants to see every state before anything is finished.

## Goal

The bar is always the fixed staircase `▂▄▆█` (heights 2, 4, 6, 8 from `pipLevels`/`pipHeights`), with no gaps. Every pip shows its full stair height. Only the color changes:

- finished pip: `cExp` (#9d8cff)

- current pip (the quarter exp is in now, pct > 0 and < 100): a new mid color between `cExp` and `cTrack`. Pick one that is clearly brighter than the track and clearly dimmer than lit.

- not-reached pip: `cTrack`

- pulse (pct > 85 and < 100, `tick % 8 < 4`): the current pip uses `cPulse` instead of the mid color.

- 100% / stage 4: all four pips use `cExp`.

- 0%: all four pips use `cTrack`.

## Details

- Render the four pip glyphs as colored children inside ONE parent `Text`, so the row's `columnGap` applies only between `exp`, the bar and the number.

- Replace `pipGlyphs` with something that returns a state per pip (`'done' | 'current' | 'off'`), or similar. Keep it exported and pure, and update `plugin/claude/hooks/register.test.js` to match.

- Quarter boundaries: a pip is `done` when pct >= its quarter's end. It is `current` when pct is inside its quarter. Exactly 25% means pip 1 done, pip 2 current. Check that this holds without float error.

- Bump `plugin/claude/.claude-plugin/plugin.json` version (and `VERSION`, which a test checks matches plugin.json).

## REQUIRED: preview before finishing

Before you commit, write a script (for example `plugin/claude/hooks/preview-exp-bar.js`, or one in the scratchpad) that calls the real render/state code. It prints the bar with truecolor ANSI (`\x1b[38;2;R;G;Bm`) using the real hex colors, one labelled line per case:
0%, 0.5%, 10%, 24.9%, 25%, 25.1%, 27.6% (47.6K at stage 2), 49.9%, 50%, 74.9%, 75%, 86% pulse on, 86% pulse off, 99.9%, 100% / stage 4. Also show the stage boundary: the last exp value of stage 1 and the first exp value of stage 2.
Also print a plain-text legend per line (for example `D D C O`), so the result reads without color too.
Run it and save the raw output (with ANSI) and the legend version via `save_note`. Then STOP: tell the user to run the script in their terminal (give the exact command) and wait for their OK. Do not commit or call it done until they approve. If they ask for changes, update the code, re-run the preview, and ask again.

## Done when

- [x] The bar never has a gap and always shows the full `▂▄▆█` shape.

- [x] The colors match the Goal for every preview case.

- [x] Tests pass (`node --test plugin/claude/hooks/` or the repo's test command).

- [x] Preview output saved with save_note, and the user has approved it.

- [x] Plugin version bumped, and the work is committed on this branch.
