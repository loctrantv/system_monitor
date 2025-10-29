#!/usr/bin/env bash
set -euo pipefail

# install_ubuntu.sh
# Usage:
#   sudo bash install_ubuntu.sh [--repo <git_url>] [--dir /opt/system-monitor] [--port 5000]
# If --repo is provided, the script will clone the repo into --dir; otherwise it assumes
# the current directory contains the project.

REPO=""
DEST_DIR="/opt/system-monitor"
PORT=5000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --dir) DEST_DIR="$2"; shift 2;;
    --port) PORT="$2"; shift 2;;
    -h|--help) echo "Usage: sudo bash install_ubuntu.sh [--repo <git_url>] [--dir /opt/system-monitor] [--port 5000]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Installing System Monitor to: ${DEST_DIR} (port ${PORT})"

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# Update & install system packages
apt-get update -y
apt-get install -y python3 python3-venv python3-pip git ufw

# Create system user
if ! id -u monitor >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/monitor -s /usr/sbin/nologin monitor
  echo "Created system user 'monitor'"
fi

# Prepare destination directory
if [ -n "$REPO" ]; then
  rm -rf "$DEST_DIR"
  git clone "$REPO" "$DEST_DIR"
  chown -R monitor:monitor "$DEST_DIR"
else
  # assume current dir contains project, copy it
  mkdir -p "$DEST_DIR"
  rsync -a --exclude ".git" "$(pwd)/" "$DEST_DIR/"
  chown -R monitor:monitor "$DEST_DIR"
fi

# Create virtualenv and install requirements
python3 -m venv "$DEST_DIR/venv"
# Ensure pip is upgraded
"$DEST_DIR/venv/bin/pip" install --upgrade pip

# Install required Python packages
REQ_FILE="$DEST_DIR/requirements.txt"
if [ -f "$REQ_FILE" ]; then
  "$DEST_DIR/venv/bin/pip" install -r "$REQ_FILE"
else
  # Fallback minimal deps
  "$DEST_DIR/venv/bin/pip" install flask psutil paramiko
fi

# Create systemd unit file
SERVICE_FILE="/etc/systemd/system/system-monitor.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=System Monitor Web UI
After=network.target

[Service]
Type=simple
User=monitor
Group=monitor
WorkingDirectory=${DEST_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${DEST_DIR}/venv/bin/python ${DEST_DIR}/app.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
systemctl daemon-reload
systemctl enable system-monitor.service
systemctl start system-monitor.service

# Configure UFW to allow access to port (optional)
ufw allow ${PORT}/tcp || true

# Print status
echo "Installation complete. Service status:"
systemctl --no-pager status system-monitor.service || true

echo "Next steps:"
echo " - If you need the app to manage system services (systemctl), either run the service as root (not recommended) or grant the 'monitor' user sudo access for specific commands. Example sudoers entry (visudo):"
echo "   monitor ALL=(ALL) NOPASSWD: /bin/systemctl start *, /bin/systemctl stop *, /bin/systemctl restart *"
echo " - Consider putting a reverse proxy (nginx) in front and enabling TLS for production."

echo "To view the UI, open http://<server-ip>:${PORT}/ (or configure nginx to proxy it to port ${PORT})"

exit 0
