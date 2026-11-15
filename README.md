# omn for Claude Code

Shows your [omn.sh](https://omn.sh) pet in Claude Code, and grants it growth and hunger from the tokens a turn bills.

```text
/plugin marketplace add SamuelFerracini/omn-claude
/plugin install omn@omn-sh
/reload-plugins
```

The pet is found automatically from the SSH key `ssh omn.sh` uses: the `IdentityFile` for omn.sh in `~/.ssh/config`, then `~/.ssh/id_ed25519`, `~/.ssh/id_ecdsa`, `~/.ssh/id_rsa`. XP is signed with the same key. A key with no passphrase is used as-is. With a passphrase, keep the `.pub` file next to it. To use another key, run `/omn key <path>` once.

No SSH key? Run `/omn-adopt`. It makes a key only for omn at `~/.config/omn/omn_ed25519` and hatches your pet. It never writes to `~/.ssh`. Later, `/omn ssh` prints the `ssh` command that reaches the same pet.

## Commands

- `/omn` shows your pet. `/omn key <path>` sets the SSH key.
- `/omn-adopt` hatches your pet now, or shows the pet your key already has. With no SSH key it first makes `~/.config/omn/omn_ed25519`. It takes no nick: the pet hatches with the default name.
- `/omn ssh` prints the command that reaches the same pet over SSH: `ssh omn.sh` when ssh already uses the key, else `ssh -i <key> -o IdentitiesOnly=yes omn.sh`, plus an optional `~/.ssh/config` snippet for you to add. The plugin never edits `~/.ssh/config`.
- `/omn-name <nick>` renames your pet (`a-z A-Z 0-9 _ -`, 1 to 12 characters).
- `/omn-release` warns first. Run `/omn-release confirm` within 60s to send the pet to the graveyard and hatch a new egg. It cannot be undone.
