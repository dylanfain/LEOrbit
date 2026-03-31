// Chart Configuration
Chart.defaults.color = '#cfe4ff';
Chart.defaults.borderColor = 'rgba(100, 150, 255, 0.2)';

const EARTH_RADIUS_KM = 6371;

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
    currentChartType: 'bar',
    writtenAnalyticsOpen: false
};

// DOM Elements
const elements = {
    algoButtons: document.querySelectorAll('.toggle-button'),
    writtenToggle: document.getElementById('written-analytics-toggle'),
    writtenPanel: document.getElementById('written-analytics-panel'),
    writtenDiv: document.getElementById('written-analytics'),
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
    if (metric === 'Path Efficiency') return value.toFixed(1);

    const absValue = Math.abs(value);
    if (absValue >= 100) return value.toFixed(1);
    if (absValue >= 10) return value.toFixed(2);
    return value.toFixed(3);
};

const algoNameToKey = (name) => algorithm_mapping[name] || name.toLowerCase().replace(/\s+/g, '-');

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function greatCircleDistanceKm(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) {
        return 0;
    }

    const lat1 = toRadians(Number(a.lat));
    const lat2 = toRadians(Number(b.lat));
    const lon1 = toRadians(Number(a.lon));
    const lon2 = toRadians(Number(b.lon));

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;

    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function geodeticToCartesian(lat, lon, altitudeKm = 0) {
    const r = EARTH_RADIUS_KM + Number(altitudeKm || 0);
    const phi = toRadians(90 - Number(lat));
    const theta = toRadians(Number(lon) + 180);

    return {
        x: -r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta)
    };
}

