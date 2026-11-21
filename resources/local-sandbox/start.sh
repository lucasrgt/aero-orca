#!/bin/bash
# Boots the isolated Linux desktop (Xvnc + Openbox + AT-SPI + noVNC) and Orca server (orcad).
set -u

GEOMETRY="${SANDBOX_GEOMETRY:-1600x900}"
ORCAD_PORT="${ORCAD_PORT:-19410}"
SANDBOX_NAME="${SANDBOX_NAME:-Local Sandbox}"
RUN=/tmp/sandbox
mkdir -p "$RUN" /home/user/workspace /home/user/.local/bin
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

# Ensure mounted host CLI packages (e.g. codex) are linked into /home/user/.local/bin.
if [ -x /opt/host-agents/codex/bin/codex.js ]; then
  ln -sf /opt/host-agents/codex/bin/codex.js /home/user/.local/bin/codex
fi
if [ -x /opt/host-agents/bin/claude ]; then
  ln -sf /opt/host-agents/bin/claude /home/user/.local/bin/claude
fi
if [ -x /opt/host-agents/bin/agy ]; then
  ln -sf /opt/host-agents/bin/agy /home/user/.local/bin/agy
fi

# Seed host agent credentials into the sandbox volume without sharing session history.
if [ -f /opt/host-auth/claude-credentials.json ] && [ ! -f /home/user/.claude/.credentials.json ]; then
  mkdir -p /home/user/.claude
  cp /opt/host-auth/claude-credentials.json /home/user/.claude/.credentials.json
  chmod 600 /home/user/.claude/.credentials.json
fi
if [ -f /opt/host-auth/claude-state.json ] && [ ! -f /home/user/.claude.json ]; then
  cp /opt/host-auth/claude-state.json /home/user/.claude.json
  chmod 600 /home/user/.claude.json
fi
if [ -f /opt/host-auth/codex-auth.json ] && [ ! -f /home/user/.codex/auth.json ]; then
  mkdir -p /home/user/.codex
  cp /opt/host-auth/codex-auth.json /home/user/.codex/auth.json
  chmod 600 /home/user/.codex/auth.json
fi
if [ -d /opt/host-auth/gemini ] && [ ! -d /home/user/.gemini ]; then
  mkdir -p /home/user/.gemini
  cp -a /opt/host-auth/gemini/. /home/user/.gemini/ 2>/dev/null || true
fi

Xvnc :1 -geometry "$GEOMETRY" -depth 24 -SecurityTypes None -localhost no \
  -rfbport 5901 -AlwaysShared -AcceptSetDesktopSize >"$RUN/xvnc.log" 2>&1 &
XVNC_PID=$!

for _ in $(seq 1 100); do
  xdpyinfo -display :1 >/dev/null 2>&1 && break
  sleep 0.1
done

eval "$(dbus-launch --sh-syntax)"
{
  echo "export DISPLAY=:1"
  echo "export DBUS_SESSION_BUS_ADDRESS='$DBUS_SESSION_BUS_ADDRESS'"
  echo "export GTK_MODULES=gail:atk-bridge"
  echo "export QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1"
  echo "export PATH=/opt/orca/node/bin:/opt/host-agents/bin:/home/user/.local/bin:\$PATH"
} >"$RUN/env"

if ! grep -q '# orca-sandbox-env' /home/user/.bashrc 2>/dev/null; then
  printf '\n# orca-sandbox-env\n[ -f /tmp/sandbox/env ] && . /tmp/sandbox/env\n' >> /home/user/.bashrc
fi

dbus-send --session --print-reply --dest=org.a11y.Bus /org/a11y/bus \
  org.freedesktop.DBus.Properties.Set string:org.a11y.Status string:IsEnabled variant:boolean:true >/dev/null 2>&1 || true
/usr/libexec/at-spi-bus-launcher --launch-immediately >"$RUN/atspi.log" 2>&1 &

openbox-session >"$RUN/openbox.log" 2>&1 &
websockify --web /usr/share/novnc 6080 localhost:5901 >"$RUN/novnc.log" 2>&1 &

ORCAD_NODE="/opt/orca/node/bin/node"
ORCAD_ENTRY="/opt/orca/orcad/orcad.js"

if [ -x "$ORCAD_NODE" ] && [ -f "$ORCAD_ENTRY" ]; then
  : > "$RUN/orcad-readiness.json"
  chmod 600 "$RUN/orcad-readiness.json"
  ORCA_USER_DATA=/home/user/.config/orca-sandbox \
  ORCA_MACHINE_NAME="$SANDBOX_NAME" \
  DISPLAY=:1 \
  DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  "$ORCAD_NODE" --max-semi-space-size=8 "$ORCAD_ENTRY" \
    --json \
    --bind 0.0.0.0 \
    --allow-public \
    --port "$ORCAD_PORT" \
    --pairing-address 127.0.0.1 \
    --grant-desktop-control \
    >"$RUN/orcad-readiness.json" 2>>"$RUN/orcad.log" &
  ORCAD_PID=$!
  wait "$ORCAD_PID"
else
  echo "orcad bundle missing at $ORCAD_ENTRY" >&2
  wait "$XVNC_PID"
fi
