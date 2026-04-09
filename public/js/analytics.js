import { loadRoutePayload } from './route-session.js';

Chart.defaults.color = '#cfe4ff';
Chart.defaults.borderColor = 'rgba(100, 150, 255, 0.2)';

/* Constants */
const EARTH_RADIUS_KM = 6371;

const ALGO_KEY_BY_LABEL = Object.freeze({
    'Hop Count': 'hop',
    'Latency': 'latency',
    'Bandwidth': 'bandwidth',
});

const ALL_ALGOS = Object.freeze(['Hop Count', 'Latency', 'Bandwidth']);

const ALGO_GRAPH_COLORS = Object.freeze({
    'Hop Count': { fill: 'rgba(197, 64, 255, 0.75)', stroke: 'rgba(197, 64, 255, 1)' },
    'Latency': { fill: 'rgba(255, 199, 64, 0.75)', stroke: 'rgba(255, 199, 64, 1)' },
    'Bandwidth': { fill: 'rgba(64, 210, 255, 0.75)', stroke: 'rgba(64, 210, 255, 1)' },
});

const ALGO_DEFINITIONS = Object.freeze({
    'Hop Count': 'Picks the path that uses the fewest satellite-to-satellite steps.',
    'Latency': 'Picks the fastest route overall by choosing the path with the lowest end‑to‑end delay.',
    'Bandwidth': 'Picks the path that tries to avoid congested/low-capacity links and maximize available throughput.',
});

const RANGE_COLORS = Object.freeze({
    good: '#22c55e',
    mid: '#fbbf24',
    bad: '#ef4444',
});

const SESSION_CACHE_KEY = 'analyticsCache.v1';

/* HTML helpers */
function escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function spinnerHTML(label = 'Loading…') {
    // Fully escape: this gets injected into both attribute + HTML text.
    const safeLabel = escapeHtml(label);
    return `
    <div class="inline-loader" role="status" aria-live="polite" aria-label="${safeLabel}">
      <div class="inline-loader-spinner"></div>
      <div class="inline-loader-text">${safeLabel}</div>
    </div>
  `;
}

/* Metric range + color logic */
function metricRange(metric, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return 'mid';

    if (metric === 'Hops') {
        if (v <= 6) return 'good';
        if (v <= 10) return 'mid';
        return 'bad';
    }

    if (metric === 'Latency') {
        if (v <= 50) return 'good';
        if (v <= 120) return 'mid';
        return 'bad';
    }

    if (metric === 'Path Efficiency') {
        if (v >= 70) return 'good';
        if (v >= 40) return 'mid';
        return 'bad';
    }

    if (metric === 'Bandwidth') {
        if (v <= 30) return 'good';
        if (v <= 70) return 'mid';
        return 'bad';
    }

    return 'mid';
}

function rangeColor(metric, value) {
    return RANGE_COLORS[metricRange(metric, value)] || RANGE_COLORS.mid;
}

/* Geometry helpers */
function toRadians(value) {
    return (value * Math.PI) / 180;
}

function greatCircleDistanceKm(a, b) {
    const aLat = Number(a?.lat);
    const aLon = Number(a?.lon);
    const bLat = Number(b?.lat);
    const bLon = Number(b?.lon);

    if (!Number.isFinite(aLat) || !Number.isFinite(aLon) || !Number.isFinite(bLat) || !Number.isFinite(bLon)) {
        return 0;
    }

    const lat1 = toRadians(aLat);
    const lat2 = toRadians(bLat);
    const lon1 = toRadians(aLon);
    const lon2 = toRadians(bLon);

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
        z: r * Math.sin(phi) * Math.sin(theta),
    };
}

