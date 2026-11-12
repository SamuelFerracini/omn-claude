# Show manual update hint under update line

- Branch: `feature/update-hint-line`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn pet band in `plugin/claude/hooks/register.js` shows `update to <version>` (the `updateLine` variable, set in `checkUpdate`) when a newer plugin version is out. This marketplace does not auto-update, and users don't know how to update by hand.

## Goal

Show a short hint right below the update line that tells the user how to update manually.

## Details

- In the render function, find this line (around line 447):
  `if (updateLine) lines.push(Text({ color: cWarn, children: [updateLine] }))`

- Right after it, when `updateLine` is set, push one more line:
  `Text({ color: cDim, children: ['/plugin → omn → update now'] })`

- Show the hint only while `updateLine` is non-empty, so it disappears with the update line.

- Don't change `checkUpdate`, `versionNewer` or any other logic.

- Don't bump the plugin version.

## Done when

- [ ] When a newer version exists, the band shows `update to X.Y.Z` with `/plugin → omn → update now` dimmed below it.

- [ ] With no update, neither line shows.

- [ ] `node --check plugin/claude/hooks/register.js` passes.

- [ ] Changes are committed on the branch.
