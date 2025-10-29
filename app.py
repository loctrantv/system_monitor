import os
from functools import wraps
from flask import Flask, jsonify, render_template, request, session, redirect, url_for
from monitor import SystemMonitor
import paramiko
from datetime import datetime, timedelta

app = Flask(__name__)
# Secret key for session - use env var if available, otherwise a default (should be changed in production)
app.secret_key = os.environ.get('DASH_SECRET_KEY', 'change-this-secret')

# simple credentials: override with environment variables DASH_USER / DASH_PASS
WEB_USER = os.environ.get('DASH_USER', 'admin')
WEB_PASS = os.environ.get('DASH_PASS', 'admin')

monitor = SystemMonitor()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated

@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username == WEB_USER and password == WEB_PASS:
            session['logged_in'] = True
            # redirect to next or index
            nxt = request.args.get('next') or url_for('index')
            return redirect(nxt)
        else:
            error = 'Invalid credentials'
    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/stats')
@login_required
def get_stats():
    return jsonify({
        'cpu': monitor.get_cpu_info(),
        'memory': monitor.get_memory_info(),
        'disk': monitor.get_disk_info(),
        'network': monitor.get_network_info(),
        'services': monitor.get_service_status()
    })


@app.route('/history')
@login_required
def get_history():
    """Return time series. Accepts either `range` param with values: today, yesterday, 7d
    or `start` and `end` ISO timestamps (UTC) e.g. 2025-10-29T00:00:00Z
    """
    rng = request.args.get('range')
    start = request.args.get('start')
    end = request.args.get('end')
    now = datetime.utcnow()

    def parse_iso(s):
        try:
            # accept trailing Z
            if s.endswith('Z'):
                s = s[:-1]
            return datetime.fromisoformat(s)
        except Exception:
            return None

    if rng:
        rng = rng.lower()
        if rng == 'today':
            start_dt = datetime(now.year, now.month, now.day)
            end_dt = now
        elif rng == 'yesterday':
            y = now - timedelta(days=1)
            start_dt = datetime(y.year, y.month, y.day)
            end_dt = start_dt + timedelta(days=1, seconds=-1)
        elif rng in ('7d', 'last7', 'last_7_days'):
            start_dt = now - timedelta(days=7)
            end_dt = now
        else:
            # unknown range -> default last 24h
            start_dt = now - timedelta(days=1)
            end_dt = now
    elif start and end:
        sdt = parse_iso(start)
        edt = parse_iso(end)
        if sdt and edt:
            start_dt = sdt
            end_dt = edt
        else:
            return jsonify({'error': 'invalid start/end format'}), 400
    else:
        # default last 24 hours
        start_dt = now - timedelta(days=1)
        end_dt = now

    series = monitor.get_time_series(start_dt, end_dt)
    return jsonify(series)

@app.route('/services')
@login_required
def get_services():
    return jsonify(monitor.get_service_status())

@app.route('/services/page')
@login_required
def services_page():
    return render_template('services.html')

@app.route('/service/control', methods=['POST'])
@login_required
def control_service():
    data = request.json
    service = data.get('service')
    action = data.get('action')
    
    if not service or not action or action not in ['start', 'stop', 'restart']:
        return 'Invalid request', 400
        
    try:
        if action == 'start':
            cmd = f"systemctl start {service}"
        elif action == 'stop':
            cmd = f"systemctl stop {service}"
        else:  # restart
            cmd = f"systemctl restart {service}"
            
        output = monitor.execute_command(cmd)
        return jsonify({'success': True, 'output': output})
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)