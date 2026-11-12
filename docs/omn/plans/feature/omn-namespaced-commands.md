# Split /omn name and letgo into /omn:name and /omn:letgo

- Branch: `feature/omn-namespaced-commands`
- Target: `main`
- Source: prompt

## Plan

## Problem

The Claude Code plugin in `plugin/claude/` registers a single slash command, `/omn`, in `plugin/claude/hooks/register.js`. That one command does everything through subcommands: `/omn <id>`, `/omn key <path>`, `/omn name <nick>`, `/omn letgo`, `/omn letgo confirm`. You can find the registration in the `session.start` hook (`$.command.register({ name: 'omn', ... })`, around line 84) and the dispatch in `on('command.run', { command: 'omn' }, ...)` (around line 117).

## Goal

Rename and letgo become their own commands:

- `/omn:name <nick>` renames the pet.

- `/omn:letgo` arms the let-go and shows the warning.

- `/omn:letgo confirm` confirms it within 60s.

`/omn` keeps show, `<id>` and `key <path>`.

## Details

- Register two more commands next to `omn`: `omn:name` and `omn:letgo`. Each gets its own description and `argumentHint` (`<nick>` and `[confirm]`). Add a `command.run` hook for each. They should call the existing `nameCommand`, `letgoArm` and `letgoConfirm` functions.

- Check that the plugin API accepts a `:` in a command name. See `CommandSpec` / `$.command.register` in `plugin/claude/.claude-plugin/types/claude-code/index.d.ts`, and check how plugin commands get namespaced. If the plugin name `omn` already namespaces them (for example, registering `name` shows up as `/omn:name`), register the bare names instead so the user still types `/omn:name` and `/omn:letgo`. Do not produce `/omn:omn:name`. Explain what you found in your summary.

- Remove the `name` and `letgo` branches from the `/omn` handler. Update `argumentHint`, the `usageText` and the inline usage string so they no longer list name/letgo under `/omn`.

- Keep the arming state correct. Any command other than `/omn:letgo` or `/omn:letgo confirm` must still reset `letgoArmedAt`, and that includes `/omn` and `/omn:name`. Update the strings that tell the user what to run: `run /omn letgo confirm within 60s` becomes `/omn:letgo confirm`, and `run /omn letgo first` becomes `/omn:letgo`.

- Update the Commands section in `README.md`.

- Bump the version in `plugin/claude/.claude-plugin/plugin.json`. It is 0.4.19 now, so make it 0.4.20.

## Done when

- [x] `/omn:name <nick>`, `/omn:letgo` and `/omn:letgo confirm` work, and the 60s confirm window behaves as before.

- [x] `/omn`, `/omn <id>` and `/omn key <path>` still work.

- [x] README, usage strings and version are updated. Nothing else changes.
