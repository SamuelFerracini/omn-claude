# Handle no_pet 404 and 429 from omn server

- Branch: `feature/no-pet-hint-and-rate-limit`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn server is changing `POST /v1/claude` (XP per turn) and `POST /v1/claude/session` (open/ping/close). It will stop creating a pet for an unknown key. A key with no pet now gets:

- `404` with body `{"error":"no_pet","hint":"ssh omn.sh to hatch your pet"}`

Both endpoints also get rate limits (per IP and per key) and may return `429 Too Many Requests`.

The plugin is a Claude Code mod in `plugin/claude/hooks/register.js` (loaded via `plugin/claude/hooks/hooks.json`, uses the `$` host API: `$.http.fetch`, `$.ui.toast`, `$.ui.log`, `$.store`, `$.fs`). Today:

- `post()` (~line 1538) returns `null` on 401 and throws `omn <status>` on any other non-OK. Its caller (~line 221) catches and logs `omn xp skipped: ...` with `$.ui.log`.

- `postSession()` (~line 1377) silently returns on 401/404 and throws on other non-OK. It logs only for `op === 'open'`.

A new user who installs the plugin before `ssh omn.sh` sees nothing useful.

## Goal

A new user who starts with the plugin is told once to hatch their pet over SSH. Users with many Claude instances never see noise from 429s.

## Details

- On `404` from either endpoint, show the hint once: `No pet yet. Run \`ssh omn.sh\` to hatch it.` Use the mod's user-facing channel, `$.ui.toast` (this is a mod, not a stdout-JSON hook, so do not use `systemMessage`).

- Treat any 404 as "no pet": if the body parses with `error == "no_pet"`, fine; if the body is missing or not JSON, still show the same hint.

- Show it only once. Persist a "hint shown" flag across sessions and processes: use `$.store` (as `claudeSessions` does) or a marker file in `~/.config/omn` (the dir used at ~line 1528). Pick one and keep it simple.

- Clear the flag after the first 200 response from either endpoint, so the hint can come back later if the pet disappears.

- A 404 must not be logged as an error (`omn xp skipped` / `omn stay-awake skipped`) and must not throw.

- On `429` from either endpoint: drop the request silently. No retry, no loop, no toast, no log, no throw.

- Keep 401 handling, request signing (default SSH key via `resolveKey`/`signPayload`), and everything else unchanged.

- Prefer one small shared helper for status handling over duplicated branches in `post` and `postSession`.

- There is no test suite yet. Add a minimal one with `node --test` (no new dependencies), e.g. `plugin/claude/hooks/register.test.js`, driving `post`/`postSession` (or the extracted helper) with a fake `$`. Export what you need for testing without changing how the host loads the module. If the module can't be imported in Node as is, extract the status-handling logic into a small pure module that `register.js` uses, and test that.

- Do not touch the version in `plugin.json` or `VERSION` in `register.js`; the main checkout has an unrelated pending bump.

## Done when

- [ ] A fresh key (404) gets the hint once, not every turn or every session ping.

- [ ] After a 200, the flag clears; XP posts work as before.

- [ ] A 429 gives no user-visible output, no log, and no retry.

- [ ] Tests cover: 404 with the JSON body, 404 without a body, 429, and 200 (including flag clear). All pass with `node --test`.

- [ ] Commit on the branch with a Conventional Commits message.
