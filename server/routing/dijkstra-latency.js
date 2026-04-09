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
    const heap = new MinHeap();

    for (const node of nodes) {
        dist.set(node, Infinity);
        prev.set(node, null);
    }
    dist.set(sourceId, 0);
    heap.push({ node: sourceId, cost: 0 });

    while (heap.size() > 0) {
        const current = heap.pop();
        const currentNode = current.node;
        const currentCost = current.cost;

        if (visited.has(currentNode)) continue;
        if (currentCost > dist.get(currentNode)) continue;
        if (currentNode === destinationId) {
            break; // Found shortest path
        }

        visited.add(currentNode);

        // Relax edges - use latency instead of hop count
        const edges = graph.get(currentNode) || [];
        for (const edge of edges) {
            const neighbor = edge.target;
            if (visited.has(neighbor)) continue;

            const latency = edge.latency || 0;
            const newDist = dist.get(currentNode) + latency;

            if (newDist < dist.get(neighbor)) {
                dist.set(neighbor, newDist);
                prev.set(neighbor, currentNode);
                heap.push({ node: neighbor, cost: newDist });
            }
        }
    }

    if (!Number.isFinite(dist.get(destinationId))) {
        return null; // No path found
    }

    const path = [];
    let current = destinationId;
    while (current !== null) {
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

    return new Map(
        Object.entries(graph).map(([nodeId, edges]) => [
            Number(nodeId),
            (edges || []).map((edge) => ({
                ...edge,
                target: Number(edge.target)
            }))
        ])
    );
}

class MinHeap {
    constructor() {
        this.data = [];
    }

    size() {
        return this.data.length;
    }

    push(item) {
        this.data.push(item);
        this.bubbleUp(this.data.length - 1);
    }

    pop() {
        if (this.data.length === 0) return null;

        const min = this.data[0];
        const last = this.data.pop();

        if (this.data.length > 0) {
            this.data[0] = last;
            this.bubbleDown(0);
        }

        return min;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.data[parent].cost <= this.data[index].cost) break;

            [this.data[parent], this.data[index]] = [this.data[index], this.data[parent]];
            index = parent;
        }
    }

    bubbleDown(index) {
        const length = this.data.length;

        while (true) {
            const left = index * 2 + 1;
            const right = index * 2 + 2;
            let smallest = index;

            if (left < length && this.data[left].cost < this.data[smallest].cost) {
                smallest = left;
            }

            if (right < length && this.data[right].cost < this.data[smallest].cost) {
                smallest = right;
            }

            if (smallest === index) break;

            [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
            index = smallest;
        }
    }
}
