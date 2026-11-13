# Rename /omn-letgo to /omn-release

- Branch: `chore/rename-letgo-to-release`
- Target: `main`
- Source: prompt

## Plan

## Problem

The omn Claude Code plugin calls its "release pet to graveyard, hatch new egg" command `/omn-letgo`. The user wants it called "release" everywhere in user-facing text and code.

## Goal

Rename the command and all letgo identifiers/strings to "release".

## Details

Files:

- `plugin/claude/hooks/register.js`
  - Command registration `name: 'omn-letgo'` (~line 105) becomes `omn-release`. Update its description to match.
  - `on('command.run', { command: 'omn-letgo' }, ...)` (~line 161) becomes `omn-release`. Usage string `usage: /omn-letgo [confirm]` becomes `usage: /omn-release [confirm]`.
  - Rename identifiers: `letgoArmedAt` to `releaseArmedAt`, `letgoWindow` to `releaseWindow`, `letgoArm` to `releaseArm`, `letgoConfirm` to `releaseConfirm`.
  - User strings: `let go <name>? ... run /omn-letgo confirm within 60s` becomes `release <name>? ... run /omn-release confirm within 60s`. `run /omn-letgo first` becomes `run /omn-release first`. `omn let go. meet <name> (<id>)` becomes `omn released. meet <name> (<id>)`.
  - Update comments mentioning letgo (~lines 453, 460, 1481) to say release.

- `README.md` line 17: document `/omn-release` and `/omn-release confirm`.

**Do not change the server wire op.** `postPet($, 'letgo', '')` sends `op:"letgo"` to the omn server. The server still expects `"letgo"`. Keep that string exactly. Add a short comment there noting the server op name is still `letgo`.

Leave `docs/omn/plans/feature/*letgo*.md` alone. They are historical plans.

Search after editing: `git grep -n -i -E "let ?go|letgo"`. Only the wire op and the old plan docs should remain.

## Done when

- [ ] `/omn-release` and `/omn-release confirm` work with the same 60s confirm window as before.

- [ ] `/omn-letgo` no longer registered.

- [ ] Server request still sends `op:"letgo"`.

- [ ] README updated.

- [ ] Changes committed on the branch.
