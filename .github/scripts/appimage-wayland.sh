#!/usr/bin/env bash
# Starts the AppImage the way a Wayland desktop would - under Weston, with
# Xwayland for X11 apps - and exits with the app's start-up check
# (RESUMA_SMOKE_TEST): 0 once the frontend has loaded, 1 if it hasn't
# within a minute, for example because WebKit's web process aborted. It
# also checks that Resuma added its app menu entry (see appimage.rs).
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

# APPIMAGE is what the AppImage runtime sets; Resuma adds its menu entry from it.
export APPIMAGE="$appimage"
export WAYLAND_DISPLAY=wayland-1 DISPLAY=:0 XDG_SESSION_TYPE=wayland RESUMA_SMOKE_TEST=1
status=0
timeout 120 dbus-run-session -- ./squashfs-root/AppRun 2>&1 | tee app.log || status=$?
kill "$weston_pid" 2>/dev/null || true
# Passing needs the app's own word that the frontend started, so a crash
# can't pass on an exit code alone.
if ! grep -q '\[smoke\] the frontend started' app.log; then
  [ "$status" -ne 0 ] || status=1
fi
# The menu entry that gives the window its icon on Wayland.
entry="${XDG_DATA_HOME:-$HOME/.local/share}/applications/Resuma.desktop"
if ! grep -qF "Exec=\"$appimage\"" "$entry" 2>/dev/null; then
  echo "Resuma didn't add its menu entry ($entry)."
  [ "$status" -ne 0 ] || status=1
fi
if [ "$status" -ne 0 ]; then
  echo "--- Weston ---"
  tail -n 20 weston.log
fi
exit "$status"
