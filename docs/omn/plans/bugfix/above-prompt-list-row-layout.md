# Show other plugins' band rows beside the pet via AbovePromptList

- Branch: `bugfix/above-prompt-list-row-layout`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn Claude Code plugin (`plugin/claude/hooks/register.js`) draws a pet in the band above the prompt. Its `ui.render` hook on `{ component: 'AbovePrompt' }` (around lines 174-191) does `const theirs = await next(e)` and, when `e.props.bodyColumns >= wideBandColumns` (60), returns a row `[pet, Box({ flexGrow: 1, flexShrink: 1, children: [theirs] })]` so other plugins' bands sit to the right of the pet.

It never works. The engine calls `AbovePrompt` once **per plugin** (`e.plugin` names it), so `next(e)` only runs omn's own chain and `theirs` is always empty. Other plugins' rows (e.g. a status row `● off $0.00 0s … Review Audit Board Details`) are separate rows that the engine's `AbovePromptList` stacks under the pet. Result: a big empty area right of the pet, the other plugin's row below it.

From the Claude Code plugin API types (`AbovePrompt` / `AbovePromptList` in the API `.d.ts`):

- `AbovePrompt`: "Asked once for each plugin that hooks it, `e.plugin` naming the plugin: a hook draws that plugin's row, or passes. `AbovePromptList` stacks them."

- `AbovePromptList` props: `rows: readonly { plugin: string; tree: RenderElement }[]`, `bodyColumns`, `maxRows`, `hasSurvey`, `isCollapsed`, `isWorking`, `scroll`, `view`.

- "Filter what `next(e)` gets and wrap its answer, never rows copied by value." "A bad answer is passed over."

## Goal

At `bodyColumns >= wideBandColumns`, when omn's row and at least one other plugin's row are present, draw omn's row on the left and the other rows (stacked, as the engine stacks them) on the right in a grow/shrink Box. Otherwise, the band behaves as the engine's default.

## Details

- Add a hook on `ui.render` `{ component: 'AbovePromptList' }`. Split `e.props.rows` by `row.plugin` into omn's row(s) and the rest. Use the plugin's actual name as the engine reports it (check `plugin/claude/.claude-plugin/plugin.json` and what `e.plugin` is in the AbovePrompt hook; don't hardcode a guess).

- Preferred shape: `left = await next({ ...e, props: { ...e.props, rows: mine } })`, `right = await next({ ...e, props: { ...e.props, rows: others } })`, return `Box({ flexDirection: 'row', columnGap: 2, children: [left, Box({ flexGrow: 1, flexShrink: 1, children: [right] })] })`.

- Calling `next` twice is not documented as allowed. Verify it (load the `plugin-authoring` skill; grep its types file for `AbovePromptList` and read `reference.md` on ui.render). If it is not allowed, pick the documented route (e.g. `next` with only the other rows, wrapped beside omn's own drawing) and explain the choice in the commit.

- Narrow (`< wideBandColumns`), collapsed, survey, no omn row, or no other rows: `return next(e)` unchanged.

- Simplify the `AbovePrompt` hook: drop the `theirs` / `wide` logic; it returns the pet tree (still keep its early `return next(e)` when there is no portrait).

- Keep the Raster (terminal) / Svg (other surfaces) branch as is.

- Update tests in `plugin/claude/hooks/register.test.js` that covered the old `theirs` row behaviour; add tests for the new AbovePromptList hook: wide + other rows → row layout; narrow → passthrough; only omn's row → passthrough.

- Follow the repo's convention on version bumps (check git log for how `VERSION` in `register.js` and `plugin.json` were handled).

- Validate with `claude plugin validate plugin/claude` and run `claude plugin test plugin/claude` if the repo uses it.

## Done when

- [x] Wide band with another plugin's row: pet left, other rows to its right, in one row.

- [x] Narrow band or no other rows: same output as the engine's default stacking.

- [x] `AbovePrompt` hook no longer uses `next(e)` output as "other plugins".

- [x] `claude plugin validate plugin/claude` passes; tests pass.
