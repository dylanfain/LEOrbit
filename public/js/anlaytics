// Chart Configuration
Chart.defaults.color = '#cfe4ff';
Chart.defaults.borderColor = 'rgba(100, 150, 255, 0.2)';

const colors = {
    bars: ['rgba(255, 105, 180, 0.8)', 'rgba(255, 159, 64, 0.8)', 'rgba(0, 255, 255, 0.8)'],
    borders: ['rgba(255, 105, 180, 1)', 'rgba(255, 159, 64, 1)', 'rgba(0, 255, 255, 1)'],
    line: 'rgba(30, 60, 120, 1)'
};

const algorithm_mapping = {
    'Shortest Path': 'shortest-path',
    'Minimum Latency': 'minimum-latency',
    'Load Balanced': 'load-balanced'
};

// State
let state = {
    currentRouteData: null,
    algorithmCache: {},
    chartInstance: null,
    currentChartType: 'bar'
};

// DOM Elements
const elements = {
    algoButtons: document.querySelectorAll('.toggle-button'),
    summaryCheckbox: document.getElementById('show-summary'),
    writtenDiv: document.getElementById('written-analytics'),
    extraMetricCheckboxes: document.querySelectorAll('input[name="extra-metrics"]'),
    metricRadios: document.querySelectorAll('input[name="metric"]'),
    routeDisplay: document.getElementById('active-route-display'),
    chartTypeButtons: document.querySelectorAll('.chart-type-btn'),
    chartTitle: document.getElementById('chart-title'),
    chartCanvas: document.getElementById('metricsChart')
};

// Significant figures helper
const formatNumber = (value, metric) => {
    if (value === 0) return '0.00';
    if (metric === 'Hops') return Math.round(value).toString();

    const absValue = Math.abs(value);
    if (absValue >= 100) return value.toFixed(1);
    if (absValue >= 10) return value.toFixed(2);
    return value.toFixed(3);
};

const algoNameToKey = (name) => algorithm_mapping[name] || name.toLowerCase().replace(/\s+/g, '-');

// API Functions
async function fetchLatestRoute() {
    try {
        const response = await fetch('/api/route');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data.timestamp !== state.currentRouteData?.timestamp) {
            state.currentRouteData = data;
            state.algorithmCache = {};
            updateUI();
        }
    } catch (err) {
        console.error("Failed to fetch route:", err);
        elements.routeDisplay.textContent = "Error loading route data.";
    }
}

