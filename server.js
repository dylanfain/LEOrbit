import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildConstellation } from './server/satellite-server.js';
import { dijkstraHopShortestPath } from './server/routing/dijkstra-hop.js';
import { dijkstraLatencyShortestPath } from './server/routing/dijkstra-latency.js';
import { widestPathBandwidth } from './server/routing/djikstra-bandwidth.js';

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

    const { start, end, algorithm = 'hop' } = req.body ?? {};
    const validationErrors = [];

    if (!isValidLocation(start)) {
        validationErrors.push('start');
    }

    if (!isValidLocation(end)) {
        validationErrors.push('end');
    }

    if (!['hop', 'latency', 'bandwidth'].includes(algorithm)) {
        validationErrors.push('algorithm');
    }

    if (validationErrors.length > 0) {
        return res.status(400).json({
            error: 'Invalid route payload',
            details: validationErrors
        });
    }

    logRouteRequest(start, end, algorithm);

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

    let routeResult;
    switch (algorithm) {
        case 'hop':
            routeResult = dijkstraHopShortestPath(
                { graph: constellation.networkGraph },
                startMatch.satellite.id,
                endMatch.satellite.id
            );
            break;
        case 'latency':
            routeResult = dijkstraLatencyShortestPath(
                { graph: constellation.networkGraph },
                startMatch.satellite.id,
                endMatch.satellite.id
            );
            break;
        case 'bandwidth':
            routeResult = widestPathBandwidth(
                { graph: constellation.networkGraph },
                startMatch.satellite.id,
                endMatch.satellite.id
            );
            break;
    }

    if (!routeResult) {
        console.warn('[route] No viable path found', {
            startId: startMatch.satellite.id,
            endId: endMatch.satellite.id,
            startNeighbors: startMatch.neighborCount,
            endNeighbors: endMatch.neighborCount
        });
        return res.status(503).json({ error: 'No viable route between the selected locations' });
    }

    const estimatedLatencyMs = algorithm === 'latency' ? routeResult.totalLatency : computePathLatency(routeResult.path, constellation.networkGraph);
    const islStats = computeISLStats(routeResult.path, constellation.networkGraph);
    const totalHops = includeGroundStationHops(routeResult.hops);
    const bottleneckBandwidth = algorithm === 'bandwidth' ? routeResult.bottleneckBandwidth : null;

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
        algorithm,
        bottleneckBandwidth,
        timestamp: now.toISOString()
    };

    logRouteSummary(start, end, totalHops, estimatedLatencyMs, algorithm);
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

    if (!['hop', 'latency', 'bandwidth'].includes(algorithm)) {
        return res.status(400).json({ error: 'Invalid algorithm' });
    }

    if (!currentRoute.path || currentRoute.path.length === 0) {
        return res.status(404).json({
            error: 'No route data available',
            message: 'Please calculate a route first in the 3D Visualization tab'
        });
    }

    try {
        // Recompute route with the requested algorithm
        const startId = currentRoute.startSatellite.id;
        const endId = currentRoute.endSatellite.id;

        console.log(`[analytics] ${algorithm} - BEFORE computation`);
        console.log(`  startId: ${startId}, endId: ${endId}`);

        let routeResult;
        switch (algorithm) {
            case 'hop':
                routeResult = dijkstraHopShortestPath(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
            case 'latency':
                routeResult = dijkstraLatencyShortestPath(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
            case 'bandwidth':
                routeResult = widestPathBandwidth(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
        }

        if (!routeResult) {
            console.log(`[analytics] ${algorithm} - NO ROUTE FOUND`);
            return res.status(404).json({ error: 'No route found for this algorithm' });
        }

        console.log(`[analytics] ${algorithm} - path: ${routeResult.path.join('->')}, hops: ${routeResult.hops}`);

        const estimatedLatencyMs = algorithm === 'latency' ? routeResult.totalLatency : computePathLatency(routeResult.path, constellation.networkGraph);
        const islStats = computeISLStats(routeResult.path, constellation.networkGraph);
        const totalHops = includeGroundStationHops(routeResult.hops);
        const bandwidth = algorithm === 'bandwidth' ? routeResult.bottleneckBandwidth : calculateBandwidthUsage(routeResult.path, constellation.networkGraph);
        const pathEfficiency = computePathEfficiencyPercentage(
            currentRoute.startLocation,
            currentRoute.endLocation,
            routeResult.path,
            constellation.networkGraph,
            satelliteById
        );
        
        // Build satellite positions for this algorithm's path
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
        
        console.log(`[analytics] ${algorithm} FINAL STATS:`);
        console.log(`  hops: ${totalHops}, latency: ${estimatedLatencyMs}ms, pathLength: ${routeResult.path.length}, efficiency: ${pathEfficiency}%, bandwidth: ${bandwidth}`);
        const analyticsData = {
            algorithm,
            hops: totalHops,
            latency: estimatedLatencyMs,
            bandwidth,
            pathEfficiency,
            pathLength: routeResult.path.length,
            islStats,
            satellitePositions,
            timestamp: currentRoute.timestamp
        };

        res.json(analyticsData);
    } catch (error) {
        console.error(`Error in analytics for ${algorithm}:`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
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

        if (edge) {
            const latency = Number.isFinite(Number(edge.latency))
                ? Number(edge.latency)
                : (Number(edge.distance) / 299792.458);

            if (Number.isFinite(latency)) {
                total += latency;
            }
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
            const bandwidth = Number.isFinite(Number(edge.bandwidth))
                ? Number(edge.bandwidth)
                : Math.max(10, 100 - (Number(edge.distance ?? 5000) / 50));
            totalBandwidth += Number(bandwidth);
            linkCount++;
        }
    }

    return linkCount > 0 ? Number((totalBandwidth / linkCount).toFixed(2)) : 0;
}

function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function computePathEfficiencyPercentage(startLocation, endLocation, pathNodes, graph, satelliteById) {
    if (!startLocation || !endLocation || !Array.isArray(pathNodes) || pathNodes.length < 1) {
        return 0;
    }

    // Calculate direct distance between start and end
    const directKm = greatCircleDistanceKm(
        startLocation.lat,
        startLocation.lon,
        endLocation.lat,
        endLocation.lon
    );

    if (directKm <= 0) return 0;

    // Calculate actual path distance through satellites
    let actualKm = 0;

    // Distance from start location to first satellite
    if (pathNodes.length > 0) {
        const firstSatId = Number(pathNodes[0]);
        const firstSat = satelliteById.get(firstSatId);
        if (firstSat) {
            const geo = firstSat.getGeodeticDegrees();
            actualKm += greatCircleDistanceKm(
                startLocation.lat,
                startLocation.lon,
                geo.latitude,
                geo.longitude
            );
        }
    }

    // Distance between satellites
    for (let i = 0; i < pathNodes.length - 1; i++) {
        const fromId = Number(pathNodes[i]);
        const toId = Number(pathNodes[i + 1]);
        const edges = graph instanceof Map
            ? graph.get(fromId) || []
            : graph[String(fromId)] || graph[fromId] || [];
        const edge = edges.find((neighbor) => Number(neighbor.target) === toId);

        if (edge && Number.isFinite(Number(edge.distance))) {
            actualKm += Number(edge.distance);
        }
    }

    // Distance from last satellite to end location
    if (pathNodes.length > 0) {
        const lastSatId = Number(pathNodes[pathNodes.length - 1]);
        const lastSat = satelliteById.get(lastSatId);
        if (lastSat) {
            const geo = lastSat.getGeodeticDegrees();
            actualKm += greatCircleDistanceKm(
                geo.latitude,
                geo.longitude,
                endLocation.lat,
                endLocation.lon
            );
        }
    }

    if (actualKm <= 0) return 0;

    return Number(((directKm / actualKm) * 100).toFixed(1));
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

function logRouteSummary(start, end, hops, latencyMs, algorithm) {
    const describe = (point) =>
        point?.displayName ??
        `${Number(point.lat).toFixed(2)}, ${Number(point.lon).toFixed(2)}`;

    console.log(
        `[route] ${describe(start)} -> ${describe(end)} | ${hops} hops | ~${latencyMs.toFixed(2)} ms | ${algorithm}`
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
    console.log(line('Algorithm', routePayload.algorithm));
    console.log(line('Notes', 'Using Dijkstra algorithms'));
    console.log('[route:details:end]\n');
}

function logRouteRequest(start, end, algorithm) {
    const fmt = (point) =>
        point
            ? `${point.displayName ?? 'Custom'} (${Number(point.lat).toFixed(2)}, ${Number(point.lon).toFixed(2)})`
            : 'unset';

    console.log('[route:req] Received request, loading constellation state...');
    console.log(`   start => ${fmt(start)}`);
    console.log(`   end   => ${fmt(end)}`);
    console.log(`   algorithm => ${algorithm}`);
}

function getAlgorithmComparison(routeData, constellation) {
    if (!constellation) {
        throw new Error('Constellation not ready');
    }

    if (!routeData || !routeData.startSatellite || !routeData.endSatellite) {
        throw new Error('No route data available');
    }

    const startId = routeData.startSatellite.id;
    const endId = routeData.endSatellite.id;
    const algorithms = ['hop', 'latency', 'bandwidth'];
    const results = {};

    for (const algo of algorithms) {
        let routeResult;
        switch (algo) {
            case 'hop':
                routeResult = dijkstraHopShortestPath(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
            case 'latency':
                routeResult = dijkstraLatencyShortestPath(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
            case 'bandwidth':
                routeResult = widestPathBandwidth(
                    { graph: constellation.networkGraph },
                    startId,
                    endId
                );
                break;
        }

        if (routeResult) {
            const estimatedLatencyMs = algo === 'latency' ? routeResult.totalLatency : computePathLatency(routeResult.path, constellation.networkGraph);
            const totalHops = includeGroundStationHops(routeResult.hops);
            const bandwidth = algo === 'bandwidth' ? routeResult.bottleneckBandwidth : calculateBandwidthUsage(routeResult.path, constellation.networkGraph);

            results[algo] = {
                hops: totalHops,
                latency: estimatedLatencyMs,
                bandwidth,
                pathLength: routeResult.path.length
            };
        }
    }

    if (Object.keys(results).length === 0) {
        throw new Error('Unable to compute comparison');
    }

    return results;
}

async function start() {
    try {
        console.log('\n=== Initialization Starting ===');
        console.log('Memory before buildConstellation:', (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2), 'MB');
        
        constellation = await buildConstellation(TLE_PATH);
        
        console.log('Memory after buildConstellation:', (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2), 'MB');
        console.log(`Building network graph with spatial indexing (${MAX_LINK_RANGE_KM} km range)...`);
        
        const startTime = Date.now();
        constellation.buildNetworkGraph(MAX_LINK_RANGE_KM);
        const buildTime = Date.now() - startTime;
        
        console.log('Memory after buildNetworkGraph:', (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2), 'MB');
        console.log(`Build completed in ${(buildTime / 1000).toFixed(2)}s`);

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
