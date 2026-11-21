# Local Linux sandbox for Orca bots and workspaces:
# Isolated X11 desktop (Xvnc + Openbox + AT-SPI for Orca computer use), Chromium,
# noVNC screen viewer, and a mounted Orca server (orcad) with pinned Node 24.
FROM debian:trixie-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates curl git openssh-client procps sudo locales jq \
    tigervnc-standalone-server openbox x11-utils x11-xserver-utils xdotool xclip \
    dbus dbus-x11 at-spi2-core libatk-adaptor libgail-common \
    python3 python3-gi gir1.2-atspi-2.0 gir1.2-gtk-3.0 gir1.2-gdkpixbuf-2.0 \
    chromium xfce4-terminal pcmanfm xdg-utils desktop-file-utils \
    novnc websockify \
    fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
    libgl1 libegl1 libgbm1 libnss3 libasound2t64 libxss1 libxtst6 \
  && sed -i 's/^# *\(en_US.UTF-8\)/\1/; s/^# *\(pt_BR.UTF-8\)/\1/' /etc/locale.gen && locale-gen \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -u 1000 -m -s /bin/bash user \
  && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user \
  && mkdir -p /tmp/.X11-unix /opt/orca /opt/host-agents/bin /opt/host-auth \
  && chmod 1777 /tmp/.X11-unix

# Chromium with accessibility enabled so Orca's Linux AT-SPI computer use can inspect pages.
# --no-sandbox: Docker restricts Chromium's user-namespace sandbox; the container is the sandbox.
RUN printf '%s\n' '#!/bin/sh' 'exec /usr/bin/chromium --no-sandbox --test-type --force-renderer-accessibility --no-first-run --no-default-browser-check --password-store=basic --disable-session-crashed-bubble --hide-crash-restore-bubble --disable-features=Translate "$@"' \
    > /usr/local/bin/browser && chmod 755 /usr/local/bin/browser \
  && sed -i 's#^Exec=/usr/bin/chromium#Exec=/usr/local/bin/browser#' /usr/share/applications/chromium.desktop

COPY start.sh /usr/local/bin/start-sandbox.sh
COPY openbox-autostart /etc/xdg/openbox/autostart
RUN chmod 755 /usr/local/bin/start-sandbox.sh /etc/xdg/openbox/autostart

ENV LANG=en_US.UTF-8 DISPLAY=:1 GTK_MODULES=gail:atk-bridge QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 \
    NO_AT_BRIDGE=0 ACCESSIBILITY_ENABLED=1 \
    PATH=/opt/orca/node/bin:/opt/host-agents/bin:/home/user/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER user
WORKDIR /home/user
EXPOSE 5901 6080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-sandbox.sh"]
