# Gleam sparkle after revive

- Branch: `feature/gleam-revive-sparkle`
- Target: `main`
- Source: prompt

## Plan

## Problem

In `plugin/claude/hooks/register.js`, gleam (shiny pet) is only a static `✦` next to the name (around line 527). The revive animation (`beginRevive`, `revivePhase`: still → glow → flash → rise) ends by swapping in the live portrait. A gleam pet gets no shine moment, so the revive does not chain into anything for shiny pets. After a revive, a shiny pet goes straight back to its normal portrait with no shine.

## Goal

Add a short gleam sparkle animation and play it right after a revive ends when `portrait.gleam === true`.

## Details

- Follow the existing animation pattern: a frame counter like `reviveLeft`/`evolveLeft`, a check in the "animating" condition (around line 319), and drawing in the portrait render path (see `reviveFx` around line 844).

- Reset the new counter wherever the other counters are reset (around lines 115 and 1484).

- Keep it short (about 10-16 frames). Use the same colors and Raster/Text primitives as the other effects. No new deps.

- Chain it: when `reviveLeft` hits 0 and the live portrait has `gleam === true`, start the gleam animation. If an evolve is queued after the revive (around line 386), keep the order revive → gleam → evolve.

- A wake or arrive should cancel the gleam animation the same way they cancel revive.

- Add or extend tests in `plugin/claude/hooks/register.test.js`, in its existing style.

## Done when

- [x] A revived gleam pet plays the sparkle once, then shows its normal portrait.

- [x] A pet without gleam behaves as it does today.

- [x] Tests pass.
