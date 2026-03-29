/**
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

  // Edge case
  if (sourceId === destinationId) {
    return {
      path: [sourceId],
      hops: 0,
      bottleneckBandwidth: Infinity
    };
  }

  // Collect all node ids that appear as keys or targets
  const nodes = new Set();
  for (const [key, edges] of graph.entries()) {
    nodes.add(Number(key));
    for (const edge of edges || []) {
      nodes.add(edge.target);
    }
  }
  nodes.add(sourceId);
  nodes.add(destinationId);

  // widest[node] = best bottleneck bandwidth from source to node
  const widest = new Map();
  const prev = new Map();
  const visited = new Set();
  const heap = new MaxHeap();

  for (const node of nodes) {
    widest.set(node, 0);
    prev.set(node, null);
  }

  widest.set(sourceId, Infinity);
  heap.push({ node: sourceId, bandwidth: Infinity });

  while (heap.size() > 0) {
    const current = heap.pop();
    const u = current.node;
    const uBandwidth = current.bandwidth;

    if (visited.has(u)) continue;
    if (uBandwidth < widest.get(u)) continue;

    visited.add(u);

    if (u === destinationId) break;

    const neighbors = graph.get(Number(u)) || [];
    for (const edge of neighbors) {
      const v = edge.target;
      if (visited.has(v)) continue;

      const edgeBandwidth = edge.bandwidth ?? 0;

      // Bottleneck for this path is min(current path bottleneck, edge bandwidth)
      const candidateBandwidth = Math.min(widest.get(u), edgeBandwidth);

      if (candidateBandwidth > widest.get(v)) {
        widest.set(v, candidateBandwidth);
        prev.set(v, u);
        heap.push({ node: v, bandwidth: candidateBandwidth });
      }
    }
  }

  if (widest.get(destinationId) === 0) {
    return null; // No path found
  }

  // Reconstruct path
  const path = [];
  let curr = destinationId;
  while (curr !== null) {
    path.unshift(curr);
    curr = prev.get(curr);
  }

  if (path[0] !== sourceId) {
    return null;
  }

  return {
    path,
    hops: path.length - 1,
    bottleneckBandwidth: widest.get(destinationId)
  };
}

function normalizeGraph(graph) {
  if (graph instanceof Map) {
    return graph;
  }

  const result = new Map();

  for (const [nodeId, edges] of Object.entries(graph)) {
    if (!Array.isArray(edges)) {
      throw new Error(`Invalid adjacency list for node ${nodeId}`);
    }

    result.set(
      Number(nodeId),
      edges.map((edge) => {
        if (edge == null || !Number.isFinite(Number(edge.target))) {
          throw new Error(`Edge for node ${nodeId} is missing a numeric target`);
        }

        return {
          target: Number(edge.target),
          distance: Number(edge.distance) || null,
          latency: Number(edge.latency) || null,
          bandwidth: Number(edge.bandwidth) || 0
        };
      })
    );
  }

  return result;
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
    this.bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;

    const max = this.data[0];
    const last = this.data.pop();

    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }

    return max;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.data[parent].bandwidth >= this.data[index].bandwidth) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  bubbleDown(index) {
    const length = this.data.length;

    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let largest = index;

      if (left < length && this.data[left].bandwidth > this.data[largest].bandwidth) {
        largest = left;
      }
      if (right < length && this.data[right].bandwidth > this.data[largest].bandwidth) {
        largest = right;
      }
      if (largest === index) break;

      this.swap(index, largest);
      index = largest;
    }
  }

  swap(i, j) {
    [this.data[i], this.data[j]] = [this.data[j], this.data[i]];
  }
}