Installation and deployment guide — System Monitor

This document explains how to install and run the System Monitor web UI on an Ubuntu server.

Quick automated install (recommended for testing):

1. Transfer this repository to the target server, or run the installer on the server.

2. Run (as root or via sudo):

   sudo bash scripts/install_ubuntu.sh --dir /opt/system-monitor --port 5000

   Optional: add --repo <git-url> to clone the project directly.

What the installer does:
- Installs system packages: python3, python3-venv, pip, git, ufw
- Creates a system user `monitor` to run the service
- Creates a Python venv at /opt/system-monitor/venv and installs dependencies from requirements.txt
- Creates a systemd unit file at /etc/systemd/system/system-monitor.service and enables the service
- Starts the service and opens the port with UFW

Security & permissions for service control
-----------------------------------------
If you want the web UI to control system services (start/stop/restart), the process running the web app needs permission to call systemctl. Options:

1) Grant `monitor` user explicit sudo permissions for systemctl commands (recommended, narrow scope):

   sudo visudo

Add a line like:

   monitor ALL=(ALL) NOPASSWD: /bin/systemctl start *, /bin/systemctl stop *, /bin/systemctl restart *

2) Run the service as root (NOT RECOMMENDED):

   Change `User`/`Group` in the systemd unit to `root` and restart the service.

3) Use a helper setuid binary or small privileged helper (advanced):

Reverse proxy and TLS
---------------------
For production, run behind nginx and enable TLS (Let's Encrypt). Example nginx proxy block:

server {
    listen 80;
    server_name monitor.example.com;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

Then run certbot to obtain and renew certificates.

Manual steps (if you prefer):
- Ensure python3 and venv installed:
    sudo apt update; sudo apt install -y python3 python3-venv python3-pip
- Copy repository to /opt/system-monitor and chown to monitor user
- Create venv and install deps:
    python3 -m venv /opt/system-monitor/venv
    /opt/system-monitor/venv/bin/pip install -r /opt/system-monitor/requirements.txt
- Install and enable the systemd unit (copy scripts/system-monitor.service -> /etc/systemd/system/)
    sudo cp scripts/system-monitor.service /etc/systemd/system/system-monitor.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now system-monitor.service

Verification
------------
- Check service status:
    sudo systemctl status system-monitor.service
- Check application log (journal):
    sudo journalctl -u system-monitor.service -f
- Test API endpoints locally:
    curl http://127.0.0.1:5000/stats
    curl http://127.0.0.1:5000/services/page

Notes
-----
- If your `app.py` binds to 0.0.0.0 and port 5000, you can connect directly. Otherwise use nginx as a reverse proxy.
- If your app uses environment variables (FLASK_ENV, SECRET_KEY), set them in the systemd unit Environment= lines or source an env file.

Support
-------
If anything fails during installation, collect the output of `sudo journalctl -u system-monitor.service -n 200` and send it along with `ls -la /opt/system-monitor` and `cat /opt/system-monitor/requirements.txt` for debugging.
