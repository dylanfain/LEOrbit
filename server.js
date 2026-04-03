import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildConstellation } from './server/satellite-server.js';
import { dijkstraHopShortestPath } from './server/routing/dijkstra-hop.js';
import {
    getAlgorithmAnalytics,
    getAlgorithmComparison
} from './server/analytics/algorithm-comparison.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const MAX_LINK_RANGE_KM = Number(process.env.MAX_LINK_RANGE_KM ?? 5000);
const TLE_PATH = process.env.TLE_PATH ?? path.join(__dirname, 'public', 'data', 'starlink.tle');

const app = express();

const GROUND_STATION_HOP_COUNT = 2;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

app.get('/analytics', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

let constellation = null;

let satelliteById = new Map();

let currentRoute = {
    startLocation: null,
    endLocation: null,
    startSatellite: null,
    endSatellite: null,
    path: [],
    satellitePositions: [],
    hops: 0,
    estimatedLatencyMs: 0,
    timestamp: null
};

app.post('/api/route', (req, res) => {
    if (!constellation) {
        return res.status(503).json({ error: 'Constellation not ready' });
    }

    const { start, end } = req.body ?? {};
    const validationErrors = [];

    if (!isValidLocation(start)) {
        validationErrors.push('start');
    }

    if (!isValidLocation(end)) {
        validationErrors.push('end');
    }

    if (validationErrors.length > 0) {
        return res.status(400).json({
            error: 'Invalid route payload',
            details: validationErrors
        });
    }

    logRouteRequest(start, end);

    const now = new Date();

    const startMatch = constellation.findClosestSatelliteToLocation(
        start.lat,
        start.lon,
        0,
        { minNeighbors: 1 }
    );
    const endMatch = constellation.findClosestSatelliteToLocation(
        end.lat,
        end.lon,
        0,
        { minNeighbors: 1 }
    );

    if (!startMatch?.satellite || !endMatch?.satellite) {
        console.warn('[route] Unable to resolve satellites for request', {
            startNeighbors: startMatch?.neighborCount,
            endNeighbors: endMatch?.neighborCount
        });
        return res.status(503).json({ error: 'Unable to locate satellites for the requested positions' });
    }

    const routeResult = dijkstraHopShortestPath(
        { graph: constellation.networkGraph },
        startMatch.satellite.id,
        endMatch.satellite.id
    );

    if (!routeResult) {
        console.warn('[route] No viable path found', {
            startId: startMatch.satellite.id,
            endId: endMatch.satellite.id,
            startNeighbors: startMatch.neighborCount,
            endNeighbors: endMatch.neighborCount
        });
        return res.status(503).json({ error: 'No viable route between the selected locations' });
    }

    const estimatedLatencyMs = computePathLatency(routeResult.path, constellation.networkGraph);
    const islStats = computeISLStats(routeResult.path, constellation.networkGraph);
    const totalHops = includeGroundStationHops(routeResult.hops);

    const satellitePositions = Array.isArray(routeResult.path)
        ? routeResult.path.map((satIdRaw) => {
            const satId = Number(satIdRaw);
            const sat = satelliteById.get(satId);
            const geo = sat?.getGeodeticDegrees();
            return {
                id: satId,
                name: sat?.name ?? null,
                lat: geo?.latitude ?? null,
                lon: geo?.longitude ?? null,
                altitude: geo?.altitude ?? null
            };
        })
        : [];

    currentRoute = {
        startLocation: start,
        endLocation: end,
        startSatellite: formatSatelliteMatch(startMatch),
        endSatellite: formatSatelliteMatch(endMatch),
        path: routeResult.path,
        satellitePositions,
        hops: totalHops,
        estimatedLatencyMs,
        islStats,
        timestamp: now.toISOString()
    };

    logRouteSummary(start, end, totalHops, estimatedLatencyMs);
    logRouteDetails(currentRoute);

    res.json(currentRoute);
});

app.get('/api/route', (_req, res) => {
    if (!constellation) {
        return res.status(503).json({ error: 'Constellation not ready' });
    }

    res.json(currentRoute);
});

app.get('/api/analytics/algorithm-comparison', (_req, res) => {
    try {
        const comparisonData = getAlgorithmComparison(currentRoute, constellation);
        res.json(comparisonData);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to compute comparison';

        if (message === 'Constellation not ready') {
            return res.status(503).json({ error: message });
        }

        if (message === 'No route data available' || message === 'Unable to compute comparison') {
            return res.status(404).json({ error: message });
        }

        return res.status(500).json({ error: message });
    }
});

// ============== Algorithm Dashboard API GET ==============
app.get('/api/analytics/:algorithm', (req, res) => {
    if (!constellation) {
        return res.status(503).json({ error: 'Constellation not ready' });
    }

    const { algorithm } = req.params;

    if (!currentRoute.path || currentRoute.path.length === 0) {
        return res.status(404).json({
            error: 'No route data available',
            message: 'Please calculate a route first in the 3D Visualization tab'
        });
    }

    const analyticsData = {
        algorithm,
        hops: currentRoute.hops,
        latency: currentRoute.estimatedLatencyMs,
        bandwidth: calculateBandwidthUsage(currentRoute.path, constellation.networkGraph),
        pathLength: currentRoute.path.length,
        islStats: currentRoute.islStats,
        timestamp: currentRoute.timestamp
    };

    res.json(analyticsData);
});

function isValidLocation(location) {
    return (
        location &&
        Number.isFinite(Number(location.lat)) &&
        Number.isFinite(Number(location.lon))
    );
}
function computeISLStats(pathNodes, graph) {
    if (!Array.isArray(pathNodes) || pathNodes.length < 2) {
        return { avgDistance: 0, minDistance: 0, maxDistance: 0 };
    }
    const distances = [];
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const fromId = Number(pathNodes[i]);
        const toId = Number(pathNodes[i + 1]);
        const edges = graph instanceof Map
            ? graph.get(fromId) || []
            : graph[String(fromId)] || graph[fromId] || [];
        const edge = edges.find((neighbor) => Number(neighbor.target) === toId);
        if (edge && Number.isFinite(Number(edge.distance))) {
            distances.push(Number(edge.distance));
        }
    }
    if (distances.length === 0) {
        return { avgDistance: 0, minDistance: 0, maxDistance: 0 };
    }
    const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
    return {
        avgDistance: Number(avg.toFixed(2)),
        minDistance: Number(Math.min(...distances).toFixed(2)),
        maxDistance: Number(Math.max(...distances).toFixed(2))
    };
}