async function fetchAlgorithmMetrics(algorithm) {
    const algoKey = algoNameToKey(algorithm);
    if (state.algorithmCache[algoKey]) return state.algorithmCache[algoKey];

    try {
        const response = await fetch(`/api/analytics/${algoKey}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        state.algorithmCache[algoKey] = data;
        return data;
    } catch (err) {
        console.error(`Failed to fetch ${algorithm} metrics:`, err);
        return null;
    }
}

// UI Update Functions
function updateUI() {
    const route = state.currentRouteData;
    if (route?.startLocation && route?.endLocation) {
        const startName = route.startLocation.displayName?.split(',')[0] ||
            `${route.startLocation.lat.toFixed(2)}, ${route.startLocation.lon.toFixed(2)}`;
        const endName = route.endLocation.displayName?.split(',')[0] ||
            `${route.endLocation.lat.toFixed(2)}, ${route.endLocation.lon.toFixed(2)}`;

        elements.routeDisplay.innerHTML = `
            <strong>From:</strong> ${startName}<br>
            <strong>To:</strong> ${endName}<br>
            <strong>Path Length:</strong> ${route.path?.length || 0} satellites
        `;
    } else {
        elements.routeDisplay.textContent = "No active route selected.";
    }
    updateChart();
    updateWrittenAnalytics();
}

async function updateChart() {
    const selectedAlgos = Array.from(elements.algoButtons)
        .filter(b => b.classList.contains('active'))
        .map(b => b.textContent.trim());
    const selectedMetric = document.querySelector('input[name="metric"]:checked')?.value || 'Hops';

    if (!state.currentRouteData?.startLocation) {
        elements.chartTitle.textContent = 'Select a route to view analytics';
        if (state.chartInstance) {
            state.chartInstance.destroy();
            state.chartInstance = null;
        }
        return;
    }

    elements.chartTitle.textContent = selectedMetric + ' Comparison';
    const metricUnit = selectedMetric === 'Latency' ? 'ms' : (selectedMetric === 'Bandwidth' ? '%' : '');

    const metricValues = {};
    for (const algo of selectedAlgos) {
        const algoData = await fetchAlgorithmMetrics(algo);
        let value;

        if (algoData) {
            value = selectedMetric === 'Hops' ? algoData.hops :
                selectedMetric === 'Latency' ? (algoData.latencyMs ?? algoData.latency) :
                    algoData.bandwidth;
        }

        if (value === undefined || value === null) {
            value = selectedMetric === 'Hops' ? (state.currentRouteData.hops || 0) :
                selectedMetric === 'Latency' ? (state.currentRouteData.estimatedLatencyMs || 0) : 0;
        }

        metricValues[algo] = value;
    }

    createChart(metricValues, selectedMetric, metricUnit);
}

function createChart(metricValues, metricName, unit) {
    if (state.chartInstance) state.chartInstance.destroy();

    const labels = Object.keys(metricValues);
    const data = Object.values(metricValues);
    const isLine = state.currentChartType === 'line';

    const config = {
        type: state.currentChartType,
        data: {
            labels,
            datasets: [{
                label: `${metricName} ${unit}`,
                data,
                backgroundColor: isLine ? colors.bars : colors.bars,
                borderColor: isLine ? colors.line : colors.borders,
                borderWidth: isLine ? 3 : 2,
                pointBackgroundColor: isLine ? colors.borders : undefined,
                pointBorderColor: isLine ? colors.borders : undefined,
                pointRadius: isLine ? 6 : 3,
                pointHoverRadius: isLine ? 8 : 4,
                fill: false,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 750, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 20, 0.9)',
                    titleColor: '#7eb8ff',
                    bodyColor: '#cfe4ff',
                    borderColor: 'rgba(126, 184, 255, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false, // Remove colored box from tooltip
                    callbacks: {
                        title: function(context) {
                            // Return algorithm name as title
                            return context[0].label;
                        },
                        label: function(context) {
                            // Return only the formatted value with unit
                            const value = context.parsed.y;
                            return formatNumber(value, metricName) + unit;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: `${metricName} ${unit}`,
                        color: '#7eb8ff',
                        font: { size: 14, weight: '600' }
                    },
                    ticks: {
                        color: '#cfe4ff',
                        font: { size: 12 },
                        stepSize: metricName === 'Hops' ? 1 : undefined,
                        callback: (value) => formatNumber(value, metricName)
                    },
                    grid: { color: 'rgba(100, 150, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#cfe4ff', font: { size: 12 } },
                    grid: { display: false }
                }
            }
        }
    };

    state.chartInstance = new Chart(elements.chartCanvas, config);
}

async function updateWrittenAnalytics() {
    const selectedAlgos = Array.from(elements.algoButtons)
        .filter(b => b.classList.contains('active'))
        .map(b => b.textContent.trim());

    if (!elements.summaryCheckbox.checked) {
        elements.writtenDiv.style.display = 'none';
        return;
    }

    if (!state.currentRouteData?.startLocation) {
        elements.writtenDiv.innerHTML = '<div style="color: #aaa;">No route data available</div>';
        elements.writtenDiv.style.display = 'block';
        return;
    }

    let metricsToShow = [document.querySelector('input[name="metric"]:checked').value];

    if (selectedAlgos.length === 1) {
        metricsToShow = Array.from(elements.extraMetricCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        const currentMain = document.querySelector('input[name="metric"]:checked').value;
        if (!metricsToShow.includes(currentMain)) metricsToShow.unshift(currentMain);
    }

    elements.writtenDiv.innerHTML = '<div style="color: #aaa; margin-bottom: 10px;">Loading analytics...</div>';
    const container = document.createElement('div');

    for (const algo of selectedAlgos) {
        const block = document.createElement('div');
        block.className = 'algo-block';
        block.innerHTML = `<div class="algo-name">${algo}</div>`;

        const algoData = await fetchAlgorithmMetrics(algo);

        for (const metric of metricsToShow) {
            let val;

            if (algoData) {
                val = metric === 'Hops' ? algoData.hops :
                    metric === 'Latency' ? (algoData.latencyMs ?? algoData.latency) :
                        algoData.bandwidth;
            }

            if (val === undefined || val === null) {
                val = metric === 'Hops' ? (state.currentRouteData.hops || 0) :
                    metric === 'Latency' ? (state.currentRouteData.estimatedLatencyMs || 0) : 0;
            }

            const unit = metric === 'Latency' ? 'ms' : (metric === 'Hops' ? '' : '%');
            const item = document.createElement('div');
            item.className = 'metric-item';
            item.innerHTML = `
                <span>${metric}</span>
                <span style="color:#7eb8ff; font-family:monospace;">
                    ${formatNumber(val, metric)}${unit}
                </span>
            `;
            block.appendChild(item);
        }
        container.appendChild(block);
    }

    elements.writtenDiv.innerHTML = '';
    elements.writtenDiv.appendChild(container);
    elements.writtenDiv.style.display = 'block';
}

// Event Listeners
elements.algoButtons.forEach(btn => btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    updateChart();
    updateWrittenAnalytics();
}));

elements.metricRadios.forEach(radio => radio.addEventListener('change', () => {
    updateChart();
    updateWrittenAnalytics();
}));

elements.extraMetricCheckboxes.forEach(cb => cb.addEventListener('change', updateWrittenAnalytics));
elements.summaryCheckbox.addEventListener('change', updateWrittenAnalytics);

elements.chartTypeButtons.forEach(btn => btn.addEventListener('click', () => {
    elements.chartTypeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentChartType = btn.dataset.type;
    updateChart();
}));

// Initialize
setInterval(fetchLatestRoute, 3000);
fetchLatestRoute();
