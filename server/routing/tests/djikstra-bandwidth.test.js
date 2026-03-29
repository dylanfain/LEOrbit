/**
 * Test Suite for widestPathBandwidth
 *
 * Tests the bandwidth-aware widest path routing implementation for satellite networks.
 * Covers normal operations, edge cases, error handling, and graph topology variations.
 */

import { widestPathBandwidth } from '../dijkstra-bandwidth.js';

/**
 * Helper function to create a mock network state
 */
function createMockNetworkState(graph) {
  return {
    timestamp: new Date(),
    satellites: [],
    graph: graph
  };
}

/**
 * Test Suite
 */
describe('widestPathBandwidth', () => {

  // ========== EDGE CASES ==========

  describe('Edge Cases', () => {

    test('source and destination are the same', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);

      const result = widestPathBandwidth(networkState, 0, 0);

      expect(result).toEqual({
        path: [0],
        hops: 0,
        bottleneckBandwidth: Infinity
      });
    });

    test('invalid networkState - null', () => {
      expect(() => {
        widestPathBandwidth(null, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });

    test('invalid networkState - missing graph property', () => {
      expect(() => {
        widestPathBandwidth({ timestamp: new Date() }, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });

    test('empty graph', () => {
      const networkState = createMockNetworkState({});
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeNull();
    });

    test('source node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33, bandwidth: 50 }],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 999, 1);

      expect(result).toBeNull();
    });

    test('destination node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33, bandwidth: 50 }],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 1, 999);

      expect(result).toBeNull();
    });

    test('disconnected graph - no path exists', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 40 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 40 }],
        2: [{ target: 3, distance: 100, latency: 0.33, bandwidth: 60 }],
        3: [{ target: 2, distance: 100, latency: 0.33, bandwidth: 60 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toBeNull();
    });

    test('single node graph', () => {
      const graph = {
        0: []
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 0);

      expect(result).toEqual({
        path: [0],
        hops: 0,
        bottleneckBandwidth: Infinity
      });
    });
  });

  // ========== SIMPLE PATHS ==========

  describe('Simple Paths', () => {

    test('direct connection between two nodes', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 75 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 75 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toEqual({
        path: [0, 1],
        hops: 1,
        bottleneckBandwidth: 75
      });
    });

    test('linear chain A -> B -> C', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 80 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 80 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        bottleneckBandwidth: 50
      });
    });

    test('reverse path in linear chain C -> B -> A', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 80 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 80 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 2, 0);

      expect(result).toEqual({
        path: [2, 1, 0],
        hops: 2,
        bottleneckBandwidth: 50
      });
    });
  });

  // ========== BANDWIDTH-SPECIFIC BEHAVIOR ==========

  describe('Bandwidth Optimization Behavior', () => {

    test('chooses path with larger bottleneck bandwidth over fewer hops', () => {
      // Path 0 -> 3 has bottleneck 20
      // Path 0 -> 1 -> 2 -> 3 has bottleneck 50
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 3, distance: 500, latency: 1.67, bandwidth: 20 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 60 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        3: [
          { target: 0, distance: 500, latency: 1.67, bandwidth: 20 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toEqual({
        path: [0, 1, 2, 3],
        hops: 3,
        bottleneckBandwidth: 50
      });
    });

    test('chooses direct path when it has the best bottleneck bandwidth', () => {
      // Direct path bottleneck = 90
      // Alternate path bottleneck = 40
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 3, distance: 300, latency: 1.0, bandwidth: 90 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 40 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 40 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        3: [
          { target: 0, distance: 300, latency: 1.0, bandwidth: 90 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toEqual({
        path: [0, 3],
        hops: 1,
        bottleneckBandwidth: 90
      });
    });

    test('diamond topology - multiple paths with same bottleneck bandwidth', () => {
      // 0 -> 1 -> 3 and 0 -> 2 -> 3 both have bottleneck 50
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 80 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 80 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        3: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 50 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toBeDefined();
      expect(result.path[0]).toBe(0);
      expect(result.path[result.path.length - 1]).toBe(3);
      expect(result.hops).toBe(2);
      expect(result.bottleneckBandwidth).toBe(50);
      expect([1, 2]).toContain(result.path[1]);
    });

    test('returns null when every possible route contains zero bandwidth links', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 0 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 0 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 0 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 0 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toBeNull();
    });
  });

  // ========== COMPLEX TOPOLOGIES ==========

  describe('Complex Topologies', () => {

    test('triangle topology - finds path with highest bottleneck bandwidth', () => {
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 40 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 30 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 40 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 40 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 30 },
          { target: 1, distance: 100, latency: 0.33, bandwidth: 40 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      // Direct path bottleneck = 30
      // Indirect path 0 -> 1 -> 2 bottleneck = 40
      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        bottleneckBandwidth: 40
      });
    });

    test('star topology - hub and spoke', () => {
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 4, distance: 100, latency: 0.33, bandwidth: 60 }
        ],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 60 }],
        2: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 60 }],
        3: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 60 }],
        4: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 60 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 1, 4);

      expect(result).toEqual({
        path: [1, 0, 4],
        hops: 2,
        bottleneckBandwidth: 60
      });
    });

    test('long chain - bottleneck is smallest edge in path', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 90 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 90 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 80 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 80 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 70 }
        ],
        3: [
          { target: 2, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 4, distance: 100, latency: 0.33, bandwidth: 60 }
        ],
        4: [
          { target: 3, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 5, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        5: [{ target: 4, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 5);

      expect(result).toEqual({
        path: [0, 1, 2, 3, 4, 5],
        hops: 5,
        bottleneckBandwidth: 50
      });
    });
  });

  // ========== GRAPH KEY FORMATS ==========

  describe('Graph Key Format Handling', () => {

    test('handles numeric keys', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 75 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 75 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });

    test('handles string keys', () => {
      const graph = {
        '0': [{ target: 1, distance: 100, latency: 0.33, bandwidth: 75 }],
        '1': [{ target: 0, distance: 100, latency: 0.33, bandwidth: 75 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });

    test('handles mixed key formats', () => {
      const graph = {
        '0': [{ target: 1, distance: 100, latency: 0.33, bandwidth: 75 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 75 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });
  });

  // ========== REALISTIC SATELLITE SCENARIOS ==========

  describe('Realistic Satellite Network Scenarios', () => {

    test('simulates LEO satellite mesh - chooses route with strongest bottleneck', () => {
      const graph = {
        0: [
          { target: 1, distance: 2000, latency: 6.67, bandwidth: 45 },
          { target: 3, distance: 2500, latency: 8.33, bandwidth: 70 }
        ],
        1: [
          { target: 0, distance: 2000, latency: 6.67, bandwidth: 45 },
          { target: 2, distance: 1800, latency: 6.0, bandwidth: 40 }
        ],
        2: [
          { target: 1, distance: 1800, latency: 6.0, bandwidth: 40 },
          { target: 4, distance: 2200, latency: 7.33, bandwidth: 35 }
        ],
        3: [
          { target: 0, distance: 2500, latency: 8.33, bandwidth: 70 },
          { target: 4, distance: 1900, latency: 6.33, bandwidth: 65 }
        ],
        4: [
          { target: 2, distance: 2200, latency: 7.33, bandwidth: 35 },
          { target: 3, distance: 1900, latency: 6.33, bandwidth: 65 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 4);

      // Path 0 -> 1 -> 2 -> 4 bottleneck = 35
      // Path 0 -> 3 -> 4 bottleneck = 65
      expect(result).toEqual({
        path: [0, 3, 4],
        hops: 2,
        bottleneckBandwidth: 65
      });
    });

    test('satellite with no neighbors (isolated)', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }],
        1: [{ target: 0, distance: 100, latency: 0.33, bandwidth: 50 }],
        2: []
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toBeNull();
    });

    test('complete graph - chooses direct highest-bandwidth route when optimal', () => {
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 95 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 60 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 55 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 1, distance: 100, latency: 0.33, bandwidth: 50 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 65 }
        ],
        3: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 95 },
          { target: 1, distance: 100, latency: 0.33, bandwidth: 55 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 65 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toEqual({
        path: [0, 3],
        hops: 1,
        bottleneckBandwidth: 95
      });
    });
  });

  // ========== PATH VALIDATION ==========

  describe('Path Validation', () => {

    test('returned path is continuous and valid', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 90 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 90 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 70 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33, bandwidth: 70 },
          { target: 3, distance: 100, latency: 0.33, bandwidth: 60 }
        ],
        3: [{ target: 2, distance: 100, latency: 0.33, bandwidth: 60 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toBeDefined();

      for (let i = 0; i < result.path.length - 1; i++) {
        const current = result.path[i];
        const next = result.path[i + 1];

        const neighbors = graph[current] || graph[String(current)] || [];
        const hasEdge = neighbors.some(edge => edge.target === next);

        expect(hasEdge).toBe(true);
      }
    });

    test('hop count matches path length', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 80 }],
        1: [
          { target: 0, distance: 100, latency: 0.33, bandwidth: 80 },
          { target: 2, distance: 100, latency: 0.33, bandwidth: 50 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33, bandwidth: 50 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result.hops).toBe(result.path.length - 1);
      expect(result.bottleneckBandwidth).toBe(50);
    });
  });
});