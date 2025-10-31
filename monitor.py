import psutil
import subprocess
import paramiko
import threading
import time
import collections
import copy
import sqlite3
import json
import os
from datetime import datetime, timedelta


class SystemMonitor:
    def __init__(self, sample_interval=60, max_days=7, storage_path='monitor.db', persist=True):
        """Create monitor, start background sampler.
        sample_interval: sampling interval in seconds (default 5s)
        max_days: how many days of history to keep (default 7 days)
        """
        self.ssh = None
        self.sample_interval = sample_interval
        self.persist = persist
        self.storage_path = storage_path
        self._db_lock = threading.Lock()
        self._db_conn = None
        # compute maxlen: samples per day = 86400 / sample_interval
        samples_per_day = int(86400 / max(1, self.sample_interval))
        self.history = collections.deque(maxlen=samples_per_day * max_days)
        self.max_days = max_days

        # initialize sqlite DB for persistence if requested
        if self.persist:
            try:
                # ensure directory exists
                db_dir = os.path.dirname(os.path.abspath(self.storage_path))
                if db_dir and not os.path.exists(db_dir):
                    os.makedirs(db_dir, exist_ok=True)
                # connect with check_same_thread False to allow access from sampler thread
                self._db_conn = sqlite3.connect(self.storage_path, check_same_thread=False, timeout=30)
                self._db_conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS snapshots (
                        id INTEGER PRIMARY KEY,
                        ts TEXT NOT NULL,
                        t REAL NOT NULL,
                        snapshot TEXT NOT NULL
                    )
                    """
                )
                self._db_conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_t ON snapshots(t)")
                self._db_conn.commit()
                # load recent history from DB
                self._load_history_from_db()
            except Exception as e:
                print('Failed to initialize DB persistence:', e)
                self.persist = False
        self._sampler_thread = threading.Thread(target=self._sampler_loop, daemon=True)
        self._sampler_thread.start()

    def connect_ssh(self, hostname, username, password):
        """Connect to remote Ubuntu server via SSH"""
        self.ssh = paramiko.SSHClient()
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            self.ssh.connect(hostname, username=username, password=password)
            return True
        except Exception as e:
            print(f"SSH connection failed: {str(e)}")
            return False

    def execute_command(self, command):
        """Execute command on remote server"""
        if not self.ssh:
            return None
        stdin, stdout, stderr = self.ssh.exec_command(command)
        return stdout.read().decode()

    def _take_snapshot(self):
        """Take a single timestamped snapshot and append to history."""
        try:
            now = datetime.utcnow()
            ts = now.isoformat() + 'Z'

            # CPU - non-blocking
            percpu = psutil.cpu_percent(interval=None, percpu=True)
            avg = sum(percpu) / len(percpu) if percpu else 0.0
            freq = psutil.cpu_freq()

            mem = psutil.virtual_memory()

            # disk partitions
            partitions = psutil.disk_partitions()
            disk_info = {}
            for partition in partitions:
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    if partition.fstype != 'squashfs':
                        disk_info[partition.mountpoint] = {
                            'device': partition.device,
                            'total': usage.total,
                            'used': usage.used,
                            'free': usage.free,
                            'percent': usage.percent,
                            'fstype': partition.fstype
                        }
                except Exception:
                    continue

            net = psutil.net_io_counters()

            snapshot = {
                'ts': ts,
                't': now.timestamp(),
                'cpu': {
                    'avg': avg,
                    'percpu': percpu,
                    'frequency': {
                        'current': freq.current if freq else None,
                        'min': freq.min if freq else None,
                        'max': freq.max if freq else None
                    },
                    'cores': psutil.cpu_count(logical=False),
                    'logical_cores': psutil.cpu_count(logical=True)
                },
                'memory': {
                    'total': mem.total,
                    'available': mem.available,
                    'used': mem.used,
                    'percent': mem.percent
                },
                'disk': disk_info,
                'net': {
                    'bytes_sent': net.bytes_sent,
                    'bytes_recv': net.bytes_recv
                }
            }

            # append a deep copy to avoid later mutation issues
            snap_copy = copy.deepcopy(snapshot)
            self.history.append(snap_copy)

            # persist to DB (best-effort)
            if self.persist and self._db_conn:
                try:
                    self._save_snapshot_to_db(snap_copy)
                except Exception as e:
                    # don't crash sampling on DB errors
                    print('DB save error:', e)

            return snapshot
        except Exception as e:
            print('Snapshot error:', e)
            return None

    def _sampler_loop(self):
        # take an initial quick snapshot to seed cpu counters
        try:
            psutil.cpu_percent(interval=None)
        except Exception:
            pass
        while True:
            snap = self._take_snapshot()
            # occasional cleanup of old DB rows (once every 60 samples)
            try:
                if self.persist and self._db_conn:
                    # perform cleanup roughly every 60 samples
                    if int(time.time()) % max(60, int(self.sample_interval)) == 0:
                        self._cleanup_old_snapshots()
            except Exception:
                pass

            time.sleep(self.sample_interval)

    def get_cpu_info(self):
        """Get CPU information"""
        # return latest snapshot cpu data if available
        # if self.history:
        #     return self.history[-1]['cpu']
        # fallback
        cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
        cpu_freq = psutil.cpu_freq()
        return {
            'percpu': cpu_percent,
            'avg': sum(cpu_percent) / len(cpu_percent) if cpu_percent else 0.0,
            'frequency': {
                'current': cpu_freq.current if cpu_freq else None,
                'min': cpu_freq.min if cpu_freq else None,
                'max': cpu_freq.max if cpu_freq else None
            },
            'cores': psutil.cpu_count(logical=False),
            'logical_cores': psutil.cpu_count(logical=True)
        }

    def get_memory_info(self):
        """Get memory information"""
        # if self.history:
        #     return self.history[-1]['memory']
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            'total': mem.total,
            'available': mem.available,
            'used': mem.used,
            'percent': mem.percent,
            'swap': {
                'total': swap.total,
                'used': swap.used,
                'free': swap.free,
                'percent': swap.percent
            }
        }

    def get_disk_info(self):
        """Get disk information"""
        if self.history:
            return self.history[-1]['disk']
        partitions = psutil.disk_partitions()
        disk_info = {}
        for partition in partitions:
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                if partition.fstype != 'squashfs':
                    disk_info[partition.mountpoint] = {
                        'device': partition.device,
                        'total': usage.total,
                        'used': usage.used,
                        'free': usage.free,
                        'percent': usage.percent,
                        'fstype': partition.fstype
                    }
            except:
                continue
        return disk_info

    def get_network_info(self):
        """Get network information"""
        # if self.history:
        #     return self.history[-1]['net']
        net_io = psutil.net_io_counters()
        net_connections = len(psutil.net_connections())
        return {
            'bytes_sent': round(net_io.bytes_sent / (1024*1024), 4),
            'bytes_recv': round(net_io.bytes_recv / (1024*1024), 4),
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv,
            'active_connections': net_connections
        }

    def get_service_status(self):
        """Get status of important services and include Python-run processes.

        Returns a mapping of service name -> status string (e.g. 'active', 'inactive', 'running').
        System services are queried via `systemctl is-active`. Additionally the function
        scans local processes for Python-based runners (gunicorn, uwsgi, uvicorn, python)
        and adds them to the returned mapping as `<script> (pid <n>)`: 'active'.

        Note: Python process detection is local only. If the monitor is connected to a
        remote host via SSH (`self.ssh`), systemctl checks will run remotely but Python
        process detection will still reflect the local host where this code runs.
        """
        important_services = [
            'nginx', 'apache2', 'mysql', 'postgresql',
            'mongodb', 'redis-server', 'ssh', 'ufw'
        ]

        services_status = {}

        # Check system services (remote via SSH if configured)
        for service in important_services:
            cmd = f"systemctl is-active {service}"
            try:
                if self.ssh:
                    out = self.execute_command(cmd)
                else:
                    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                    out = proc.stdout
                if out:
                    services_status[service] = out.strip()
            except Exception:
                services_status[service] = 'unknown'

        # Detect local Python processes and include them
        try:
            services_status_local = {}
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'username']):
                info = proc.info
                name = (info.get('name') or '').lower()
                cmdline = info.get('cmdline') or []

                is_python = False
                if any(k in name for k in ('python', 'gunicorn', 'uwsgi', 'uvicorn')):
                    is_python = True
                else:
                    for part in cmdline:
                        try:
                            if part and 'python' in str(part).lower():
                                is_python = True
                                break
                        except Exception:
                            continue

                if not is_python:
                    continue

                # derive a friendly name (script or entry)
                script = None
                for part in cmdline:
                    if part.endswith('.py') or part.endswith(':app'):
                        script = part
                        break
                if not script and len(cmdline) > 0:
                    # fallback to the process name
                    script = name or f'python-{info.get("pid")}'

                if script not in services_status_local:
                    services_status_local[script] = []
                
                services_status_local[script].append(info.get('pid'))
                # mark as active for compatibility with front-end
            
            for script, pids in services_status_local.items():
                key = f"{script} ({len(pids)} processing)"
                services_status[key] = 'active'
        except Exception:
            # swallow errors during process iteration
            pass
        sorted_by_status = dict(sorted(
            services_status.items(),
            key=lambda x: (x[1] == "active")
        ))
        return sorted_by_status

    def get_history(self, start_ts=None, end_ts=None):
        """Return snapshots between start_ts and end_ts.
        start_ts and end_ts can be datetime objects or timestamps (float) or None.
        """
        if not self.history:
            return []
        # normalize to floats (epoch)
        if start_ts is None:
            start = -float('inf')
        elif isinstance(start_ts, datetime):
            start = start_ts.timestamp()
        else:
            start = float(start_ts)

        if end_ts is None:
            end = float('inf')
        elif isinstance(end_ts, datetime):
            end = end_ts.timestamp()
        else:
            end = float(end_ts)

        result = [s for s in list(self.history) if start <= s['t'] <= end]
        return result

    # Persistence helpers
    def _save_snapshot_to_db(self, snapshot):
        """Insert snapshot into sqlite DB as JSON blob."""
        if not self._db_conn:
            return
        with self._db_lock:
            cur = self._db_conn.cursor()
            cur.execute(
                "INSERT INTO snapshots (ts, t, snapshot) VALUES (?, ?, ?)",
                (snapshot['ts'], float(snapshot['t']), json.dumps(snapshot))
            )
            self._db_conn.commit()

    def _load_history_from_db(self):
        """Load recent snapshots from DB into memory (respecting max_days)."""
        if not self._db_conn:
            return
        try:
            cutoff = datetime.utcnow() - timedelta(days=self.max_days)
            cutoff_ts = cutoff.timestamp()
            with self._db_lock:
                cur = self._db_conn.cursor()
                cur.execute(
                    "SELECT snapshot FROM snapshots WHERE t >= ? ORDER BY t ASC",
                    (cutoff_ts,)
                )
                rows = cur.fetchall()
            for (snap_json,) in rows:
                try:
                    snap = json.loads(snap_json)
                    self.history.append(snap)
                except Exception:
                    continue
        except Exception as e:
            print('DB load error:', e)

    def _cleanup_old_snapshots(self):
        """Delete snapshots older than retention period from DB."""
        if not self._db_conn:
            return
        try:
            cutoff = datetime.utcnow() - timedelta(days=self.max_days)
            cutoff_ts = cutoff.timestamp()
            with self._db_lock:
                cur = self._db_conn.cursor()
                cur.execute("DELETE FROM snapshots WHERE t < ?", (cutoff_ts,))
                self._db_conn.commit()
        except Exception as e:
            print('DB cleanup error:', e)

    def close(self):
        """Close DB connection if open."""
        try:
            if self._db_conn:
                with self._db_lock:
                    self._db_conn.close()
                self._db_conn = None
        except Exception:
            pass

    def get_time_series(self, start_ts=None, end_ts=None):
        """Build time-series arrays for charts between start and end (epoch or datetime).
        Returns: {labels: [...], cpu: [...], memory: [...], net_rx: [...], net_tx: [...]} where net values are MB/s.
        """
        snaps = self.get_history(start_ts, end_ts)
        if not snaps:
            return {'labels': [], 'cpu': [], 'memory': [], 'net_rx': [], 'net_tx': []}

        labels = [s['ts'] for s in snaps]
        cpu = [round(s['cpu']['avg'], 2) for s in snaps]
        memory = [round(s['memory']['percent'], 2) for s in snaps]

        # compute network rates by differences between consecutive snapshots
        net_rx = []
        net_tx = []
        for i in range(len(snaps)):
            if i == 0:
                net_rx.append(0)
                net_tx.append(0)
            else:
                prev = snaps[i-1]
                cur = snaps[i]
                dt = cur['t'] - prev['t'] if cur['t'] - prev['t'] > 0 else 1
                rx_rate = (cur['net']['bytes_recv'] - prev['net']['bytes_recv']) / dt
                tx_rate = (cur['net']['bytes_sent'] - prev['net']['bytes_sent']) / dt
                # convert to MB/s
                net_rx.append(round(rx_rate / (1024*1024), 4))
                net_tx.append(round(tx_rate / (1024*1024), 4))

        return {'labels': labels, 'cpu': cpu, 'memory': memory, 'net_rx': net_rx, 'net_tx': net_tx}