function computePathLatency(pathNodes, graph) {
    if (!Array.isArray(pathNodes) || pathNodes.length < 2) {
        return 0;
    }

    let total = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const fromId = Number(pathNodes[i]);
        const toId = Number(pathNodes[i + 1]);
        const edges = graph instanceof Map
            ? graph.get(fromId) || []
            : graph[String(fromId)] || graph[fromId] || [];
        const edge = edges.find((neighbor) => Number(neighbor.target) === toId);

        if (edge && Number.isFinite(Number(edge.latency))) {
            total += Number(edge.latency);
        }
    }

    return Number(total.toFixed(3));
}

function includeGroundStationHops(satelliteHopCount) {
    const baseHopCount = Number(satelliteHopCount);
    return Number.isFinite(baseHopCount) ? baseHopCount + GROUND_STATION_HOP_COUNT : GROUND_STATION_HOP_COUNT;
}

// ============== Pseudo Bandwidth Info (Until we get it) ==============
function calculateBandwidthUsage(pathNodes, graph) {
    if (!Array.isArray(pathNodes) || pathNodes.length < 2) {
        return 0;
    }

    let totalBandwidth = 0;
    let linkCount = 0;

    for (let i = 0; i < pathNodes.length - 1; i++) {
        const fromId = Number(pathNodes[i]);
        const toId = Number(pathNodes[i + 1]);
        const edges = graph instanceof Map
            ? graph.get(fromId) || []
            : graph[String(fromId)] || graph[fromId] || [];
        const edge = edges.find((neighbor) => Number(neighbor.target) === toId);

        if (edge) {
            const latency = Number(edge.latency ?? 0);
            const bandwidth = edge.bandwidth ?? (100 - latency / 10);
            totalBandwidth += Number(bandwidth);
            linkCount++;
        }
    }

    return linkCount > 0 ? Number((totalBandwidth / linkCount).toFixed(2)) : 0;
}

