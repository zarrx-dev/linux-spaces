#!/usr/bin/env bash
# Usage: nested-container.sh <45|47|48|49> [check]
# Runs a nested GNOME Shell of another version in a Fedora container (podman).
# Default shows a window on the host Wayland desktop; "check" runs headless and
# prints the extension state.
set -euo pipefail

VERSION="${1:?usage: nested-container.sh <45|47|48|49> [check]}"
MODE="${2:-window}"
[ "$MODE" = check ] || MODE=window

case "$VERSION" in
  45) FEDORA=39 ;;
  47) FEDORA=41 ;;
  48) FEDORA=42 ;;
  49) FEDORA=43 ;;
  *) echo "unsupported version $VERSION (45, 47, 48, 49)" >&2; exit 2 ;;
esac

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="linux-spaces-gnome:$VERSION"
STATE="$REPO/scratchpad/nested-$VERSION"
mkdir -p "$STATE"

if ! podman image exists "$IMAGE"; then
  podman build --build-arg FEDORA="$FEDORA" -t "$IMAGE" -f "$REPO/scripts/container/Containerfile" "$REPO/scripts/container"
fi

ARGS=(--rm --security-opt label=disable --userns=keep-id
  -e "MODE=$MODE" -e "VERSION=$VERSION"
  -v "$REPO:/src:ro" -v "$STATE:/state")

# The headless shell also needs a GPU render node; without one it segfaults after start.
ARGS+=(--device /dev/dri --group-add keep-groups)

if [ "$MODE" = window ]; then
  : "${WAYLAND_DISPLAY:?no host Wayland session}"
  ARGS+=(-e "HOST_WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
    -v "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY:/tmp/hostwl/$WAYLAND_DISPLAY")
fi

exec podman run "${ARGS[@]}" "$IMAGE" bash /src/scripts/container/inner.sh
