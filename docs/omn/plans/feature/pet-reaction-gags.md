# Funny pet reactions in Claude Code plugin

- Branch: `feature/pet-reaction-gags`
- Target: `main`
- Source: prompt

## Plan

# Funny pet reactions in the Claude Code plugin

## Problem

The omn pet in Claude Code (`plugin/claude/hooks/register.js`) mostly sits idle. Today it reacts only to session start/end, turn steps (bites), turn complete, quiet periods (idle hop), and wake/revive/arrive/evolve/gleam. It does not react to what Claude or the user is doing, so it feels less alive than it could.

## Goal

Make the pet react to Claude Code events with short, funny pixel gags. The server is unchanged: it only serves the idle sprite frames (`/p/<id>.json`). The plugin draws every gag on top of those frames, the same way `hop`, `sparkle` and the bites work now. **No sound**: do not use `audio.*`.

## Details

Reuse the existing patterns in `register.js`: per-animation tick counters (like `sparkLeft`, `idleHop`, `gleamLeft`), the animating check near line 351, and the pixel buffer helpers (`hop`, `sparkle`, `sparkPx`). Event names and payloads come from `plugin/claude/.claude-plugin/types/claude-code/index.d.ts`. Check the exact payload shapes there before relying on them.

Known facts from the types:

- Events that exist: `turn.start`, `turn.step`, `turn.complete`, `turn.abort`, `tool.call`, `session.compact`, `session.model`.

- There is **no `tool.result` event**. Detect a tool failure from what `next(e)` returns inside the `tool.call` hook (await it; check the result shape in the types). Do not block or change the tool call itself.

- `VERSION` is a constant at the top of `register.js` (line 5), not a separate file. The plugin version lives in `plugin/claude/.claude-plugin/plugin.json` (currently 0.4.32). A test already checks the two match.

Gags, in priority order:

1. **Thinking bubble**: from `turn.start` until the first streamed step, a small "…" or "?" bubble blinks above the head.

2. **Per-tool props** (`tool.call`): show a small prop while the tool runs and for about 1s after.
   - Bash: hard hat.
   - Read, Grep or Glob: squint, or a magnifier pixel.
   - Edit or Write: pencil.
   - WebSearch or WebFetch: binoculars.
   - Agent/Task: a tiny clone pops out beside the pet, then poofs.

3. **Tool fail flinch**: a tool result with an error gives a sweat drop and a 1-frame flinch. After 3 fails in a row in one turn, the pet facepalms. A success resets the count.

4. **Abort dizzy** (`turn.abort`): the pet skids to a stop and stars orbit its head for about 2s.

5. **Big meal**: on a turn far above the usual XP, the belly bulges (1px wider), a "burp" label shows, then the bob is slower for a few seconds.

6. **Compact squish** (`session.compact`): the sprite squashes to about 60% height, holds, then springs back with a small overshoot.

7. **Model outfit** (`session.model` / the turn model): Opus gets a monocle, Sonnet a scarf, Haiku a speed streak behind it. The outfit is persistent and subtle.

8. **Git moments**: a Bash call whose command contains `git commit` gives a confetti burst. One with `git push --force` or `-f` gives a horrified face (wide eyes) for about 1.5s.

9. **Late night**: from 00:00 to 05:00 local time, the pet wears a nightcap.

Rules:

- Gags must not break anything the plugin does today. Wake, revive, arrive, evolve, gleam and bites win over any gag. Gags queue or drop; they never stack into a mess. At most one transient gag runs at a time, plus the persistent outfit/nightcap.

- Half-block rendering: vertical moves are 2 rows (one cell), like `hop`, so the feet never split. Check all three render modes: `image`, `blocks` and the halfblock raster.

- Another branch (`bugfix/pet-feet-split-on-hop`) is fixing feet splitting during hops right now. Before you finish, check `main` for that merge; if it landed, rebase onto it and keep your vertical moves consistent with its fix.

- Props are placed relative to the sprite mask (head top, side), not at fixed coordinates, so they work for every species and stage, the egg included. Skip props on eggs and on dead or sleeping pets.

- Keep the animation clock idle when nothing is playing, so the CPU stays quiet.

- Keep gags short (≤2s, except persistent overlays) and the colors in the existing palette.

- Add a `/omn` config toggle to turn gags off. It defaults to on.

- Bump the version in both `plugin.json` and the `VERSION` constant in `register.js`.

## Done when

- [x] Each gag above has a test in `plugin/claude/hooks/register.test.js` that drives the event and checks the counter and the pixels. Use the existing test hook for the animation counters.

- [x] Every test passes, old and new.

- [x] Each gag has been looked at in a real render with `plugin/claude/hooks/preview-exp-bar.js`, or a similar preview script, in all three render modes.

- [x] The README lists the gags and the off toggle.

- [x] Work committed on the branch.
