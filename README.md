# omn for Claude Code

Shows your [omn.sh](https://omn.sh) pet in Claude Code, and grants it growth and hunger from the tokens a turn bills.

```text
/plugin marketplace add SamuelFerracini/omn-claude
/plugin install omn@omn-sh
/reload-plugins
```

In `ssh omn.sh`, copy the 8-character id from the panel or `/copycard`. In Claude Code, run `/omn <id>`.

XP uses the same SSH key as `ssh omn.sh`. A key at `~/.ssh/id_ed25519` or `~/.ssh/id_rsa` with no passphrase is used as-is. Otherwise run `/omn key <path>` once.

## Commands

- `/omn <id>` sets the pet id. `/omn key <path>` sets the SSH key.
- `/omn name <nick>` renames your pet (`a-z A-Z 0-9 _ -`, 1 to 12 characters).
- `/omn letgo` warns first. Run `/omn letgo confirm` within 60s to send the pet to the graveyard and hatch a new egg. It cannot be undone.
