# Linux Spaces

macOS-style full screen Spaces for GNOME. When an app goes full screen it moves to a workspace of its own, right next to the one it came from. When it leaves full screen it goes back, and the extra workspace disappears.

A GNOME Shell extension for GNOME 45 to 49 on Wayland (Ubuntu 24.04, Zorin OS 18, Fedora 39 to 43, and other desktops on those GNOME versions).

## What it does

GNOME has workspaces and full screen, but they are not linked: full screen just covers the current workspace. On macOS, full screen apps get their own Space that you can swipe to, like Mission Control. Linux Spaces brings that behaviour to GNOME.

- **Full screen in a new workspace.** Going full screen creates a workspace right after the current one and moves the window there with the normal GNOME slide.
- **Back where it came from.** Leaving full screen moves the window back to its original workspace. GNOME's dynamic workspaces removes the empty one.
- **Works however full screen starts.** F11 in a browser or video player, or the `Ctrl+Super+F` shortcut.
- **Maximize gets its own workspace too.** The title bar maximize button (like the green macOS button) moves the window, maximized, to a new workspace. The app keeps its URL bar and title bar, and the top bar stays visible. Restoring the window sends it back.
- **Normal maximize stays available.** `Alt+F10` still maximizes in place, unless you turn on "Every maximize uses a new workspace".
- **Settings window.** Turn each behaviour on or off, switch off the slide animation, change the shortcut, set the top bar hover delay, and exclude apps (games, video players) that should keep normal GNOME full screen.
- **Monitor unplug safe.** Unplugging a monitor while a window is full screen does not break the link back to its workspace.
- **Top bar on hover.** In a full screen workspace, rest the pointer at the top edge and the top bar slides down, like the macOS menu bar.
- **Native navigation.** Full screen workspaces show in Activities and work with workspace shortcuts and three or four finger swipes.
- **Multi-monitor aware.** Follows GNOME's `workspaces-only-on-primary` setting.
- **Safe by design.** The extension never removes a workspace itself, which avoids the Mutter `assert_workspace_empty` crash that ends the session on Wayland.

## Status

Version 0.2, in testing. Publishing to extensions.gnome.org is planned. Open the settings with `gnome-extensions prefs linux-spaces@zarrx` or from the Extensions app.

## Install from source

Requirements: GNOME Shell 45 to 49, `make`, `glib-compile-schemas`, `gnome-extensions`.

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
| `make nested-45` ... `make nested-49` | Same, inside a Fedora container (podman) running that GNOME version |
| `make check-versions` | Headless start-up check on GNOME 45, 47, 48 and 49; logs go to `scratchpad/` |

Layout:

```
extension/
  extension.js         enable / disable
  prefs.js             settings window
  src/tracker.js       per-window state machine: enter, leave, close
  src/workspaces.js    create a workspace next to the origin
  src/filters.js       which windows are handled, monitor rules
  src/maximize.js      maximize button to a new workspace, Alt+F10
  src/compat.js        GNOME 45 to 49 differences (maximize API)
  src/keybinding.js    Ctrl+Super+F
  src/topbar-reveal.js top bar on hover
  schemas/             GSettings schema
scripts/nested.sh      isolated nested shell for testing
scripts/container/     Fedora containers for testing GNOME 45 to 49
```

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).

Designed & developed by Zarrx Technologies
