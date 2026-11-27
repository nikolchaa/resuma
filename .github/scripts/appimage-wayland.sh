#!/usr/bin/env bash
# Starts the AppImage the way a Wayland desktop would - under Weston, with
# Xwayland for X11 apps - and exits with the app's start-up check
# (RESUMA_SMOKE_TEST): 0 once the frontend has loaded, 1 if it hasn't
# within a minute, for example because WebKit's web process aborted.
# Run it as an ordinary user, not root.
# Usage: appimage-wayland.sh <AppImage>
set -euo pipefail
appimage="$(realpath "$1")"
work="$(mktemp -d)"
cd "$work"
"$appimage" --appimage-extract >/dev/null

export XDG_RUNTIME_DIR="$work/run"
mkdir -m 700 "$XDG_RUNTIME_DIR"
weston --backend=headless --socket=wayland-1 --xwayland --idle-time=0 >weston.log 2>&1 &
weston_pid=$!
for _ in $(seq 100); do
  [ -S "$XDG_RUNTIME_DIR/wayland-1" ] && break
  sleep 0.1
done
if [ ! -S "$XDG_RUNTIME_DIR/wayland-1" ]; then
  cat weston.log
  echo "Weston didn't start."
  exit 1
fi

export WAYLAND_DISPLAY=wayland-1 DISPLAY=:0 XDG_SESSION_TYPE=wayland RESUMA_SMOKE_TEST=1
status=0
timeout 120 dbus-run-session -- ./squashfs-root/AppRun || status=$?
kill "$weston_pid" 2>/dev/null || true
if [ "$status" -ne 0 ]; then
  echo "--- Weston ---"
  tail -n 20 weston.log
fi
exit "$status"
