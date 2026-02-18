/**
 * @param {Object} networkState - Output of SatelliteConstellation.exportNetworkState()
 * @param {number} sourceId
 * @param {number} destinationId
 * @returns {Object|null} { path: number[], hops: number, totalLatency: number } or null
 */
export function dijkstraLatencyShortestPath(networkState, sourceId, destinationId) {
    if (!Number.isFinite(sourceId) || !Number.isFinite(destinationId)) {
        throw new Error("sourceId and destinationId must be finite numbers");
    }

    if (!networkState || typeof networkState.graph !== "object") {
        throw new Error("Invalid networkState: missing graph");
    }

    const graph = normalizeGraph(networkState.graph);

    // Edge case
    if (sourceId === destinationId) {
        return { path: [sourceId], hops: 0, totalLatency: 0 };
    }

    // Collect all node ids that appear as keys or as targets
    const nodes = new Set();
    for (const [key, edges] of graph.entries()) {
        nodes.add(Number(key));
        for (const edge of edges || []) {
            nodes.add(edge.target);
        }
    }
    nodes.add(sourceId);
    nodes.add(destinationId);

    // Dijkstra structures
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();

    for (const node of nodes) {
        dist.set(node, Infinity);
    }
    dist.set(sourceId, 0);

    while (true) {
        // Find unvisited node with smallest distance
        let currentNode = null;
        let minDist = Infinity;
        for (const node of nodes) {
            if (!visited.has(node) && dist.get(node) < minDist) {
                minDist = dist.get(node);
                currentNode = node;
            }
        }

        if (currentNode === null || minDist === Infinity) {
            break; // No path exists
        }

        if (currentNode === destinationId) {
            break; // Found shortest path
        }

        visited.add(currentNode);

        // Relax edges - use latency instead of hop count
        const edges = graph.get(String(currentNode)) || graph.get(currentNode) || [];
        for (const edge of edges) {
            const neighbor = edge.target;
            const latency = edge.latency || 0;
            const newDist = dist.get(currentNode) + latency;  // <-- KEY CHANGE: use latency

            if (newDist < dist.get(neighbor)) {
                dist.set(neighbor, newDist);
                prev.set(neighbor, currentNode);
            }
        }
    }

    // Reconstruct path
    if (!prev.has(destinationId) && sourceId !== destinationId) {
        return null; // No path found
    }

    const path = [];
    let current = destinationId;
    while (current !== undefined) {
        path.unshift(current);
        current = prev.get(current);
    }

    return {
        path: path,
        hops: path.length - 1,
        totalLatency: dist.get(destinationId)
    };
}

function normalizeGraph(graph) {
    if (graph instanceof Map) return graph;
    return new Map(Object.entries(graph));
}
