#!/usr/bin/env bash
# Runs inside the container. MODE is "window" or "check", VERSION is the GNOME number.
set -uo pipefail

UUID="linux-spaces@zarrx"
MODE="${MODE:-window}"
VERSION="${VERSION:?}"
NAME="linux-spaces-$VERSION"
STATE=/state

export XDG_DATA_HOME="$STATE/data"
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"
export HOME="$STATE/home"
export GSETTINGS_BACKEND=keyfile
export XDG_RUNTIME_DIR=/tmp/xdg
HOSTWL="${HOST_WAYLAND_DISPLAY:-}"

mkdir -p "$HOME" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
mkdir -p -m 700 "$XDG_RUNTIME_DIR"
rm -f "$STATE/shell.log" "$XDG_CONFIG_HOME/glib-2.0/settings/keyfile"

# The host socket is mounted outside the runtime dir (which must be writable for our own socket).
if [ "$MODE" = window ] && [ -n "$HOSTWL" ]; then
  ln -sf "/tmp/hostwl/$HOSTWL" "$XDG_RUNTIME_DIR/$HOSTWL"
  export WAYLAND_DISPLAY="$HOSTWL"
fi

# Work on a copy so compiling schemas never touches the read-only repo.
DEST="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
rm -rf "$DEST"
cp -r /src/extension "$DEST"
glib-compile-schemas --strict "$DEST/schemas"

# No systemd/system bus in the container: gnome-shell connects to the system bus at startup
# (logind, colord...) and dies without one. A second private daemon stands in for it.
DBUS_SYSTEM_BUS_ADDRESS="$(dbus-daemon --session --fork --print-address)"
export DBUS_SYSTEM_BUS_ADDRESS
# libgnome-desktop also segfaults when localed is absent, so fake it there.
python3 /src/scripts/container/fake-localed.py >> "$STATE/localed.log" 2>&1 &
sleep 1

VER_OUT="$(gnome-shell --version)"
echo "$VER_OUT" | tee "$STATE/shell.log"
HELP="$(gnome-shell --help 2>&1 || true)"
if [ "$MODE" = window ]; then
  if echo "$HELP" | grep -q -- '--nested'; then
    FLAGS="--nested"
  else
    FLAGS="--devkit"
  fi
else
  FLAGS="--headless --virtual-monitor 1280x720"
fi
echo "flags: $FLAGS" | tee -a "$STATE/shell.log"

run_session() {
  gsettings set org.gnome.shell enabled-extensions "['$UUID']"
  gsettings set org.gnome.shell disable-user-extensions false
  dbus-update-activation-environment WAYLAND_DISPLAY="$NAME" DISPLAY= GDK_BACKEND=wayland
  # shellcheck disable=SC2086
  MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 gnome-shell $FLAGS --wayland --no-x11 --wayland-display="$NAME" 2>&1 | tee -a "$STATE/shell.log"
}

check_session() {
  gsettings set org.gnome.shell enabled-extensions "['$UUID']"
  gsettings set org.gnome.shell disable-user-extensions false
  dbus-update-activation-environment WAYLAND_DISPLAY="$NAME" DISPLAY= GDK_BACKEND=wayland
  # shellcheck disable=SC2086
  MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 gnome-shell $FLAGS --wayland --no-x11 --wayland-display="$NAME" >>"$STATE/shell.log" 2>&1 &
  SHELL_PID=$!
  sleep 15
  echo "=== extension info ==="
  gdbus call --session --dest org.gnome.Shell.Extensions \
    --object-path /org/gnome/Shell/Extensions \
    --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" 2>&1 | tee "$STATE/info.txt"
  case "$(grep -o "'state': <[0-9.]*>" "$STATE/info.txt" | grep -o '[0-9]' | head -1)" in
    1) S=ACTIVE ;; 2) S=INACTIVE ;; 3) S=ERROR ;; 4) S=OUT_OF_DATE ;; 5) S=DOWNLOADING ;; 6) S=INITIALIZED ;; 7) S=DISABLING ;; 8) S=ENABLING ;; *) S=UNKNOWN/NOT_FOUND ;;
  esac
  echo "EXTENSION STATE: $S"
  echo "=== log grep ==="
  grep -nE 'JS ERROR|linux-spaces' "$STATE/shell.log" || echo "(no matches)"
  if kill -0 "$SHELL_PID" 2>/dev/null; then
    echo "shell still running"
    kill "$SHELL_PID" 2>/dev/null
  else
    echo "shell EXITED early; log tail:"
    tail -n 30 "$STATE/shell.log"
  fi
}

if [ "$MODE" = window ]; then
  export -f run_session; export FLAGS NAME STATE UUID
  exec dbus-run-session -- bash -c run_session
else
  export -f check_session; export FLAGS NAME STATE UUID
  exec dbus-run-session -- bash -c check_session
fi
