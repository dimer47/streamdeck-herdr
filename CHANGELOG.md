# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-11

First release.

### Added

- **28 dedicated actions** covering the Herdr surface:
  - Agents (6): status, show blocked, unblock, confirm, resume, interrupt
  - Spaces (4): previous, next, new, close
  - Worktrees (2): create, remove
  - Tabs (4): previous, next, new, close
  - Panes (9): zoom, split right, split down, close, focus ×4, copy output
  - System (2): server status, open Herdr
  - Generic (1): custom command, configured from the property inspector
- **Live state on keys**, refreshed every 3 seconds — blocked/working/ready agent
  counts, focused workspace label, server reachability. Keys report `offline` when the
  Herdr server is down.
- **Ask before closing** checkbox on the four destructive actions. Panes, tabs and
  spaces close immediately by default; removing a worktree asks, since it can take
  uncommitted work with it.
- **Localization**: English by default, French through `fr.json`.

### Implementation notes

- No build step. `@action` decorators are parsed by neither Stream Deck's bundled
  Node 20 nor Node 22, so `manifestId` is set as a plain class property, which
  `registerAction()` accepts.
- Herdr IDs (`w1`, `w1:p1`) are assigned at creation time and are resolved at press
  time rather than hard-wired into keys.
- The plugin does not inherit the shell `PATH`; the `herdr` binary is resolved against
  `/opt/homebrew/bin` then `/usr/local/bin`.
- Every Herdr call goes through a helper that never throws — a failing command shows an
  alert on the key instead of killing the plugin.

### Requirements

- macOS 13 or later
- Stream Deck 6.9 or later
- Herdr 0.9.0 or later

### Known limitations

- **macOS only.** Folder pickers, text prompts and confirmations use `osascript`;
  the clipboard uses `pbcopy`.
- **Local server only.** Actions talk to the default session's socket; remote machines
  (`herdr --remote`) are not targeted.
- Key titles painted by the plugin (`setTitle`) are not localized — the Stream Deck SDK
  localizes `Name` and `Tooltip` only.

[1.0.0]: https://github.com/dimer47/streamdeck-herdr/releases/tag/v1.0.0
