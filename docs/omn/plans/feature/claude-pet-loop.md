# Claude plugin: same pet loop as SSH (adopt, hatch, name, release)

- Branch: `feature/claude-pet-loop`
- Target: `main`
- Source: prompt

## Plan

# Claude plugin: same pet loop as SSH (adopt, hatch, name, release)

## Where to work

- Repo: `omn-claude`.

- Main file: `plugin/claude/hooks/register.js`.

- Tests: `plugin/claude/hooks/register.test.js`. Run them with `node --test plugin/claude/hooks/`.

- Leave untracked files alone.

- **Do not push.** A push to `main` publishes the plugin to every user.

## Problem

The omn.sh prod DB is about to be wiped. After the wipe, no user's SSH key has a pet.

- `postSession` (`register.js` ~1450) gets a 404. `handleStatus` (~1649) then only shows the hint "No pet yet. Run `ssh omn.sh` to hatch it."

- Old saved `petId`s are the first 8 chars of the SSH key's base64 fingerprint, so they leak the key.
  - `petIdOf` (~513) already drops ids that don't match `^[a-z2-7]{8}$`.
  - About 1 in 256 old ids still passes that check.

- `refresh` (~523) ignores a 404 on `/p/<id>.json` and keeps the stale id.

- The plugin can't adopt a pet. It shows no hatch animation for a first pet and no name prompt after a hatch or release.

The public id is the user's account: one random id per SSH key. The key keeps that id for every pet it ever has, and a release keeps it too.

## Already in the code (reuse it, don't rebuild it)

- `beginArrive` / `tickArrive` (~469 / ~488) play the release scene. The old pet floats up and fades, then an egg drops in, wobbles and cracks. A flash follows and a "hatched! meet <name>" note and toast show.

- `sessionPetId` + `rememberPet` (~1441 / ~516) take the pet id from a session reply.

- `releaseConfirm` (~1538) posts op `letgo` to `/v1/claude/pet`.

- `nameCommand` / `/omn-name` set the nick.

## Goal

The plugin runs the same loop as `ssh omn.sh`:

1. **First run, key has no pet.** `open` auto-adopts a pet. The plugin plays a hatch animation: the egg drops in and cracks, then "hatched! meet <name>". After that it shows the name prompt.

2. **Release.** The old pet says goodbye and leaves, a new pet drops in and hatches, then the name prompt shows again.

3. **Old key-derived ids.** Never trust or keep them. The id from the signed `open` reply always wins. If `/p/<id>.json` returns 404, clear the stored `petId`. Do not keep showing a stale pet.

## Server contract (the server ships at the same time)

- A signed `POST /v1/claude/session` with op `open` creates the pet when the key has none.
  - It returns `{"id":"...","hatched":true|false,"name":"...","species":"...","named":true|false}`.
  - `hatched` is true only on the `open` that created the pet.
  - `named` is false while the nick is still the random default.

- A `POST /v1/claude/pet` with op `letgo` returns the new pet with the **same** `id`, plus its new `name` and `species`. Because the id stays the same, `releaseConfirm`'s `id !== petId` check no longer signals a new pet. Make sure the new egg's frames still load and the scene still runs.

- Rate limit: 429, as today. Drop it silently.

- Old servers may still return 404 on `open`. Keep that path working, but make the hint fit the new flow.

## Details

- The first-hatch animation can't start from an "old" portrait the way `beginArrive` does. Add an egg-only variant that has no leave phase.

- The name prompt runs when `named === false`, after a hatch or release scene ends. Use a toast and a pane note, for example "name your pet: /omn-name <nick>". Show it once per pet. Do not show it on every session start. Also clear it once `/omn-name` succeeds.

- The paste this plan came from was partly garbled: the release "goodbye" wording and the exact name-prompt UX were unclear. Pick the simplest behavior that matches the description above, and list your choices in the final summary.

- Add tests for each of these:
  - `open` with `hatched:true` triggers the hatch.
  - `named:false` triggers the prompt.
  - A 404 on `/p/<id>.json` clears `petId`.
  - An id from the `open` reply replaces a stale stored id.
  - `letgo` with the same id still runs the arrive scene.

## Done when

- [x] All of the Goal's behavior works against the contract above.

- [x] `node --test plugin/claude/hooks/` passes.

- [x] The work is committed on this branch and not pushed.

- [x] The final message lists the UX choices you made where the spec was unclear.
