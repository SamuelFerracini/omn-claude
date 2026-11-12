# Show species, stage, status and gleam in the pet band

- Branch: `feature/pet-band-species-stage`
- Target: `main`
- Source: prompt

## Plan

## Problem

The pet band above the prompt (`plugin/claude/hooks/register.js`, `meterText` around line 409, `careLine` around line 478) shows the name, the exp meter, mood/streak, a meal note and `ssh omn.sh`. It does not show the pet's species, its stage, its status, or whether it is a gleam (shiny). The pet JSON (`GET https://omn.sh/p/<id>.json`, read in `refresh`) already sends some of this:

- `stage`: int 0–4

- `status`: string `awake` | `sleeping` | `dead`

- `gleam`: bool

- `name`: nick if set, otherwise the stage name

A server change in the separate omn.sh repo will add two string fields to the same JSON:

- `species`: species catalog name, e.g. `Cat`, `Slime` (`Shadow` at stage 0 / unknown)

- `stage_name`: stage name, e.g. `Sir Mochi` (`Shadow` at stage 0)

That server change may not be deployed yet. The client must work with and without these fields.

## Goal

Show species, stage, status and gleam in the band, compactly, in the existing style.

## Details

- New info line directly under the name line in `meterText`, dim colour (`cDim`), parts joined with ` · `:
  - species, from `cleanLabel(portrait.species, 24)`. Omit if empty, and omit if it is `Shadow`.
  - stage name, from `cleanLabel(portrait.stage_name, 24)`. Omit if empty or if it is the same as the name already shown on the name line.
  - `stage N`, where N is `stageOf(growth)` of the portrait being shown (the same growth `meterText` gets), so it agrees with the meter and the evolve animation.
  - Example: `Cat · Sir Mochi · stage 3`. With an old server: `stage 3`.

- Status: when `status` is `sleeping` or `dead`, add the word as a tag next to the name (`sleeping` in `cDim`, `dead` in `cWarn`). Show nothing for `awake` or missing.

- Gleam: when `gleam === true`, put a `✦` in `cFed` next to the name.

- If no name is shown, still show the tags on their own line. Use a row `Box` with `columnGap: 1`, the same way `careLine` does it.

- `applyCare` copies fields from turn responses into the portrait. Add `species` and `stage_name` to its key list so they stay current if a response ever includes them. Keep `status` and `gleam`, which are already there.

- Do not change anything else in the layout: no other lines, no width/wide-band logic.

- Bump the patch version in `plugin/claude/.claude-plugin/plugin.json` and the `VERSION` constant in `register.js` together (they must match).

## Done when

- [ ] The band shows species · stage name · `stage N` under the name when the JSON has the new fields, and only `stage N` when it does not.

- [ ] A sleeping or dead pet shows the status tag. A gleam pet shows `✦`.

- [ ] No errors when any of these fields is missing or has the wrong type.

- [ ] Both version strings are bumped and match.

- [ ] Committed on the branch.
