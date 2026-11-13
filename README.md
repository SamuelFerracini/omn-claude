# omn for Claude Code

Shows your [omn.sh](https://omn.sh) pet in Claude Code, and grants it growth and hunger from the tokens a turn bills.

```text
/plugin marketplace add SamuelFerracini/omn-claude
/plugin install omn@omn-sh
/reload-plugins
```

The pet is found automatically from the SSH key `ssh omn.sh` uses: the `IdentityFile` for omn.sh in `~/.ssh/config`, then `~/.ssh/id_ed25519`, `~/.ssh/id_ecdsa`, `~/.ssh/id_rsa`. XP is signed with the same key. A key with no passphrase is used as-is. With a passphrase, keep the `.pub` file next to it. To use another key, run `/omn key <path>` once.

## Commands

- `/omn` shows your pet. `/omn key <path>` sets the SSH key.
- `/omn-name <nick>` renames your pet (`a-z A-Z 0-9 _ -`, 1 to 12 characters).
- `/omn-release` warns first. Run `/omn-release confirm` within 60s to send the pet to the graveyard and hatch a new egg. It cannot be undone.
