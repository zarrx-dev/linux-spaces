# Contributing to Linux Spaces

Thanks for taking the time to help. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an issue with the bug template. Include:

- your GNOME Shell version (`gnome-shell --version`) and distribution;
- Wayland or X11, and how many monitors;
- the app that was going full screen or maximized, and how (F11, the shortcut, the maximize button);
- what you did, what you expected and what happened;
- any errors from `journalctl -b -o cat /usr/bin/gnome-shell | grep -i -E "linux-spaces|JS ERROR"`.

If the session crashed or logged you out, say so: crashes in workspace handling are the most important bugs to fix.

## Suggesting a feature

Open an issue with the feature template and describe the problem before the solution. Larger changes are easier to agree on in an issue before any code is written.

## Development setup

You need GNOME Shell 45 or newer, `make`, `glib-compile-schemas`, `gnome-extensions` and Node.js (for `npx` and Biome).

```sh
make lint     # Biome lint and format check
make pack     # build the extension zip
make nested   # run an isolated nested GNOME Shell with the extension
make install  # install into your session (log out and back in on Wayland)
```

Always try changes in `make nested` first. It runs with its own D-Bus session and settings, so a crash cannot end your real session.

## Pull requests

- Keep each pull request to one change, and link the issue it addresses.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix(extension): return the window when the monitor is unplugged`.
- `make lint` must pass.
- Say which GNOME versions you tested on, and how (nested shell, container or real session).
- Follow the extensions.gnome.org review rules: create nothing in the constructor, undo everything in `disable()`, and avoid synchronous IO in the shell process.
- Never remove a workspace from the extension. Let GNOME's dynamic workspaces remove empty ones; removing them directly can crash Mutter on Wayland.
- Settings window changes should follow the GNOME Human Interface Guidelines; include before and after screenshots in the pull request.

## License

By contributing you agree that your contributions are licensed under the GPL-2.0-or-later, the same license as the project.