function formatSatelliteMatch(match) {
    if (!match?.satellite) return null;

    const distanceKm = Number.isFinite(match.distance)
        ? Number(match.distance.toFixed(2))
        : null;

    return {
        id: match.satellite.id,
        name: match.satellite.name,
        distanceKm,
        componentId: match.componentId ?? null,
        neighborCount: match.neighborCount ?? (match.satellite.visibleNeighbors?.length ?? 0),
        geodetic: match.satellite.getGeodeticDegrees()
    };
}

function logRouteSummary(start, end, hops, latencyMs) {
    const describe = (point) =>
        point?.displayName ??
        `${Number(point.lat).toFixed(2)}, ${Number(point.lon).toFixed(2)}`;

    console.log(
        `[route] ${describe(start)} -> ${describe(end)} | ${hops} hops | ~${latencyMs.toFixed(2)} ms`
    );
}

function logRouteDetails(routePayload) {
    const line = (label, value) => `   ${label.padEnd(18, ' ')}${value ?? '-'}`;
    const satLine = (prefix, sat) =>
        sat
            ? [
                line(`${prefix} ID`, sat.id),
                line(`${prefix} Name`, sat.name),
                line(`${prefix} Distance`, sat.distanceKm ? `${sat.distanceKm} km` : '-')
            ].join('\n')
            : line(`${prefix} Satellite`, 'not resolved');

    console.log('\n[route:details]');
    console.log(line('Timestamp', routePayload.timestamp));
    console.log(line('Start Location', routePayload.startLocation?.displayName));
    console.log(line('End Location', routePayload.endLocation?.displayName));
    console.log(satLine('Start', routePayload.startSatellite));
    console.log(satLine('End', routePayload.endSatellite));
    console.log(line('Start Component', routePayload.startSatellite?.componentId));
    console.log(line('End Component', routePayload.endSatellite?.componentId));
    console.log(line('Start Neighbors', routePayload.startSatellite?.neighborCount));
    console.log(line('End Neighbors', routePayload.endSatellite?.neighborCount));
    console.log(line('Hop Count', routePayload.hops));
    console.log(line('Latency (ms)', routePayload.estimatedLatencyMs));
    console.log(line('Path (ids)', routePayload.path?.join(' -> ') || 'n/a'));
    console.log(line('Notes', 'Using just Dijkstra\'s algorithm right now'));
    console.log('[route:details:end]\n');
}

function logRouteRequest(start, end) {
    const fmt = (point) =>
        point
            ? `${point.displayName ?? 'Custom'} (${Number(point.lat).toFixed(2)}, ${Number(point.lon).toFixed(2)})`
            : 'unset';

    console.log('[route:req] Received request, loading constellation state...');
    console.log(`   start => ${fmt(start)}`);
    console.log(`   end   => ${fmt(end)}`);
}

async function start() {
    try {
        constellation = await buildConstellation(TLE_PATH);
        constellation.buildNetworkGraph(MAX_LINK_RANGE_KM);

        satelliteById = new Map(constellation.satellites.map((sat) => [Number(sat.id), sat]));

        console.log(
            `[init] Loaded ${constellation.satellites.length} satellites from ${path.relative(
                __dirname,
                TLE_PATH
            )}`
        );
        console.log(`[init] Built static network graph with max range ${MAX_LINK_RANGE_KM} km`);

        app.listen(PORT, () => {
            console.log(`[server] Satellite Visualizer API running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize constellation:', error);
        process.exit(1);
    }
}

start();
