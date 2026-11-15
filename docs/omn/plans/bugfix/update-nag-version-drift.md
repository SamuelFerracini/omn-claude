# Fix stale update nag: sync VERSION with plugin.json

- Branch: `bugfix/update-nag-version-drift`
- Target: `main`
- Source: prompt

## Plan

## Problem

Users on plugin 0.4.30 see `update to 0.4.30` in the pet band forever. `plugin/claude/hooks/register.js:5` hardcodes `const VERSION = '0.4.29'`. The 0.4.30 bump changed only `plugin/claude/.claude-plugin/plugin.json`. `checkUpdate` compares the remote `plugin.json` version against `VERSION`, so the running code always thinks it is behind.

`VERSION` must stay a constant in the code. Reading `plugin.json` from disk at runtime is wrong, because the folder is replaced on update while the old code keeps running (see the comment above `checkUpdate`).

## Goal

Stop the false nag and stop this drift from happening again.

## Details

- Set `VERSION` in `plugin/claude/hooks/register.js` to `0.4.31`.

- Bump `plugin/claude/.claude-plugin/plugin.json` version to `0.4.31`. Check `.claude-plugin/marketplace.json` too: if it holds a version for this plugin, set it to `0.4.31` as well.

- Add a test in `plugin/claude/hooks/register.test.js` (follow the existing test style and runner there) that reads `plugin.json` and asserts it equals the `VERSION` constant in `register.js`. Read the constant from the source text with a regex if `VERSION` is not exported. Do not change the runtime behaviour to get it.

- Don't change `checkUpdate`, `versionNewer` or the band layout.

## Done when

- [x] `VERSION`, `plugin.json` (and `marketplace.json` if it has a version) all say `0.4.31`.

- [x] New test passes, and fails if you change one of the versions by hand.

- [x] All existing tests pass. `node --check plugin/claude/hooks/register.js` passes.

- [x] Changes committed on the branch.
