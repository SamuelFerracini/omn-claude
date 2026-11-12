# Show other plugins' AbovePrompt band beside the pet

- Branch: `feature/above-prompt-row-layout`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn Claude Code plugin (`plugin/claude/hooks/register.js`) draws a pet in the `AbovePrompt` band. Its `ui.render` hook on `{ component: 'AbovePrompt' }` (around lines 144-160) calls `await next(e)` to get other plugins' band output (`theirs`), then returns:

```js
const lines = [pet]
if (theirs) lines.push(theirs)
return Box({ flexDirection: 'column', children: lines })
```

The pet is only a 16-column `Raster` plus the exp meter, but the column layout pushes every other plugin's band onto a new row. The space right of the pet stays empty.

## Goal

When the band is wide enough, show other plugins' output to the right of the pet, in the same row. When it is narrow, keep the current stacked layout.

## Details

- Change only the return of that `AbovePrompt` hook. Suggested shape:
  ```js
  const lines = [pet]
  if (theirs) lines.push(Box({ flexGrow: 1, flexShrink: 1, children: [theirs] }))
  const cols = (e.props && e.props.bodyColumns) || 0
  const wide = cols >= 60
  return Box({ flexDirection: wide ? 'row' : 'column', columnGap: 2, children: lines })
  ```

- `e.props.bodyColumns` is the band's drawable width. It is narrower while a pane is docked. Put the threshold in a named const near the top of the file, next to the other consts.

- `theirs` absent: return the same tree as now (the pet alone is fine in either direction).

- Non-terminal surfaces (Svg branch) use the same rule.

- The Claude Code plugin API types: `Box` supports `flexGrow`, `flexShrink`, `flexWrap`, `width`, `minWidth`. See the `plugin-authoring` docs if needed. No other files, no version bump unless the repo's convention requires it (check git log for how earlier changes handled `VERSION` in `register.js` and `plugin.json`, and follow that).

- Validate with `claude plugin validate plugin/claude`.

## Done when

- [x] At `bodyColumns >= 60` with another plugin's band present, the returned tree is a row: pet first, then the other band in a grow/shrink Box.

- [x] Below 60, or with `bodyColumns` missing, the tree is a column as before.

- [x] With no other band, output is unchanged from today.

- [x] `claude plugin validate plugin/claude` passes. If the repo has a test setup (`claude plugin test`), add a test covering the three cases above.
