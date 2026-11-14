# Linux Spaces

macOS-style full screen Spaces for GNOME. When an app goes full screen it moves to a workspace of its own, right next to the one it came from. When it leaves full screen it goes back, and the extra workspace disappears.

A GNOME Shell extension for GNOME 46 on Wayland (Ubuntu 24.04, Zorin OS 18, and other GNOME 46 desktops).

## What it does

GNOME has workspaces and full screen, but they are not linked: full screen just covers the current workspace. On macOS, full screen apps get their own Space that you can swipe to, like Mission Control. Linux Spaces brings that behaviour to GNOME.

- **Full screen in a new workspace.** Going full screen creates a workspace right after the current one and moves the window there with the normal GNOME slide.
- **Back where it came from.** Leaving full screen moves the window back to its original workspace. GNOME's dynamic workspaces removes the empty one.
- **Works however full screen starts.** F11 in a browser or video player, the `Ctrl+Super+F` shortcut, or the title bar maximize button (like the green macOS button).
- **Normal maximize stays available.** `Alt+F10` still maximizes in place.
- **Top bar on hover.** In a full screen workspace, rest the pointer at the top edge and the top bar slides down, like the macOS menu bar.
- **Native navigation.** Full screen workspaces show in Activities and work with workspace shortcuts and three or four finger swipes.
- **Multi-monitor aware.** Follows GNOME's `workspaces-only-on-primary` setting.
- **Safe by design.** The extension never removes a workspace itself, which avoids the Mutter `assert_workspace_empty` crash that ends the session on Wayland.

## Status

Version 0.1, in testing. Settings window, exclude list and publishing to extensions.gnome.org are planned.

## Install from source

Requirements: GNOME Shell 46, `make`, `glib-compile-schemas`, `gnome-extensions`.

```bash
git clone https://github.com/zarrx-dev/linux-spaces.git
make -C linux-spaces install
```

On Wayland, log out and back in, then enable it:

```bash
gnome-extensions enable linux-spaces@zarrx
```

## Shortcuts

| Action | Default |
|---|---|
| Toggle full screen in a new workspace | `Ctrl+Super+F` |
| Normal maximize (unchanged) | `Alt+F10` |
| Switch workspace | GNOME defaults, or three or four finger swipe |

## Development

| Command | What it does |
|---|---|
| `make lint` | Biome lint and format check |
| `make pack` | Build `build/linux-spaces@zarrx.shell-extension.zip` |
| `make install` | Pack and install for the current user |
| `make nested` | Run an isolated nested GNOME Shell with the extension, so a crash cannot end your session |

Layout:

```
extension/
  extension.js         enable / disable
  src/tracker.js       per-window state machine: enter, leave, close
  src/workspaces.js    create a workspace next to the origin
  src/filters.js       which windows are handled, monitor rules
  src/maximize.js      maximize button to full screen, Alt+F10
  src/keybinding.js    Ctrl+Super+F
  src/topbar-reveal.js top bar on hover
  schemas/             GSettings schema
scripts/nested.sh      isolated nested shell for testing
```

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).

Designed & developed by Zarrx Technologies
