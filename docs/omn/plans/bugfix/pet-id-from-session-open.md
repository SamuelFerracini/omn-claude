# Sync pet id from server on session open and key change

- Branch: `bugfix/pet-id-from-session-open`
- Target: `main`
- Source: prompt

## Plan

# Sync pet id from server on session open and key change

## Problem

The server keeps exactly one pet per SSH key: it finds the pet with `GetPet(proto.Fingerprint(pub))`, where `pub` comes from the signed request. That is the same pet you get from `ssh omn.sh`. The pet's public id is random base32 (`[a-z2-7]{8}`) and has no relation to the key.

The plugin in `plugin/claude/hooks/register.js` does not follow the key:

- On `session.start` it uses the `petId` saved in `$.store` (around line 73). It only learns the key's real id from the `/v1/claude` reply, after a turn that earns xp (around line 218). Until then it shows a stale pet, another key's pet, or nothing.

- `/omn key <path>` (around line 147) changes `keyPath` but keeps the old `petId`, so the old pet stays on screen.

## Goal

The plugin always shows the pet of the current SSH key, from the moment the session starts and right after `/omn key`.

## Details

- A separate server change adds `"id": <PublicID>` to the JSON reply of `POST /v1/claude/session` (fields `ok`, `status`, `id`). That change may not be deployed yet. The plugin must work with and without `id` in the reply: when it is missing, keep today's behaviour.

- In `postSession($, op)`: on a 200 reply, parse the JSON and run `petIdOf(body.id)`. If the result is valid and differs from `petId`, call `rememberPet($, id)`. That stores the id and refreshes the frames. Do this for every op except `close`, or at least for `open` and `ping`. A parse failure must not throw: keep the existing catch behaviour.

- `/omn key <path>`: after saving the key, clear `petId` (memory and `$.store` key `petId`), clear `portrait` so the old pet is not drawn, then run `postSession($, 'open')` so the new key's id is fetched. The reply text stays `omn key <path>`. If the new key has an id, you may append it.

- Leave `petIdOf` as it is (`/^[a-z2-7]{8}$/`).

- The saved `petId` is still read on start, but only as a fast first draw. The server reply always wins.

- Do not use IP or anything else to pick the pet. Only the signed key decides it.

- Add tests in `plugin/claude/hooks/register.test.js` for the session reply handling. Export a small pure helper if that makes testing easier, e.g. one that takes the reply text and the current id and returns the new id or ''.

- Bump the version to 0.4.25 in `plugin/claude/.claude-plugin/plugin.json` and in `VERSION` in `register.js`.

## Done when

- [ ] A session open with a different key's id in the reply switches the shown pet without waiting for an xp turn.

- [ ] `/omn key` stops showing the old pet and loads the new key's pet.

- [ ] A reply without `id` changes nothing.

- [ ] The tests pass (`node --test plugin/claude/hooks/`).

- [ ] The work is committed on the branch.
