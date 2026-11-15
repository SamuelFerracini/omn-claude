# Exp bar: full-height pips, purple reached, gray not yet

- Branch: `bugfix/exp-bar-full-pips`
- Target: `main`
- Source: prompt

## Plan

## Problem

The exp meter in the plugin status (`plugin/claude/hooks/register.js`, `meterText` and `pipGlyphs`, around lines 620-780) renders 4 pips as a short staircase (`▂ ▄ ▆ █`). On screen it looks bad: at 20.2K exp the user sees one tiny purple pip and a few barely visible low gray ticks. The gray track color `#4a4566` is too dark to read on the dark background.

## Goal

Each of the 4 pips is a full block `█`, same height. A pip is purple (`cExp`, `#9d8cff`) once exp has reached that stage quarter; otherwise it is a clearly visible gray.

## Details

- Replace the staircase: every pip glyph is `█`. Remove `pipHeights`/`stairs`/`pipLevels` if no longer used.

- Keep the current fill rule: a pip lights once exp enters its quarter (`Math.ceil(v / 25)`, 0 at 0%, 4 at 100%).

- Unfilled pips: `█` repeated for the rest, in a lighter gray that reads clearly on a dark terminal (e.g. `#5c5870`–`#6b6880`; must be distinct from both background and `cDim` `#8a86a0` label). Rename stays `cTrack`.

- Keep the near-level-up pulse behavior (last lit pip in `cPulse`).

- Pips stay adjacent (no spaces between them), then the existing space/number layout.

- Update `register.test.js` test `exp pips fill bit by bit up the staircase` to the new glyphs (e.g. `pipGlyphs(10)` → `['█']`, `pipGlyphs(50)` → `['█','█']`, `pipGlyphs(100)` → 4 × `█`) and rename it to match.

## Done when

- [ ] `register.js` renders 4 full-height pips: purple for reached quarters, visible gray for the rest.

- [ ] Tests in `plugin/claude/hooks/register.test.js` pass (`node --test plugin/claude/hooks/`).

- [ ] Committed on the branch.