function distanceKmBetweenPoints(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function computeActualSatellitePathDistanceKm(route) {
    const sats = route?.satellitePositions;
    if (!Array.isArray(sats) || sats.length === 0) return 0;

    const routePoints = [];

    const startLat = Number(route?.startLocation?.lat);
    const startLon = Number(route?.startLocation?.lon);
    if (Number.isFinite(startLat) && Number.isFinite(startLon)) {
        routePoints.push(geodeticToCartesian(startLat, startLon, 0));
    }

    for (const sat of sats) {
        const satLat = Number(sat?.lat);
        const satLon = Number(sat?.lon);
        if (!Number.isFinite(satLat) || !Number.isFinite(satLon)) continue;
        routePoints.push(geodeticToCartesian(satLat, satLon, sat?.altitude ?? 0));
    }

    const endLat = Number(route?.endLocation?.lat);
    const endLon = Number(route?.endLocation?.lon);
    if (Number.isFinite(endLat) && Number.isFinite(endLon)) {
        routePoints.push(geodeticToCartesian(endLat, endLon, 0));
    }

    let total = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
        total += distanceKmBetweenPoints(routePoints[i], routePoints[i + 1]);
    }

    return Number(total.toFixed(2));
}

function computePathEfficiencyPercentage(route) {
    if (!route?.startLocation || !route?.endLocation) return 0;

    const directKm = greatCircleDistanceKm(route.startLocation, route.endLocation);
    const actualKm = computeActualSatellitePathDistanceKm(route);

    if (directKm <= 0 || actualKm <= 0) return 0;
    return Number(((directKm / actualKm) * 100).toFixed(1));
}

function pathEfficiencyColor(percent) {
    if (percent >= 70) return RANGE_COLORS.good;
    if (percent >= 40) return RANGE_COLORS.mid;
    return '#fb923c';
}

function formatNumber(value, metric) {
    const n = Number(value);
    if (metric === 'Hops') {
        if (!Number.isFinite(n)) return '0';
        return Math.round(n).toString();
    }

    if (!Number.isFinite(n)) return '0.00';
    if (n === 0) return '0.00';
    if (metric === 'Path Efficiency') return n.toFixed(1);

    const abs = Math.abs(n);
    if (abs >= 100) return n.toFixed(1);
    if (abs >= 10) return n.toFixed(2);
    return n.toFixed(3);
}

const state = {
    currentRouteData: null,
    algorithmCache: {},

    cachedRouteTimestamp: null,
    cachedMetricDataByAlgo: null,

    viewMode: 'graph',
    graphCharts: {},

    loadingDashboard: false,
};

const elements = {
    panelViewBtn: document.getElementById('panel-view-btn'),
    graphViewBtn: document.getElementById('graph-view-btn'),

    panelView: document.getElementById('panel-view'),
    graphView: document.getElementById('graph-view'),

    panelLoader: document.getElementById('panel-loader'),
    graphLoader: document.getElementById('graph-loader'),

    algoPanels: document.getElementById('algo-panels'),
    routeDisplay: document.getElementById('active-route-display'),

    chartHops: document.getElementById('chart-hops'),
    chartLatency: document.getElementById('chart-latency'),
    chartBandwidth: document.getElementById('chart-bandwidth'),
    chartEfficiency: document.getElementById('chart-efficiency'),

    algoTooltip: document.getElementById('algo-tooltip'),
};

/* Algorithm selection */
function getSelectedAlgorithms() {
    return ALL_ALGOS.slice();
}

/* Loading */
function setDashboardLoading(isLoading, label = 'Loading analytics…') {
    state.loadingDashboard = isLoading;

    const display = isLoading ? 'flex' : 'none';

    if (elements.panelLoader) {
        elements.panelLoader.style.display = display;
        elements.panelLoader.innerHTML = isLoading ? spinnerHTML(label) : '';
    }

    if (elements.graphLoader) {
        elements.graphLoader.style.display = display;
        elements.graphLoader.innerHTML = isLoading ? spinnerHTML(label) : '';
    }
}

