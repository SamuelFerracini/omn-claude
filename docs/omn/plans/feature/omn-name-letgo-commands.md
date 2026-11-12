# Add /omn name and /omn letgo to the Claude plugin

- Branch: `feature/omn-name-letgo-commands`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn Claude Code plugin (`plugin/claude/hooks/register.js`) has one command: `/omn [pet id | key <path>]`. Users can rename their pet or let it go only inside `ssh omn.sh` (TUI `/name <nick>` and `/letgo`). They want to do the same from Claude Code.

## Goal

Add two subcommands to the existing `/omn` command:

- `/omn name <nick>` renames the pet.

- `/omn letgo` releases the pet to the graveyard and hatches a new egg. This is a two-step action.

## Server API contract

The omn.sh server is getting a new signed endpoint. It is built in a separate repo (`../omn.sh`). Code against this contract:

`POST https://omn.sh/v1/claude/pet`, JSON body:

```json
{"pubkey":"ssh-ed25519 AAAA...","ts":1731400000,"nonce":"...","op":"name","nick":"Bobo","sig":"-----BEGIN SSH SIGNATURE-----..."}
```

- `op` is `"name"` or `"letgo"`. For `letgo`, `nick` is `""`.

- The signed bytes are exactly this string, with no spaces:
  `{"pubkey":<json>,"ts":<int>,"nonce":<json>,"op":<json>,"nick":<json>}`
  This follows the same pattern as `sessionCanonical` in register.js, with `,"nick":` appended after `op`.

- Sign with the existing `signPayload($, nonce, bodyOf)`. It runs `ssh-keygen -Y sign -n omn`.

- Responses:
  - `200` returns `{"id":"<8-char>","name":"<nick>","growth":<n>}`. For letgo, it is the newborn pet.
  - `400` means a bad nick. Nick rules: `a-z A-Z 0-9 _ -`, 1 to 12 characters.
  - `401` means the signature or ts is bad, or the nonce was replayed.
  - `404` means no pet for this key.

## Details

- In the `command.run` handler for `omn`, add the `name` and `letgo` branches before the 8-char pet-id regex check. `letgo` is 5 characters, so it does not match that regex, but keep the order explicit anyway.

- `/omn name <nick>`:
  1. Check the nick on the client with `/^[A-Za-z0-9_-]{1,12}$/`.
  2. If it fails, return `usage: /omn name <nick> (a-z A-Z 0-9 _ -, max 12)`.
  3. Otherwise post `op:"name"`.
  4. On 200, refresh the portrait and return `omn named <nick>`.

- `/omn letgo`:
  - First call: store `letgoArmedAt = Date.now()` and return a warning: `let go <name>? it goes to the graveyard and a new egg hatches. cannot be undone. run /omn letgo confirm within 60s`.
  - `/omn letgo confirm`: if the command was armed less than 60s ago, post `op:"letgo"`. Otherwise return `run /omn letgo first`.
  - After a confirm, clear the armed state. Any other `/omn` command also clears it.
  - On 200: reset portrait animation state (evolve, revive, wake) and call `refresh($)` so the new egg draws. Return `omn let go. new egg <id>`.

- Map error statuses to short text: 400 `bad nick`, 401 `signature rejected`, 404 `no pet for this key`, other statuses `omn <status>`. Never throw out of the command handler.

- If `signPayload` returns null (no key), return `omn: /omn key <ssh private key>`.

- Update `argumentHint` to `[pet id | key <path> | name <nick> | letgo]`. Update the usage strings to match.

- Update README.md to document the two subcommands.

- Bump the version in both `plugin/claude/.claude-plugin/plugin.json` and the `VERSION` const in register.js. They must match: 0.4.16 becomes 0.4.17.

- Follow the existing code style: no semicolons, single quotes, small helper functions.

## Done when

- [ ] Both subcommands work as described against the contract above.

- [ ] Letgo cannot run without `confirm` within 60s of the first call.

- [ ] The canonical string is byte-exact with the contract. Check this with a quick node snippet that prints it for fixed inputs.

- [ ] `node --check plugin/claude/hooks/register.js` passes.

- [ ] Versions are bumped and the README is updated.
