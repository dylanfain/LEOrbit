/**
 * @param {Object} networkState - Output of SatelliteConstellation.exportNetworkState()
 * @param {number} sourceId
 * @param {number} destinationId
 * @returns {Object|null} { path: number[], hops: number, cost: number } or null if no path
 */
export function dijkstraHopShortestPath(networkState, sourceId, destinationId) {
  if (!Number.isFinite(sourceId) || !Number.isFinite(destinationId)) {
    throw new Error("sourceId and destinationId must be finite numbers");
  }

  if (!networkState || typeof networkState.graph !== "object") {
    throw new Error("Invalid networkState: missing graph");
  }

  const graph = normalizeGraph(networkState.graph);

  // Edge case
  if (sourceId === destinationId) {
    return { path: [sourceId], satelliteHops: 0, totalHops: 2, cost: 0 };
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
    const u = current.node;
    const uCost = current.cost;

    if (visited.has(u)) continue;
    if (uCost > dist.get(u)) continue;

    visited.add(u);
    if (u === destinationId) break;     // found best path to destination

    const neighbors = graph.get(Number(u)) || [];
    for (const edge of neighbors) {
      const v = edge.target;
      if (visited.has(v)) continue;

      // Hop-count weighting: each edge costs 1
      const alt = dist.get(u) + 1;

      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
        heap.push({ node: v, cost: alt });
      }
    }
  }

  if (!Number.isFinite(dist.get(destinationId))) {
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
    satelliteHops: path.length - 1,
    totalHops: path.length + 1,
    cost: dist.get(destinationId)
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
          latency: Number(edge.latency) || null
        };
      })
    );
  }

  return result;
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
      this.swap(index, parent);
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

      this.swap(index, smallest);
      index = smallest;
    }
  }

  swap(i, j) {
    [this.data[i], this.data[j]] = [this.data[j], this.data[i]];
  }
}