/* Cache helpers */
function readSessionCache() {
    try {
        const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeSessionCache() {
    try {
        if (!state.cachedRouteTimestamp || !state.cachedMetricDataByAlgo) return;

        sessionStorage.setItem(
            SESSION_CACHE_KEY,
            JSON.stringify({
                timestamp: state.cachedRouteTimestamp,
                metricDataByAlgo: state.cachedMetricDataByAlgo,
                savedAt: Date.now(),
            })
        );
    } catch {
        // ignore
    }
}

function clearSessionCache() {
    try {
        sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
        // ignore
    }
}

/* Metric values */
function getDisplayedHopCount(routeData, algoData) {
    if (algoData && typeof algoData.hops === 'number') return algoData.hops;
    if (algoData && typeof algoData.pathLength === 'number' && algoData.pathLength > 0) return algoData.pathLength + 1;

    if (Array.isArray(routeData?.path) && routeData.path.length > 0) return routeData.path.length + 1;
    if (typeof routeData?.hops === 'number') return routeData.hops;
    return 0;
}

function getMetricValue(metric, algoData, routeData) {
    if (metric === 'Path Efficiency') {
        if (algoData && typeof algoData.pathEfficiency === 'number') return algoData.pathEfficiency;
        return computePathEfficiencyPercentage(routeData);
    }

    if (metric === 'Hops') return getDisplayedHopCount(routeData, algoData);

    if (algoData) {
        if (metric === 'Latency') return algoData.estimatedLatencyMs ?? algoData.latencyMs ?? algoData.latency ?? 0;
        if (metric === 'Bandwidth') return algoData.bandwidthUsage ?? algoData.bandwidth ?? 0;
    }

    if (metric === 'Latency') return routeData?.estimatedLatencyMs || 0;
    return 0;
}

/* Toggling */
function setViewMode(mode) {
    state.viewMode = mode;

    elements.panelViewBtn?.classList.toggle('active', mode === 'panel');
    elements.graphViewBtn?.classList.toggle('active', mode === 'graph');

    elements.panelViewBtn?.setAttribute('aria-selected', String(mode === 'panel'));
    elements.graphViewBtn?.setAttribute('aria-selected', String(mode === 'graph'));

    if (elements.panelView) elements.panelView.style.display = mode === 'panel' ? 'block' : 'none';
    if (elements.graphView) elements.graphView.style.display = mode === 'graph' ? 'block' : 'none';

    if (mode !== 'graph') destroyGraphCharts();
    renderFromCache();
}

function metricUnit(metricName) {
    if (metricName === 'Latency') return 'ms';
    if (metricName === 'Bandwidth') return '%';
    if (metricName === 'Path Efficiency') return '%';
    return '';
}

function metricTileLabelHtml(metricName) {
    if (metricName === 'Hops') return 'Hop<br>Count';
    if (metricName === 'Latency') return 'Avg<br>Latency';
    if (metricName === 'Bandwidth') return 'Bandwidth<br>Usage';
    if (metricName === 'Path Efficiency') return 'Path<br>Efficiency';
    return escapeHtml(metricName);
}

function metricBarColor(metricName, value) {
    if (metricName === 'Path Efficiency') return pathEfficiencyColor(Number(value));
    return rangeColor(metricName, value);
}

/* Panel view */
function renderPanels(selectedAlgos, metricDataByAlgo) {
    if (!elements.algoPanels) return;

    const metrics = ['Hops', 'Latency', 'Bandwidth', 'Path Efficiency'];

    elements.algoPanels.innerHTML = selectedAlgos
        .map((algo) => {
            const data = metricDataByAlgo[algo] || {};
            const def = ALGO_DEFINITIONS[algo] || 'Endpoint description unavailable.';
            const safeDef = escapeHtml(def);

            const tiles = metrics
                .map((m) => {
                    const val = data[m] ?? 0;
                    const unit = metricUnit(m);
                    const bar = metricBarColor(m, val);

                    return `
        <div class="metric-tile">
          <div class="metric-bar" style="background:${escapeHtml(bar)}"></div>
          <div class="metric-tile-left">
            <div class="metric-tile-label">${metricTileLabelHtml(m)}</div>
            <div class="metric-tile-sub">${escapeHtml(unit)}</div>
          </div>
          <div class="metric-tile-value">${escapeHtml(formatNumber(val, m))}</div>
        </div>
      `;
                })
                .join('');

            return `
      <div class="algo-panel">
        <div class="algo-panel-header">
          <div class="algo-panel-title">${escapeHtml(algo)}</div>
          <span
            class="algo-panel-hint"
            data-tooltip="${safeDef}"
            aria-label="${safeDef}"
            tabindex="0"
            role="button"
          >ⓘ</span>
        </div>
        <div class="metric-tiles">${tiles}</div>
      </div>
    `;
        })
        .join('');
}

/* Definition tooltip */
function showTooltip(text, clientX, clientY) {
    const tip = elements.algoTooltip;
    if (!tip) return;

    tip.textContent = text;
    tip.style.display = 'block';
    tip.setAttribute('aria-hidden', 'false');

    const padding = 14;
    const offset = 14;

    let x = clientX + offset;
    let y = clientY + offset;

    const rect = tip.getBoundingClientRect();

    if (x + rect.width + padding > window.innerWidth) x = clientX - rect.width - offset;
    if (y + rect.height + padding > window.innerHeight) y = clientY - rect.height - offset;

    tip.style.left = `${Math.max(padding, x)}px`;
    tip.style.top = `${Math.max(padding, y)}px`;
}

function hideTooltip() {
    const tip = elements.algoTooltip;
    if (!tip) return;
    tip.style.display = 'none';
    tip.setAttribute('aria-hidden', 'true');
}

function bindAlgorithmTooltips() {
    if (!elements.algoPanels) return;

    elements.algoPanels.addEventListener('mousemove', (e) => {
        const target = e.target?.closest?.('.algo-panel-hint[data-tooltip]');
        if (!target) return;
        showTooltip(target.getAttribute('data-tooltip') || '', e.clientX, e.clientY);
    });

    elements.algoPanels.addEventListener('mouseleave', hideTooltip);

    elements.algoPanels.addEventListener('focusin', (e) => {
        const target = e.target?.closest?.('.algo-panel-hint[data-tooltip]');
        if (!target) return;

        const r = target.getBoundingClientRect();
        showTooltip(target.getAttribute('data-tooltip') || '', r.left + r.width / 2, r.top + r.height / 2);
    });

    elements.algoPanels.addEventListener('focusout', hideTooltip);
}

/* Graph view */
function destroyGraphCharts() {
    for (const key of Object.keys(state.graphCharts)) {
        try {
            state.graphCharts[key].destroy();
        } catch {
            // ignore
        }
    }
    state.graphCharts = {};
}

function algoColorsFor(algoName) {
    return ALGO_GRAPH_COLORS[algoName] || { fill: 'rgba(126,184,255,0.65)', stroke: 'rgba(126,184,255,1)' };
}

function makeBarChart(canvasEl, labels, values, colorsForBars, metricName, unit, yMax) {
    if (!canvasEl) return null;

    const isHopMetric = metricName === 'Hops';
    const hopMax = isHopMetric ? Math.max(0, ...values.map((value) => Math.round(Number(value) || 0))) : undefined;

    return new Chart(canvasEl, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: `${metricName}${unit ? ` (${unit})` : ''}`,
                    data: values,
                    backgroundColor: colorsForBars.map((c) => c.fill),
                    borderColor: colorsForBars.map((c) => c.stroke),
                    borderWidth: 2,
                    borderRadius: 10,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 0,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 20, 0.9)',
                    titleColor: '#7eb8ff',
                    bodyColor: '#cfe4ff',
                    borderColor: 'rgba(126, 184, 255, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (ctx) => ctx?.[0]?.label || '',
                        label: (ctx) => `${formatNumber(ctx.parsed.y, metricName)}${unit}`,
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: yMax ?? (isHopMetric ? hopMax + 1 : undefined),
                    ticks: {
                        color: '#cfe4ff',
                        font: { size: 12 },
                        stepSize: isHopMetric ? 1 : undefined,
                        precision: isHopMetric ? 0 : undefined,
                        callback: (v) => formatNumber(Number(v), metricName),
                    },
                    grid: { color: 'rgba(100, 150, 255, 0.12)' },
                },
                x: {
                    ticks: { color: '#cfe4ff', font: { size: 12 } },
                    grid: { display: false },
                },
            },
        },
    });
}

