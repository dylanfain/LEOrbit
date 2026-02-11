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
    return { path: [sourceId], hops: 0, cost: 0 };
  }

  // Collect all node ids that appear as keys or as targets
  const nodes = new Set();
  for (const key of Object.keys(graph)) {
    nodes.add(Number(key));
    for (const edge of graph[key] || []) {
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
    prev.set(node, null);
  }
  dist.set(sourceId, 0);

  // Helper: find unvisited node with smallest distance
  function extractMin() {
    let bestNode = null;
    let bestDist = Infinity;

    for (const [node, d] of dist.entries()) {
      if (!visited.has(node) && d < bestDist) {
        bestDist = d;
        bestNode = node;
      }
    }
    return bestNode;
  }

  while (visited.size < nodes.size) {
    const u = extractMin();
    if (u === null) break;              // remaining nodes unreachable
    if (u === destinationId) break;     // found best path to destination

    visited.add(u);

    const neighbors = graph[String(u)] || [];
    for (const edge of neighbors) {
      const v = edge.target;
      if (visited.has(v)) continue;

      // Hop-count weighting: each edge costs 1
      const alt = dist.get(u) + 1;

      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
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
    hops: path.length - 1,
    cost: dist.get(destinationId) // same as hops in this weighting
  };
}

function normalizeGraph(graph) {
  const result = {};

  for (const [nodeId, edges] of Object.entries(graph)) {
    if (!Array.isArray(edges)) {
      throw new Error(`Invalid adjacency list for node ${nodeId}`);
    }

    result[nodeId] = edges.map((edge) => {
      if (edge == null || !Number.isFinite(Number(edge.target))) {
        throw new Error(`Edge for node ${nodeId} is missing a numeric target`);
      }

      return {
        target: Number(edge.target),
        distance: Number(edge.distance) || null,
        latency: Number(edge.latency) || null
      };
    });
  }

  return result;
}
