// Charts configuration
let cpuChart, memoryChart, networkChart;
let loadLeftChart, loadRightChart, overviewChart;
let loadStatusChart, cpuStatusChart, ramStatusChart, diskStatusChart;
let range = 'today';
// Options for doughnut charts (status)
const doughnutOptions = {
    responsive: true,
    cutout: '80%',
    rotation: 0,
    circumference: 360,
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
    },
    maintainAspectRatio: false
};

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: 300
    },
    interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x'
    },
    plugins: {
        tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            position: 'nearest'
        }
    },
    elements: {
        point: {
            radius: 0,
            hoverRadius: 6,
            hitRadius: 12
        },
        line: {
            tension: 0.3
        }
    },
    scales: {
        y: {
            beginAtZero: true
        }
    }
};

// Label formatting helpers: choose compact label based on time span
function pad(n){ return n.toString().padStart(2,'0'); }
function formatDateLabel(date, mode){
    if(mode === 'time'){
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    if(mode === 'datetime'){
        return `${date.getMonth()+1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    // default date
    return `${date.getMonth()+1}-${pad(date.getDate())}`;
}

function formatLabels(rawLabels){
    if(!rawLabels || rawLabels.length === 0) return [];
    const dates = rawLabels.map(s => new Date(s));
    const span = dates[dates.length-1] - dates[0];
    const oneDay = 24 * 3600 * 1000;
    let mode = 'date';
    if(span <= oneDay) mode = 'time';
    else if(span <= 7 * oneDay) mode = 'date';
    else mode = 'date';
    return dates.map(d => formatDateLabel(d, mode));
}

// Initialize charts (empty)
function initializeCharts() {
    // Top load charts
    const loadLeftCtx = document.getElementById('loadLeftChart')?.getContext('2d');
    if (loadLeftCtx) {
        loadLeftChart = new Chart(loadLeftCtx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'System resource usage', data: [], borderColor: '#f39c12', tension: 0.3, fill: true, backgroundColor: 'rgba(243,156,18,0.08)' }] },
            options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    const loadRightCtx = document.getElementById('loadRightChart')?.getContext('2d');
    if (loadRightCtx) {
        loadRightChart = new Chart(loadRightCtx, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'Load 1m', data: [], borderColor: '#3498db', tension: 0.3 },
                { label: 'Load 5m', data: [], borderColor: '#2ecc71', tension: 0.3 },
                { label: 'Load 15m', data: [], borderColor: '#9b59b6', tension: 0.3 }
            ] },
            options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    const overviewCtx = document.getElementById('overviewChart')?.getContext('2d');
    if (overviewCtx) {
        overviewChart = new Chart(overviewCtx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: '', data: [], borderColor: '#95a5a6', tension: 0.3, fill: true, backgroundColor: 'rgba(149,165,166,0.08)' }] },
            options: { responsive: true, maintainAspectRatio: false, elements: { point: { radius: 0 } }, scales: { x: { display: false }, y: { display: false } } }
        });
    }
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'CPU %', data: [], borderColor: '#3498db', tension: 0.3, fill: true, backgroundColor: 'rgba(52,152,219,0.08)' }] },
        options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100 } } }
    });

    const memoryCtx = document.getElementById('memoryChart').getContext('2d');
    memoryChart = new Chart(memoryCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Memory %', data: [], borderColor: '#9b59b6', tension: 0.3, fill: true, backgroundColor: 'rgba(155,89,182,0.08)' }] },
        options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100 } } }
    });

    const networkCtx = document.getElementById('networkChart').getContext('2d');
    networkChart = new Chart(networkCtx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'Download (MB/s)', data: [], borderColor: '#2ecc71', tension: 0.3 },
            { label: 'Upload (MB/s)', data: [], borderColor: '#e74c3c', tension: 0.3 }
        ] },
        options: { ...chartOptions }
    });
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize status doughnut charts
function initializeStatusCharts() {
    const createDoughnut = (ctx, value, color, enableTooltip = false) => new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [value, 100 - value],
                backgroundColor: [color, '#edf1f5'],
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            ...doughnutOptions,
            plugins: {
                ...doughnutOptions.plugins,
                tooltip: {
                    enabled: enableTooltip
                }
            }
        }
    });

    // Load Status
    const loadCtx = document.getElementById('loadStatusChart')?.getContext('2d');
    if (loadCtx) {
        loadStatusChart = createDoughnut(loadCtx, 0, '#2ecc71');
    }

    // CPU Status
    const cpuCtx = document.getElementById('cpuStatusChart')?.getContext('2d');
    if (cpuCtx) {
        cpuStatusChart = createDoughnut(cpuCtx, 0, '#3498db');
    }

    // RAM Status
    const ramCtx = document.getElementById('ramStatusChart')?.getContext('2d');
    if (ramCtx) {
        ramStatusChart = createDoughnut(ramCtx, 0, '#9b59b6');
    }

    // Disk Status
    const diskCtx = document.getElementById('diskStatusChart')?.getContext('2d');
    if (diskCtx) {
        diskStatusChart = createDoughnut(diskCtx, 0, '#f39c12');
    }
}

function renderDisk(data) {
    const diskContainer = document.getElementById('disk-usage');
    diskContainer.innerHTML = '';
    for (const [mount, info] of Object.entries(data)) {
        const diskDiv = document.createElement('div');
        diskDiv.className = 'disk-item';
        diskDiv.innerHTML = `
            <div class="disk-header">
                <strong>${mount}</strong>
                <span>${info.fstype || ''}</span>
            </div>
            <div class="disk-progress">
                <div class="progress-bar" style="width: ${info.percent}%">
                    ${info.percent}%
                </div>
            </div>
            <div class="disk-details">
                <span>Total: ${formatBytes(info.total)}</span>
                <span>Used: ${formatBytes(info.used)}</span>
                <span>Free: ${formatBytes(info.free)}</span>
            </div>
        `;
        diskContainer.appendChild(diskDiv);
    }
}

// Fetch history and update charts
async function fetchHistory(params = {}) {
    let url = '/history';
    if (params.range) url += `?range=${encodeURIComponent(params.range)}`;
    if (params.start && params.end) url += `?start=${encodeURIComponent(params.start)}&end=${encodeURIComponent(params.end)}`;

    try {
        const resp = await fetch(url);
        const data = await resp.json();
        // labels: ISO timestamps
    const labels = formatLabels(data.labels);

        // CPU
        if (cpuChart) {
            cpuChart.data.labels = labels;
            cpuChart.data.datasets[0].data = data.cpu;
            cpuChart.update();
        }

        // Memory
        if (memoryChart) {
            memoryChart.data.labels = labels;
            memoryChart.data.datasets[0].data = data.memory;
            memoryChart.update();
        }

        // Network
        if (networkChart) {
            networkChart.data.labels = labels;
            networkChart.data.datasets[0].data = data.net_rx;
            networkChart.data.datasets[1].data = data.net_tx;
            networkChart.update();
        }

        // Top load charts use CPU & memory as approximations
        if (loadLeftChart) {
            loadLeftChart.data.labels = labels;
            loadLeftChart.data.datasets[0].data = data.cpu.map(x => x); // cpu avg
            loadLeftChart.update();
        }
        if (loadRightChart) {
            loadRightChart.data.labels = labels;
            // emulate 1/5/15 by smoothing CPU differently (simple approach)
            const cpu = data.cpu;
            const smooth5 = cpu.map((v,i,arr)=>{const start=Math.max(0,i-4); const s=arr.slice(start,i+1); return (s.reduce((a,b)=>a+b,0)/s.length).toFixed(2)});
            const smooth15 = cpu.map((v,i,arr)=>{const start=Math.max(0,i-14); const s=arr.slice(start,i+1); return (s.reduce((a,b)=>a+b,0)/s.length).toFixed(2)});
            loadRightChart.data.datasets[0].data = cpu;
            loadRightChart.data.datasets[1].data = smooth5;
            loadRightChart.data.datasets[2].data = smooth15;
            loadRightChart.update();
        }

        if (overviewChart) {
            overviewChart.data.labels = labels;
            overviewChart.data.datasets[0].data = data.cpu;
            overviewChart.update();
        }
    } catch (err) {
        console.error('fetchHistory error', err);
    }
}

// Fetch history for a specific target (card)
async function fetchHistoryFor(range, target, startIso = null, endIso = null) {
    // target: 'top'|'cpu'|'memory' or 'all'
    let url;
    if (startIso && endIso) {
        url = `/history?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
    } else {
        url = `/history?range=${encodeURIComponent(range)}`;
    }
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        const labels = formatLabels(data.labels);

        if (target === 'cpu' && cpuChart) {
            cpuChart.data.labels = labels; cpuChart.data.datasets[0].data = data.cpu; cpuChart.update();
        } else if (target === 'memory' && memoryChart) {
            memoryChart.data.labels = labels; memoryChart.data.datasets[0].data = data.memory; memoryChart.update();
        } else if (target === 'top') {
            if (loadLeftChart) { loadLeftChart.data.labels = labels; loadLeftChart.data.datasets[0].data = data.cpu; loadLeftChart.update(); }
            if (loadRightChart) {
                const cpu = data.cpu;
                const smooth5 = cpu.map((v,i,arr)=>{const start=Math.max(0,i-4); const s=arr.slice(start,i+1); return (s.reduce((a,b)=>a+b,0)/s.length).toFixed(2)});
                const smooth15 = cpu.map((v,i,arr)=>{const start=Math.max(0,i-14); const s=arr.slice(start,i+1); return (s.reduce((a,b)=>a+b,0)/s.length).toFixed(2)});
                loadRightChart.data.labels = labels; loadRightChart.data.datasets[0].data = cpu; loadRightChart.data.datasets[1].data = smooth5; loadRightChart.data.datasets[2].data = smooth15; loadRightChart.update();
            }
            if (overviewChart) { overviewChart.data.labels = labels; overviewChart.data.datasets[0].data = data.cpu; overviewChart.update(); }
        } else {
            // fallback update all
            fetchHistory({ range: range });
        }
    } catch (e) {
        console.error('fetchHistoryFor error', e);
    }
}

