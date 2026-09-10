/**
 * Finds the path that minimizes bandwidth cost.
 *
 *
 * So higher-bandwidth links are preferred because they contribute less cost.
 *
 * @param {Object} networkState - Output of SatelliteConstellation.exportNetworkState()
 * @param {number} sourceId
 * @param {number} destinationId
 * @returns {Object|null} { path: number[], hops: number, totalBandwidthCost: number } or null
 */
export function widestPathBandwidth(networkState, sourceId, destinationId) {
  if (!Number.isFinite(sourceId) || !Number.isFinite(destinationId)) {
    throw new Error("sourceId and destinationId must be finite numbers");
  }

  if (!networkState || typeof networkState.graph !== "object") {
    throw new Error("Invalid networkState: missing graph");
  }

  const graph = normalizeGraph(networkState.graph);

  if (sourceId === destinationId) {
    return {
      path: [sourceId],
      hops: 0,
      totalBandwidthCost: 0
    };
  }

  const nodes = collectNodeIds(graph, sourceId, destinationId);

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
    const u = current.node;
    const currentCost = current.cost;

    if (visited.has(u)) continue;
    if (currentCost > dist.get(u)) continue;

    visited.add(u);

    if (u === destinationId) break;

    const edges = graph.get(u) || [];
    for (const edge of edges) {
      const v = Number(edge.target);
      if (visited.has(v)) continue;

      const edgeBandwidth = getEdgeBandwidth(edge);
      if (!Number.isFinite(edgeBandwidth) || edgeBandwidth <= 0) continue;

      const edgeCost = 1 / edgeBandwidth;
      const newCost = dist.get(u) + edgeCost;

      if (newCost < dist.get(v)) {
        dist.set(v, newCost);
        prev.set(v, u);
        heap.push({ node: v, cost: newCost });
      }
    }
  }

  if (!Number.isFinite(dist.get(destinationId))) {
    return null;
  }

  const path = buildPath(prev, sourceId, destinationId);
  if (!path) return null;

  return {
    path,
    hops: path.length - 1,
    totalBandwidthCost: Number(dist.get(destinationId).toFixed(6))
  };
}

function collectNodeIds(graph, sourceId, destinationId) {
  const nodes = new Set([sourceId, destinationId]);

  for (const [nodeId, edges] of graph.entries()) {
    nodes.add(Number(nodeId));
    for (const edge of edges || []) {
      nodes.add(Number(edge.target));
    }
  }

  return nodes;
}

function buildPath(prev, sourceId, destinationId) {
  const path = [];
  let current = destinationId;

  while (current !== null) {
    path.unshift(current);
    if (current === sourceId) break;
    current = prev.get(current);
  }

  return path[0] === sourceId ? path : null;
}

function getEdgeBandwidth(edge) {
  if ("bandwidth" in edge && Number.isFinite(Number(edge.bandwidth))) {
    return Number(edge.bandwidth);
  }

  // Default bandwidth based on distance (closer = higher bandwidth)
  // Max distance ~5000km, so bandwidth from 100 to 10 Mbps
  const distance = edge.distance || 5000;
  return Math.max(10, 100 - (distance / 50));
}

function normalizeGraph(graph) {
  if (graph instanceof Map) {
    return graph;
  }

  const normalized = new Map();

  for (const [nodeId, edges] of Object.entries(graph)) {
    normalized.set(
      Number(nodeId),
      (edges || []).map((edge) => ({
        target: Number(edge.target),
        distance: Number(edge.distance) || null,
        latency: Number(edge.latency) || null,
        bandwidth: getEdgeBandwidth(edge)
      }))
    );
  }

  return normalized;
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