function renderGraph(metricDataByAlgo, selectedAlgos) {
    destroyGraphCharts();

    const labels = selectedAlgos;
    const barColors = labels.map((a) => algoColorsFor(a));

    const hops = labels.map((a) => metricDataByAlgo[a]?.Hops ?? 0);
    const latency = labels.map((a) => metricDataByAlgo[a]?.Latency ?? 0);
    const bandwidth = labels.map((a) => metricDataByAlgo[a]?.Bandwidth ?? 0);
    const efficiency = labels.map((a) => metricDataByAlgo[a]?.['Path Efficiency'] ?? 0);

    state.graphCharts.hops = makeBarChart(elements.chartHops, labels, hops, barColors, 'Hops', '', undefined);
    state.graphCharts.latency = makeBarChart(elements.chartLatency, labels, latency, barColors, 'Latency', 'ms', undefined);
    state.graphCharts.bandwidth = makeBarChart(elements.chartBandwidth, labels, bandwidth, barColors, 'Bandwidth', '%', 100);
    state.graphCharts.efficiency = makeBarChart(elements.chartEfficiency, labels, efficiency, barColors, 'Path Efficiency', '%', 100);
}

/* Network/API fetching */
async function fetchLatestRoute() {
    const sessionRoute = loadRoutePayload();
    if (sessionRoute?.startLocation && sessionRoute?.endLocation) {
        return sessionRoute;
    }

    try {
        const response = await fetch('/api/route');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch {
        if (elements.routeDisplay) elements.routeDisplay.textContent = 'Error loading route data.';
        return null;
    }
}

async function fetchAlgorithmMetrics(algorithmLabel) {
    const algoKey = ALGO_KEY_BY_LABEL[algorithmLabel] || String(algorithmLabel).toLowerCase().replace(/\s+/g, '-');
    if (state.algorithmCache[algoKey]) return state.algorithmCache[algoKey];

    const localRouteData = state.currentRouteData?.algorithms?.[algoKey];
    if (localRouteData) {
        state.algorithmCache[algoKey] = localRouteData;
        return localRouteData;
    }

    try {
        const response = await fetch(`/api/analytics/${algoKey}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        state.algorithmCache[algoKey] = data;
        return data;
    } catch {
        return null;
    }
}

function renderRouteChip(route) {
    if (!route?.startLocation || !route?.endLocation) {
        return `
      <div class="stat-row">
        <span class="stat-label stat-route">—</span>
        <span class="stat-value">-</span>
      </div>
    `;
    }

    const startName =
        route.startLocation.displayName?.split(',')[0] ||
        (Number.isFinite(Number(route.startLocation.lat)) && Number.isFinite(Number(route.startLocation.lon))
            ? `${Number(route.startLocation.lat).toFixed(2)}, ${Number(route.startLocation.lon).toFixed(2)}`
            : 'Unknown');

    const endName =
        route.endLocation.displayName?.split(',')[0] ||
        (Number.isFinite(Number(route.endLocation.lat)) && Number.isFinite(Number(route.endLocation.lon))
            ? `${Number(route.endLocation.lat).toFixed(2)}, ${Number(route.endLocation.lon).toFixed(2)}`
            : 'Unknown');

    const leftTitle = escapeHtml(`${startName} → ${endName}`);
    const leftText = escapeHtml(`${startName} → ${endName} `);

    return `
    <div class="stat-row">
      <span class="stat-label stat-route" title="${leftTitle}">${leftText}</span>
    </div>
  `;
}

function renderFromCache() {
    if (state.loadingDashboard) return;

    const selectedAlgos = getSelectedAlgorithms();

    if (!state.currentRouteData?.startLocation || !state.cachedMetricDataByAlgo) {
        if (elements.algoPanels) elements.algoPanels.innerHTML = '';
        destroyGraphCharts();
        return;
    }

    if (state.viewMode === 'panel') {
        renderPanels(selectedAlgos, state.cachedMetricDataByAlgo);
    } else {
        renderGraph(state.cachedMetricDataByAlgo, selectedAlgos);
    }
}

async function computeAndCacheMetricsForCurrentRoute() {
    const selectedAlgos = getSelectedAlgorithms();
    const ts = state.currentRouteData?.timestamp ?? null;

    if (!ts) {
        state.cachedRouteTimestamp = null;
        state.cachedMetricDataByAlgo = null;
        clearSessionCache();
        return;
    }

    setDashboardLoading(true, 'Loading analytics…');
    destroyGraphCharts();

    state.algorithmCache = {};
    state.cachedRouteTimestamp = ts;
    state.cachedMetricDataByAlgo = null;

    try {
        const algoDataList = await Promise.all(selectedAlgos.map((a) => fetchAlgorithmMetrics(a)));

        const metricDataByAlgo = {};
        for (let i = 0; i < selectedAlgos.length; i++) {
            const algo = selectedAlgos[i];
            const algoData = algoDataList[i];

            metricDataByAlgo[algo] = {
                'Hops': getMetricValue('Hops', algoData, state.currentRouteData),
                'Latency': getMetricValue('Latency', algoData, state.currentRouteData),
                'Bandwidth': getMetricValue('Bandwidth', algoData, state.currentRouteData),
                'Path Efficiency': getMetricValue('Path Efficiency', algoData, state.currentRouteData),
            };
        }

        state.cachedMetricDataByAlgo = metricDataByAlgo;
        writeSessionCache();
    } finally {
        setDashboardLoading(false);
    }
}

async function refreshAll() {
    const cached = readSessionCache();
    if (cached?.timestamp && cached?.metricDataByAlgo) {
        state.cachedRouteTimestamp = cached.timestamp;
        state.cachedMetricDataByAlgo = cached.metricDataByAlgo;
    }

    renderFromCache();

    const route = await fetchLatestRoute();
    if (!route) return;

    if (elements.routeDisplay) elements.routeDisplay.innerHTML = renderRouteChip(route);

    const incomingTs = route.timestamp ?? null;
    const cachedTs = state.cachedRouteTimestamp ?? null;

    state.currentRouteData = route;

    if (incomingTs && cachedTs === incomingTs && state.cachedMetricDataByAlgo) {
        renderFromCache();
        return;
    }

    await computeAndCacheMetricsForCurrentRoute();
    renderFromCache();
}

function bindViewToggle(button, mode) {
    if (!button) return;

    const activate = (event) => {
        event?.preventDefault?.();
        setViewMode(mode);
    };

    button.addEventListener('click', activate);
    button.addEventListener('pointerup', activate);
    button.addEventListener('touchend', activate, { passive: false });
}

bindViewToggle(elements.panelViewBtn, 'panel');
bindViewToggle(elements.graphViewBtn, 'graph');

bindAlgorithmTooltips();
setViewMode('graph');
refreshAll();

/* Debug helper */
window.refreshAnalytics = async () => {
    await refreshAll();
};
