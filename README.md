# claude-mods

My Claude Code mods, skill and agents, packaged so cloud sessions get them too.

| Item | Folder | Source |
| --- | --- | --- |
| savvy-progress mod | `mods/savvy-progress` | [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) 1.2.0, MIT, with a local change: the build-review agents get costumes and open the panel |
| context-colour mod | `mods/context-colour` | mine: context and 5-hour / weekly usage bars above the prompt |
| savvy-flow skill | `skills/savvy-flow` | johnnyvizz/claude-kit, MIT |
| savvy-* agents | `agents` | johnnyvizz/claude-kit, MIT |

## Cloud environment

In the cloud environment's settings dialog (environment selector, settings icon on the environment's row):

Environment variables:

```
CLAUDE_MODS_TOKEN=<fine-grained GitHub token: this repository only, Contents read-only>
CLAUDE_CODE_PLUGIN_DIRS=/root/claude-mods/mods/savvy-progress:/root/claude-mods/mods/context-colour
```

Setup script:

```bash
#!/bin/bash
curl -fsSL -H "Authorization: Bearer $CLAUDE_MODS_TOKEN" \
  https://raw.githubusercontent.com/patle1/claude-mods/main/install.sh | bash || true
```

`install.sh` downloads every file listed in `FILES` into `/root/claude-mods`, then copies the skill and agents into `~/.claude`.

## Changing the kit

After adding or removing a file, rewrite the list and commit it with the change:

```bash
git ls-files | grep -vx FILES > FILES
```