function distanceKmBetweenPoints(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeActualSatellitePathDistanceKm(route) {
    if (!route || !Array.isArray(route.satellitePositions) || route.satellitePositions.length === 0) {
        return 0;
    }

    let total = 0;

    const routePoints = [];

    if (route.startLocation && Number.isFinite(Number(route.startLocation.lat)) && Number.isFinite(Number(route.startLocation.lon))) {
        routePoints.push(geodeticToCartesian(route.startLocation.lat, route.startLocation.lon, 0));
    }

    for (const sat of route.satellitePositions) {
        if (!sat || !Number.isFinite(Number(sat.lat)) || !Number.isFinite(Number(sat.lon))) continue;
        routePoints.push(geodeticToCartesian(sat.lat, sat.lon, sat.altitude ?? 0));
    }

    if (route.endLocation && Number.isFinite(Number(route.endLocation.lat)) && Number.isFinite(Number(route.endLocation.lon))) {
        routePoints.push(geodeticToCartesian(route.endLocation.lat, route.endLocation.lon, 0));
    }

    for (let i = 0; i < routePoints.length - 1; i++) {
        total += distanceKmBetweenPoints(routePoints[i], routePoints[i + 1]);
    }

    return Number(total.toFixed(2));
}

function computePathEfficiencyPercentage(route) {
    if (!route || !route.startLocation || !route.endLocation) {
        return 0;
    }

    const directKm = greatCircleDistanceKm(route.startLocation, route.endLocation);
    const actualKm = computeActualSatellitePathDistanceKm(route);

    if (directKm <= 0 || actualKm <= 0) {
        return 0;
    }

    return Number(((directKm / actualKm) * 100).toFixed(1));
}

function pathEfficiencyColor(percent) {
    if (percent >= 70) return '#4caf50';
    if (percent >= 40) return '#ffeb3b';
    return '#ff9800';
}

function getSelectedAlgorithms() {
    return Array.from(elements.algoButtons)
        .filter(button => button.classList.contains('active'))
        .map(button => button.textContent.trim());
}

function getDisplayedHopCount(routeData, algoData = null) {
    if (Array.isArray(routeData?.path) && routeData.path.length > 0) {
        return routeData.path.length + 1;
    }

    if (typeof algoData?.pathLength === 'number' && algoData.pathLength > 0) {
        return algoData.pathLength + 1;
    }

    if (typeof algoData?.hops === 'number') {
        return algoData.hops;
    }

    return typeof routeData?.hops === 'number' ? routeData.hops : 0;
}

function getMetricValue(metric, algoData, routeData) {
    if (metric === 'Path Efficiency') {
        return computePathEfficiencyPercentage(routeData);
    }

    if (metric === 'Hops') {
        return getDisplayedHopCount(routeData, algoData);
    }

    if (algoData) {
        return metric === 'Latency' ? (algoData.latencyMs ?? algoData.latency) : algoData.bandwidth;
    }

    return metric === 'Latency' ? (routeData.estimatedLatencyMs || 0) : 0;
}

function syncWrittenAnalyticsVisibility() {
    elements.writtenToggle.setAttribute('aria-expanded', String(state.writtenAnalyticsOpen));
    elements.writtenPanel.classList.toggle('open', state.writtenAnalyticsOpen);
    elements.writtenDiv.style.display = state.writtenAnalyticsOpen ? 'block' : 'none';
}

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
    const selectedAlgos = getSelectedAlgorithms();
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
    const metricUnit = selectedMetric === 'Latency' ? 'ms' : (selectedMetric === 'Bandwidth' || selectedMetric === 'Path Efficiency' ? '%' : '');

    const metricValues = {};
    for (const algo of selectedAlgos) {
        const algoData = await fetchAlgorithmMetrics(algo);
        let value = getMetricValue(selectedMetric, algoData, state.currentRouteData);

        if (value === undefined || value === null) {
            value = getMetricValue(selectedMetric, null, state.currentRouteData);
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
    const isPercentageMetric = metricName === 'Bandwidth' || metricName === 'Path Efficiency';

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
                    max: isPercentageMetric ? 100 : undefined,
                    title: {
                        display: true,
                        text: `${metricName} ${unit}`,
                        color: '#7eb8ff',
                        font: { size: 14, weight: '600' }
                    },
                    ticks: {
                        color: '#cfe4ff',
                        font: { size: 12 },
                        stepSize: metricName === 'Hops' ? 1 : (isPercentageMetric ? 20 : undefined),
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
    syncWrittenAnalyticsVisibility();

    if (!state.writtenAnalyticsOpen) {
        return;
    }

    const selectedAlgos = getSelectedAlgorithms();

    if (!state.currentRouteData?.startLocation) {
        elements.writtenDiv.innerHTML = '<div style="color: #aaa;">No route data available</div>';
        return;
    }

    if (selectedAlgos.length === 0) {
        elements.writtenDiv.innerHTML = '<div style="color: #aaa;">Select at least one algorithm to view written analytics</div>';
        return;
    }

    const metricsToShow = ['Hops', 'Latency', 'Bandwidth', 'Path Efficiency'];

    elements.writtenDiv.innerHTML = '<div style="color: #aaa; margin-bottom: 10px;">Loading analytics...</div>';
    const container = document.createElement('div');

    for (const algo of selectedAlgos) {
        const block = document.createElement('div');
        block.className = 'algo-block';
        block.innerHTML = `<div class="algo-name">${algo}</div>`;

        const algoData = await fetchAlgorithmMetrics(algo);

        for (const metric of metricsToShow) {
            let val = getMetricValue(metric, algoData, state.currentRouteData);

            if (val === undefined || val === null) {
                val = getMetricValue(metric, null, state.currentRouteData);
            }

            const unit = metric === 'Latency' ? 'ms' : (metric === 'Hops' ? '' : '%');
            const metricColor = metric === 'Path Efficiency' ? pathEfficiencyColor(val) : '#7eb8ff';

            const item = document.createElement('div');
            item.className = 'metric-item';
            item.innerHTML = `
                <span>${metric}</span>
                <span style="color:${metricColor}; font-family:monospace; font-weight:700;">
                    ${formatNumber(val, metric)}${unit}
                </span>
            `;
            block.appendChild(item);
        }
        container.appendChild(block);
    }

    elements.writtenDiv.innerHTML = '';
    elements.writtenDiv.appendChild(container);
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

elements.writtenToggle.addEventListener('click', () => {
    state.writtenAnalyticsOpen = !state.writtenAnalyticsOpen;
    updateWrittenAnalytics();
});

elements.chartTypeButtons.forEach(btn => btn.addEventListener('click', () => {
    elements.chartTypeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentChartType = btn.dataset.type;
    updateChart();
}));

// Initialize
syncWrittenAnalyticsVisibility();
setInterval(fetchLatestRoute, 3000);
fetchLatestRoute();
