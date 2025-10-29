// Services page specific JavaScript
async function fetchServices() {
    try {
        const r = await fetch('/services');
        const data = await r.json();
        renderServices(data);
    } catch (e) {
        console.error('fetchServices error', e);
    }
}

function renderServices(data) {
    const servicesList = document.getElementById('services-list');
    servicesList.innerHTML = '';
    
    const services = Object.entries(data);
    if (services.length === 0) {
        servicesList.innerHTML = '<div class="no-services">No services found</div>';
        return;
    }

    // Sort services by name
    services.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [service, status] of services) {
        const div = document.createElement('div');
        div.className = 'service-item';
        const cls = status === 'active' ? 'status-active' : 'status-inactive';
        div.innerHTML = `
            <div class="service-info">
                <span class="service-name">${service}</span>
                <span class="service-status ${cls}">${status}</span>
            </div>
            <div class="service-actions">
                ${status === 'active' ? 
                    `<button class="action-btn stop-btn" onclick="controlService('${service}', 'stop')">
                        <i class="fas fa-stop"></i> Stop
                    </button>` :
                    `<button class="action-btn start-btn" onclick="controlService('${service}', 'start')">
                        <i class="fas fa-play"></i> Start
                    </button>`
                }
                <button class="action-btn restart-btn" onclick="controlService('${service}', 'restart')">
                    <i class="fas fa-sync"></i> Restart
                </button>
            </div>
        `;
        servicesList.appendChild(div);
    }
}

async function controlService(service, action) {
    try {
        const resp = await fetch('/service/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ service, action })
        });
        
        if (!resp.ok) {
            const error = await resp.text();
            alert(`Failed to ${action} ${service}: ${error}`);
            return;
        }

        // Refresh services list after action
        await fetchServices();
    } catch (e) {
        console.error(`Service control error: ${e}`);
        alert(`Failed to ${action} ${service}`);
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    fetchServices();
    // Refresh every 30 seconds
    setInterval(fetchServices, 30000);
});