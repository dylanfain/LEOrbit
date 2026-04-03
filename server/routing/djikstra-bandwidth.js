/**
 * Finds the path that maximizes bottleneck bandwidth.
 *
 * Path bandwidth = minimum edge bandwidth along the path.
 * This algorithm chooses the path whose minimum bandwidth is as large as possible.
 *
 * @param {Object} networkState - Output of SatelliteConstellation.exportNetworkState()
 * @param {number} sourceId
 * @param {number} destinationId
 * @returns {Object|null} { path: number[], hops: number, bottleneckBandwidth: number } or null
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
      bottleneckBandwidth: Infinity
    };
  }

  const nodes = collectNodeIds(graph, sourceId, destinationId);

  const bestBandwidth = new Map();
  const parent = new Map();
  const finalized = new Set();
  const heap = new MaxHeap();

  for (const node of nodes) {
    bestBandwidth.set(node, -Infinity);
    parent.set(node, null);
  }

  bestBandwidth.set(sourceId, Infinity);
  heap.push({ node: sourceId, bandwidth: Infinity });

  while (heap.size() > 0) {
    const current = heap.pop();
    const u = current.node;

    if (finalized.has(u)) continue;
    finalized.add(u);

    if (u === destinationId) break;

    const edges = graph.get(u) || [];
    for (const edge of edges) {
      const v = Number(edge.target);
      if (finalized.has(v)) continue;

      const edgeBandwidth = getEdgeBandwidth(edge);
      if (!Number.isFinite(edgeBandwidth) || edgeBandwidth < 0) continue;

      const candidateBandwidth = Math.min(bestBandwidth.get(u), edgeBandwidth);

      if (candidateBandwidth > bestBandwidth.get(v)) {
        bestBandwidth.set(v, candidateBandwidth);
        parent.set(v, u);
        heap.push({ node: v, bandwidth: candidateBandwidth });
      }
    }
  }

  const finalBandwidth = bestBandwidth.get(destinationId);
  if (!Number.isFinite(finalBandwidth) || finalBandwidth === -Infinity) {
    return null;
  }

  const path = buildPath(parent, sourceId, destinationId);
  if (!path) return null;

  return {
    path,
    hops: path.length - 1,
    bottleneckBandwidth: finalBandwidth
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

function buildPath(parent, sourceId, destinationId) {
  const path = [];
  let current = destinationId;

  while (current !== null) {
    path.unshift(current);
    if (current === sourceId) break;
    current = parent.get(current);
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

class MaxHeap {
  constructor() {
    this.data = [];
  }

  size() {
    return this.data.length;
  }

  push(item) {
    this.data.push(item);
    this.#bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;

    const top = this.data[0];
    const last = this.data.pop();

    if (this.data.length > 0) {
      this.data[0] = last;
      this.#bubbleDown(0);
    }

    return top;
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.data[parent].bandwidth >= this.data[index].bandwidth) break;

      [this.data[parent], this.data[index]] = [this.data[index], this.data[parent]];
      index = parent;
    }
  }

  #bubbleDown(index) {
    const length = this.data.length;

    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let largest = index;

      if (
        left < length &&
        this.data[left].bandwidth > this.data[largest].bandwidth
      ) {
        largest = left;
      }

      if (
        right < length &&
        this.data[right].bandwidth > this.data[largest].bandwidth
      ) {
        largest = right;
      }

      if (largest === index) break;

      [this.data[index], this.data[largest]] = [this.data[largest], this.data[index]];
      index = largest;
    }
  }
}