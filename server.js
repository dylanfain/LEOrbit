import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildConstellation } from './server/satellite-server.js';
import { dijkstraHopShortestPath } from './server/routing/dijkstra-hop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const MAX_LINK_RANGE_KM = Number(process.env.MAX_LINK_RANGE_KM ?? 5000);
const TLE_PATH = process.env.TLE_PATH ?? path.join(__dirname, 'public', 'data', 'starlink.tle');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

let constellation = null;
let currentRoute = {
    startLocation: null,
    endLocation: null,
    startSatellite: null,
    endSatellite: null,
    path: [],
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

    const now = new Date();
    constellation.updateAllPositions(now);
    constellation.buildNetworkGraph(MAX_LINK_RANGE_KM);
    const networkState = constellation.exportNetworkState();

    const startMatch = constellation.findClosestSatelliteToLocation(start.lat, start.lon);
    const endMatch = constellation.findClosestSatelliteToLocation(end.lat, end.lon);

    if (!startMatch?.satellite || !endMatch?.satellite) {
        return res.status(503).json({ error: 'Unable to locate satellites for the requested positions' });
    }

    const routeResult = dijkstraHopShortestPath(
        networkState,
        startMatch.satellite.id,
        endMatch.satellite.id
    );

    if (!routeResult) {
        return res.status(503).json({ error: 'No viable route between the selected locations' });
    }

    const estimatedLatencyMs = computePathLatency(routeResult.path, networkState.graph);

    currentRoute = {
        startLocation: start,
        endLocation: end,
        startSatellite: formatSatelliteMatch(startMatch),
        endSatellite: formatSatelliteMatch(endMatch),
        path: routeResult.path,
        hops: routeResult.hops,
        estimatedLatencyMs,
        timestamp: now.toISOString()
    };

    logRouteSummary(start, end, routeResult.hops, estimatedLatencyMs);

    res.json(currentRoute);
});

app.get('/api/route', (_req, res) => {
    if (!constellation) {
        return res.status(503).json({ error: 'Constellation not ready' });
    }

    res.json(currentRoute);
});

function isValidLocation(location) {
    return (
        location &&
        Number.isFinite(Number(location.lat)) &&
        Number.isFinite(Number(location.lon))
    );
}

function computePathLatency(pathNodes, graph) {
    if (!Array.isArray(pathNodes) || pathNodes.length < 2) {
        return 0;
    }

    let total = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const from = String(pathNodes[i]);
        const to = pathNodes[i + 1];
        const edges = graph[from] || [];
        const edge = edges.find((neighbor) => Number(neighbor.target) === Number(to));

        if (edge && Number.isFinite(Number(edge.latency))) {
            total += Number(edge.latency);
        }
    }

    return Number(total.toFixed(3));
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

async function start() {
    try {
        constellation = await buildConstellation(TLE_PATH);
        console.log(
            `[init] Loaded ${constellation.satellites.length} satellites from ${path.relative(
                __dirname,
                TLE_PATH
            )}`
        );

        app.listen(PORT, () => {
            console.log(`[server] Satellite Visualizer API running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize constellation:', error);
        process.exit(1);
    }
}

start();