// Fetch latest stats for disk/services
async function fetchLatestStats() {
    try {
        const r = await fetch('/stats');
        const d = await r.json();

        // Update system health status chart
        if (loadStatusChart && d.cpu) {
            loadStatusChart.data.datasets[0].data = [d.cpu.avg || 0, 100 - (d.cpu.avg || 0)];
            loadStatusChart.update();
            document.querySelector('.status-card:nth-child(1) .status-value .value').textContent = Math.round(d.cpu.avg || 0);
            document.querySelector('.status-card:nth-child(1) .status-detail').textContent = 'Smooth operation';
        }
        if (cpuStatusChart && d.cpu) {
            cpuStatusChart.data.datasets[0].data = [d.cpu.avg || 0, 100 - (d.cpu.avg || 0)];
            cpuStatusChart.update();
            document.querySelector('.status-card:nth-child(2) .status-value .value').textContent = Math.round(d.cpu.avg || 0);
            document.querySelector('.status-card:nth-child(2) .status-detail').textContent = `${d.cpu.cores || 0} Core(s)`;
        }

        if (ramStatusChart && d.memory) {
            ramStatusChart.data.datasets[0].data = [d.memory.percent || 0, 100 - (d.memory.percent || 0)];
            ramStatusChart.update();
            document.querySelector('.status-card:nth-child(3) .status-value .value').textContent = Math.round(d.memory.percent || 0);
            const total = Math.round(d.memory.total / (1024 * 1024)); // convert to MB
            const used = Math.round((d.memory.total - d.memory.available) / (1024 * 1024));
            document.querySelector('.status-card:nth-child(3) .status-detail').textContent = `${used} / ${total}MB`;
        }

        if (diskStatusChart && d.disk) {
            // Use first disk or average of all disks
            let diskPercent = 0;
            let totalSpace = 0;
            let usedSpace = 0;
            const disks = Object.values(d.disk);
            if (disks.length > 0) {
                diskPercent = disks.reduce((acc, disk) => acc + disk.percent, 0) / disks.length;
                totalSpace = disks.reduce((acc, disk) => acc + disk.total, 0);
                usedSpace = disks.reduce((acc, disk) => acc + disk.used, 0);
            }
            diskStatusChart.data.datasets[0].data = [diskPercent, 100 - diskPercent];
            diskStatusChart.update();
            document.querySelector('.status-card:nth-child(4) .status-value .value').textContent = Math.round(diskPercent);
            const totalGB = (totalSpace / (1024 * 1024 * 1024)).toFixed(1);
            const usedGB = (usedSpace / (1024 * 1024 * 1024)).toFixed(1);
            document.querySelector('.status-card:nth-child(4) .status-detail').textContent = `${usedGB}G / ${totalGB}G`;
        }

        renderDisk(d.disk);
    } catch (e) {
        console.error('fetchLatestStats error', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all charts
    initializeCharts();
    initializeStatusCharts();

    // initialize flatpickr on per-card date inputs (if flatpickr is loaded)
    if (window.flatpickr) {
        try {
            document.querySelectorAll('.card-start').forEach(el => {
                flatpickr(el, {dateFormat: 'Y-m-d', allowInput: true});
            });
            document.querySelectorAll('.card-end').forEach(el => {
                flatpickr(el, {dateFormat: 'Y-m-d', allowInput: true});
            });
        } catch (e) {
            console.warn('flatpickr init failed', e);
        }
    }

    // wire per-card preset buttons
    document.querySelectorAll('.card-header .range-buttons .preset').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
            range = btn.dataset.range;
            // set active class for siblings
            const parent = btn.parentElement;
            parent.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');

            const card = btn.closest('.card');
            if (range === 'custom') {
                // show inline custom inputs for this card
                const customBlock = card.querySelector('.custom-range');
                if (customBlock) {
                    customBlock.style.display = 'inline-flex';
                    const startEl = customBlock.querySelector('.card-start');
                    if (startEl && startEl._flatpickr) {
                        setTimeout(()=> startEl._flatpickr.open(), 50);
                    } else if (startEl) startEl.focus();
                } else {
                    alert('Please use the per-card custom selector');
                }
                return;
            }
            await fetchHistory({ range: range});
        });
    });

    // per-card custom apply / cancel handlers
    document.querySelectorAll('.card .custom-range').forEach(block => {
        const applyBtn = block.querySelector('.apply-custom');
        const cancelBtn = block.querySelector('.cancel-custom');
        applyBtn && applyBtn.addEventListener('click', async (ev) => {
            range = 'custom';
            const card = block.closest('.card');
            const start = block.querySelector('.card-start').value;
            const end = block.querySelector('.card-end').value;
            if (!start || !end) { alert('Please select both start and end dates'); return; }
            const startIso = start + 'T00:00:00Z';
            const endIso = end + 'T23:59:59Z';
            // determine target
            await fetchHistory({ start: startIso, end: endIso });
            block.style.display = 'none';
        });
        cancelBtn && cancelBtn.addEventListener('click', (ev) => { block.style.display = 'none'; });
    });

    // initial load: Today by default
    fetchHistory({ range: range });

    // refresh periodically (refresh history for 'today')
    setInterval(() => {
    if (range === 'today') {
            fetchHistory({ range: range })
        }
    }, 60000);
    fetchLatestStats()
    // refresh services/disk in background more often
    setInterval(fetchLatestStats, 5000);
});