#!/usr/bin/env bash
# Run a nested GNOME Shell with its own bus, dconf and data dirs so a crash
# cannot end the real session and nothing touches the real user's settings.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$REPO/scratchpad/nested"
UUID="linux-spaces@zarrx"

export XDG_DATA_HOME="$STATE/data"
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"
export STATE

mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

glib-compile-schemas --strict "$REPO/extension/schemas"

DEST="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
rm -rf "$DEST"
cp -r "$REPO/extension" "$DEST"

# keyfile backend: settings land under XDG_CONFIG_HOME, never in the real dconf.
exec dbus-run-session -- bash -c '
set -euo pipefail
export GSETTINGS_BACKEND=keyfile
export XDG_CONFIG_HOME="'"$XDG_CONFIG_HOME"'"
gsettings set org.gnome.shell enabled-extensions "['"'"'linux-spaces@zarrx'"'"', '"'"'zorin-tiling-shell@zorinos.com'"'"']"
gsettings set org.gnome.shell disable-user-extensions false
# D-Bus activated apps (Files and most GNOME apps) take their env from the bus, not the
# shell. Point them at the nested display, and run without Xwayland so no app can land on
# the real desktop.
dbus-update-activation-environment WAYLAND_DISPLAY=linux-spaces-0 DISPLAY= GDK_BACKEND=wayland
MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 gnome-shell --nested --wayland --no-x11 --wayland-display=linux-spaces-0 2>&1 | tee "$STATE/shell.log"
'
