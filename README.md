<p align="center">
  <img src="docs/icon.png" width="128" alt="Herdr for Stream Deck">
</p>

<h1 align="center">Herdr for Stream Deck</h1>

<p align="center">
  Control <a href="https://herdr.dev">Herdr</a> — the terminal workspace manager for AI
  coding agents — from your Elgato Stream Deck.
  <br>
  <em><a href="README.fr.md">🇫🇷 Version française</a></em>
</p>

---

## What it does

Run several coding agents in parallel, one per issue, and drive them with physical keys:
unblock an agent waiting for approval, jump to the next workspace, spin up a Git worktree,
split a pane — without leaving the keyboard or hunting for a terminal window.

Keys don't just fire commands, they **show live state**:

| Key | Displays |
|---|---|
| Agents — status | `2⎋ 1▶ 3✓` — blocked, working, ready |
| Agents — unblock | `⎋ 2 blocked` |
| Space — next / previous | the focused workspace label |
| Server — status | `Server active` / `Server stopped` |

Titles refresh every 3 seconds. When the Herdr server is down, keys say so.

## Requirements

- **macOS 13 or later** — this plugin is macOS-only (see [Limitations](#limitations))
- [Stream Deck](https://www.elgato.com/downloads) 6.5+
- [Herdr](https://herdr.dev) 0.9.0+, with `herdr` in `/opt/homebrew/bin` or `/usr/local/bin`

## Install

Download the latest `com.dimer47.herdr.streamDeckPlugin` from
[Releases](https://github.com/dimer47/streamdeck-herdr/releases) and double-click it.
Stream Deck installs it and a **Herdr** category appears in the actions list.

## The 28 actions

| Family | Actions |
|---|---|
| **Agents** (6) | status, show blocked, unblock, confirm, resume, interrupt |
| **Spaces** (4) | previous, next, new, close |
| **Worktrees** (2) | create, remove |
| **Tabs** (4) | previous, next, new, close |
| **Panes** (9) | zoom, split right, split down, close, focus ×4, copy output |
| **System** (2) | server status, open Herdr |
| **Generic** (1) | custom command |

### Custom command

For anything not covered by a dedicated action. Pick from a dropdown or type a raw Herdr
command in the property inspector — quotes are respected:

```
agent prompt my-agent "Continue."
```

### Closing keys ask first — or not

`Pane — close`, `Tab — close`, `Space — close` and `Worktree — remove` each carry a
**Ask before closing** checkbox.

Defaults are set by how much a mistake costs: panes, tabs and spaces close immediately;
**removing a worktree asks**, because it can take uncommitted work with it.

## How targets are resolved

Herdr IDs (`w1`, `w1:p1`) are assigned at creation time — a key hard-wired to one points at
nothing tomorrow. Every press resolves its target live:

- **Agents** — first agent in the relevant state (`blocked` to unblock, `idle` to resume),
  otherwise the agent in the focused space, otherwise the first one.
- **Spaces / tabs** — circular rotation over the sorted list, around the focused item.
- **Panes** — the focused pane, via the CLI's own defaults.

## Limitations

- **macOS only.** Folder pickers, text prompts and confirmations use `osascript`; the
  clipboard uses `pbcopy`. A Windows port would need those four helpers rewritten — the
  rest of the code is portable.
- **Local Herdr server only.** Actions talk to the default session's socket. Remote
  machines (`herdr --remote`) are not targeted.
- **Not notarized.** Installed through Stream Deck, which does not require it.

## Building from source

```bash
git clone https://github.com/dimer47/streamdeck-herdr.git
cd streamdeck-herdr/com.dimer47.herdr.sdPlugin
npm install                      # pulls @elgato/streamdeck into the bundle

npm install -g @elgato/cli
streamdeck dev                   # developer mode, required for unsigned plugins
streamdeck link  "$PWD"
streamdeck restart com.dimer47.herdr
tail -f logs/com.dimer47.herdr.0.log
```

Package a release:

```bash
streamdeck pack "$PWD" -o ../dist
```

> `node_modules/` is **not** versioned but **is** shipped inside the `.streamDeckPlugin`:
> Stream Deck never runs `npm install`. Source tree ≈ 370 KB, packaged plugin ≈ 5.9 MB.

## Implementation notes

Two things cost real time to discover — worth knowing before forking:

- **`@action` decorators don't work without a build step.** Neither Stream Deck's bundled
  Node 20 nor Node 22 parses them. This plugin sets `manifestId` as a plain class property
  instead, which `registerAction()` accepts. No TypeScript, no rollup, no build.
- **The plugin does not inherit your shell `PATH`.** The `herdr` binary is resolved
  explicitly against `/opt/homebrew/bin` then `/usr/local/bin`.

Every Herdr call goes through one helper that **never throws** — a failing command shows an
alert on the key rather than killing the plugin. State refresh runs one timer per action
type, stopped as soon as no key of that type is visible.

## Localization

English by default, French via `fr.json`. To add a language, copy `en.json` to
`<lang>.json` and translate `Name` and `Tooltip` for each action UUID.

## License

MIT — see [LICENSE](LICENSE).

Herdr is an independent project; this plugin is not affiliated with its authors,
nor with Elgato.

The plugin icon is an original drawing, not the Herdr logo.
