# Fix pet sprite seams and colors in macOS Terminal.app

- Branch: `bugfix/mac-terminal-pet-render`
- Target: `main`
- Source: prompt

## Plan

## Problem

The pet sprite looks broken in macOS Terminal.app. `rasterOf` in `plugin/claude/hooks/register.js` (around line 785) packs a 16×18 pixel sprite into 16×9 cells. Each cell uses `0x2580` (`▀`), with fg = top pixel and bg = bottom pixel. Terminal.app draws `▀` from the font instead of drawing block glyphs itself. When line height is above the font's ascent + descent, the glyph doesn't fill the cell, and dark horizontal seams show between rows. Terminal.app before macOS Tahoe also has no truecolor, so it rounds 24-bit colours to the 256 palette badly and the sprite looks washed out.

Other terminals render fine: iTerm2, Ghostty, WezTerm, Kitty, GNOME Terminal/VTE, Konsole. Their output must not change.

## Goal

Make the pet render cleanly in Terminal.app, and keep every other terminal on the current half-block path, byte for byte.

## Details

1. **Detect Terminal.app.** Treat it as Terminal.app when `process.env.TERM_PROGRAM === 'Apple_Terminal'`. Also treat it as Terminal.app when `process.env.__CFBundleIdentifier === 'com.apple.Terminal'`. That second check covers tmux, which overwrites `TERM_PROGRAM` with `tmux`.

2. **Override setting.** Add an env var to force the mode, e.g. `OMN_PET_RENDER=blocks|halfblock` (pick a name that fits the plugin's existing env or config conventions, if it has any). It covers SSH from a Mac, where `TERM_PROGRAM` is not forwarded. It also lets users opt out.

3. **Background-only mode (Terminal.app).** Draw no glyph. Each pixel becomes 2 cells wide and 1 row tall: a space (`0x20`) with bg = the pixel colour. A cell's background fills the whole cell including line spacing, so seams can't appear. The sprite becomes 32 cols × 18 rows.
   - First check the host's raster format. Find what consumes the `[codepoint, fg, bg]` Uint32 triples and what dimensions it expects or limits. Confirm it accepts `0x20` with only bg set, and accepts a 32×18 grid.
   - Check the layout code that sizes the pet's rows and columns (AbovePromptList row layout, the band beside the pet), and update it so the bigger sprite doesn't overlap or clip.
   - If the host can't take a 32×18 grid, report that with `save_note`. Fall back to a 16×9 bg-only grid: 2 cells per pixel wide, downsampling each pair of rows by picking the more opaque, non-background pixel. Explain the trade-off.

4. **256-colour quantizing.** In the Terminal.app path, when `COLORTERM` is not `truecolor` or `24bit`, map each colour to the nearest xterm-256 entry yourself. Use the 6×6×6 cube plus the grayscale ramp, with a perceptual distance such as weighted RGB or a Lab approximation. Only do this if the host lets the plugin pass palette indices, or if pre-snapping RGB to the exact xterm-256 values gives Terminal.app a lossless match. Check which of these the host offers.

5. **Animation paths.** Make the hatch, gleam, release and bite animations that reuse `rasterOf` or the raw buffer go through the same mode switch.

6. **Tests.** Extend `plugin/claude/hooks/register.test.js`:
   - With no env set, and with `TERM_PROGRAM=iTerm.app` or unset, the output is identical to today's.
   - `Apple_Terminal` gives the bg-only grid.
   - The `__CFBundleIdentifier` fallback works.
   - The override env var wins.
   - Quantizing maps known colours to the expected xterm-256 values.

## Done when

- [x] Tests pass, including the new ones.

- [x] The non-Mac half-block output is unchanged, proven by a test.

- [ ] In Terminal.app the pet has no seams and its colours are clean. Describe how you checked, since a real Terminal.app check may need the user.

- [x] Host limits you found, and the env var name, are saved with `save_note`.
