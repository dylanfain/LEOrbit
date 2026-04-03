/**
 * Test Suite for widestPathBandwidth
 *
 * Tests the widest path / maximum bottleneck bandwidth algorithm
 * for satellite network routing.
 */

import { widestPathBandwidth } from '../widest-path-bandwidth.js';

/**
 * Helper function to create a mock network state
 */
function createMockNetworkState(graph) {
  return {
    timestamp: new Date(),
    satellites: [],
    graph
  };
}

describe('widestPathBandwidth', () => {
  // ========== EDGE CASES ==========

  describe('Edge Cases', () => {
    test('source and destination are the same', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 50, distance: 100, latency: 0.33 }],
        1: [{ target: 0, bandwidth: 50, distance: 100, latency: 0.33 }]
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

    test('source node not connected to graph', () => {
      const graph = {
        1: [{ target: 2, bandwidth: 30 }],
        2: [{ target: 1, bandwidth: 30 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 999, 1);

      expect(result).toBeNull();
    });

    test('destination node not connected to graph', () => {
      const graph = {
        1: [{ target: 2, bandwidth: 30 }],
        2: [{ target: 1, bandwidth: 30 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 1, 999);

      expect(result).toBeNull();
    });

    test('disconnected graph - no path exists', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 40 }],
        1: [{ target: 0, bandwidth: 40 }],
        2: [{ target: 3, bandwidth: 25 }],
        3: [{ target: 2, bandwidth: 25 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toBeNull();
    });

    test('single node graph', () => {
      const graph = { 0: [] };
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
        0: [{ target: 1, bandwidth: 80 }],
        1: [{ target: 0, bandwidth: 80 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toEqual({
        path: [0, 1],
        hops: 1,
        bottleneckBandwidth: 80
      });
    });

    test('linear chain uses minimum edge as bottleneck', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 100 }],
        1: [
          { target: 0, bandwidth: 100 },
          { target: 2, bandwidth: 60 }
        ],
        2: [{ target: 1, bandwidth: 60 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        bottleneckBandwidth: 60
      });
    });

    test('reverse path in linear chain', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 100 }],
        1: [
          { target: 0, bandwidth: 100 },
          { target: 2, bandwidth: 60 }
        ],
        2: [{ target: 1, bandwidth: 60 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 2, 0);

      expect(result).toEqual({
        path: [2, 1, 0],
        hops: 2,
        bottleneckBandwidth: 60
      });
    });
  });

  // ========== BANDWIDTH-SPECIFIC BEHAVIOR ==========

  describe('Bandwidth Optimization', () => {
    test('chooses path with larger bottleneck bandwidth', () => {
      // Path 1: 0 -> 1 -> 3 has bottleneck min(90, 50) = 50
      // Path 2: 0 -> 2 -> 3 has bottleneck min(70, 70) = 70
      // Should choose Path 2
      const graph = {
        0: [
          { target: 1, bandwidth: 90 },
          { target: 2, bandwidth: 70 }
        ],
        1: [
          { target: 0, bandwidth: 90 },
          { target: 3, bandwidth: 50 }
        ],
        2: [
          { target: 0, bandwidth: 70 },
          { target: 3, bandwidth: 70 }
        ],
        3: [
          { target: 1, bandwidth: 50 },
          { target: 2, bandwidth: 70 }
        ]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toEqual({
        path: [0, 2, 3],
        hops: 2,
        bottleneckBandwidth: 70
      });
    });

    test('prefers multi-hop path if bottleneck is better than direct edge', () => {
      // Direct: 0 -> 3 = 20
      // Multi-hop: 0 -> 1 -> 2 -> 3 = min(80, 75, 70) = 70
      const graph = {
        0: [
          { target: 1, bandwidth: 80 },
          { target: 3, bandwidth: 20 }
        ],
        1: [
          { target: 0, bandwidth: 80 },
          { target: 2, bandwidth: 75 }
        ],
        2: [
          { target: 1, bandwidth: 75 },
          { target: 3, bandwidth: 70 }
        ],
        3: [
          { target: 0, bandwidth: 20 },
          { target: 2, bandwidth: 70 }
        ]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toEqual({
        path: [0, 1, 2, 3],
        hops: 3,
        bottleneckBandwidth: 70
      });
    });

    test('direct path wins when it has highest bandwidth', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 40 },
          { target: 2, bandwidth: 95 }
        ],
        1: [
          { target: 0, bandwidth: 40 },
          { target: 2, bandwidth: 45 }
        ],
        2: [
          { target: 0, bandwidth: 95 },
          { target: 1, bandwidth: 45 }
        ]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toEqual({
        path: [0, 2],
        hops: 1,
        bottleneckBandwidth: 95
      });
    });

    test('handles equal-bandwidth alternative paths', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 50 },
          { target: 2, bandwidth: 50 }
        ],
        1: [
          { target: 0, bandwidth: 50 },
          { target: 3, bandwidth: 50 }
        ],
        2: [
          { target: 0, bandwidth: 50 },
          { target: 3, bandwidth: 50 }
        ],
        3: [
          { target: 1, bandwidth: 50 },
          { target: 2, bandwidth: 50 }
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
  });

  // ========== COMPLEX TOPOLOGIES ==========

  describe('Complex Topologies', () => {
    test('triangle topology - chooses highest bandwidth route', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 100 },
          { target: 2, bandwidth: 40 }
        ],
        1: [
          { target: 0, bandwidth: 100 },
          { target: 2, bandwidth: 90 }
        ],
        2: [
          { target: 0, bandwidth: 40 },
          { target: 1, bandwidth: 90 }
        ]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      // direct = 40, through 1 = min(100, 90) = 90
      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        bottleneckBandwidth: 90
      });
    });

    test('star topology - hub and spoke', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 60 },
          { target: 2, bandwidth: 70 },
          { target: 3, bandwidth: 80 },
          { target: 4, bandwidth: 65 }
        ],
        1: [{ target: 0, bandwidth: 60 }],
        2: [{ target: 0, bandwidth: 70 }],
        3: [{ target: 0, bandwidth: 80 }],
        4: [{ target: 0, bandwidth: 65 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 1, 4);

      expect(result).toEqual({
        path: [1, 0, 4],
        hops: 2,
        bottleneckBandwidth: 60
      });
    });

    test('long chain - bottleneck comes from smallest edge', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 100 }],
        1: [
          { target: 0, bandwidth: 100 },
          { target: 2, bandwidth: 90 }
        ],
        2: [
          { target: 1, bandwidth: 90 },
          { target: 3, bandwidth: 85 }
        ],
        3: [
          { target: 2, bandwidth: 85 },
          { target: 4, bandwidth: 50 }
        ],
        4: [
          { target: 3, bandwidth: 50 },
          { target: 5, bandwidth: 75 }
        ],
        5: [{ target: 4, bandwidth: 75 }]
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
        0: [{ target: 1, bandwidth: 55 }],
        1: [{ target: 0, bandwidth: 55 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
      expect(result.bottleneckBandwidth).toBe(55);
    });

    test('handles string keys', () => {
      const graph = {
        '0': [{ target: 1, bandwidth: 55 }],
        '1': [{ target: 0, bandwidth: 55 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
      expect(result.bottleneckBandwidth).toBe(55);
    });

    test('handles mixed key formats', () => {
      const graph = {
        '0': [{ target: 1, bandwidth: 55 }],
        1: [{ target: 0, bandwidth: 55 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 1);

      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
      expect(result.bottleneckBandwidth).toBe(55);
    });
  });

  // ========== SATELLITE NETWORK SCENARIOS ==========

  describe('Realistic Satellite Network Scenarios', () => {
    test('simulates LEO mesh with varying link capacities', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 60, distance: 2000, latency: 6.67 },
          { target: 3, bandwidth: 85, distance: 2500, latency: 8.33 }
        ],
        1: [
          { target: 0, bandwidth: 60, distance: 2000, latency: 6.67 },
          { target: 2, bandwidth: 55, distance: 1800, latency: 6.0 }
        ],
        2: [
          { target: 1, bandwidth: 55, distance: 1800, latency: 6.0 },
          { target: 4, bandwidth: 50, distance: 2200, latency: 7.33 }
        ],
        3: [
          { target: 0, bandwidth: 85, distance: 2500, latency: 8.33 },
          { target: 4, bandwidth: 80, distance: 1900, latency: 6.33 }
        ],
        4: [
          { target: 2, bandwidth: 50, distance: 2200, latency: 7.33 },
          { target: 3, bandwidth: 80, distance: 1900, latency: 6.33 }
        ]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 4);

      // 0->1->2->4 bottleneck = 50
      // 0->3->4 bottleneck = 80
      expect(result).toEqual({
        path: [0, 3, 4],
        hops: 2,
        bottleneckBandwidth: 80
      });
    });

    test('isolated satellite returns null', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 40 }],
        1: [{ target: 0, bandwidth: 40 }],
        2: []
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result).toBeNull();
    });

    test('complete graph picks direct highest-capacity edge when appropriate', () => {
      const graph = {
        0: [
          { target: 1, bandwidth: 50 },
          { target: 2, bandwidth: 60 },
          { target: 3, bandwidth: 95 }
        ],
        1: [
          { target: 0, bandwidth: 50 },
          { target: 2, bandwidth: 55 },
          { target: 3, bandwidth: 65 }
        ],
        2: [
          { target: 0, bandwidth: 60 },
          { target: 1, bandwidth: 55 },
          { target: 3, bandwidth: 70 }
        ],
        3: [
          { target: 0, bandwidth: 95 },
          { target: 1, bandwidth: 65 },
          { target: 2, bandwidth: 70 }
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
        0: [{ target: 1, bandwidth: 90 }],
        1: [
          { target: 0, bandwidth: 90 },
          { target: 2, bandwidth: 85 }
        ],
        2: [
          { target: 1, bandwidth: 85 },
          { target: 3, bandwidth: 80 }
        ],
        3: [{ target: 2, bandwidth: 80 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 3);

      expect(result).toBeDefined();

      for (let i = 0; i < result.path.length - 1; i++) {
        const current = result.path[i];
        const next = result.path[i + 1];

        const neighbors = graph[current] || graph[String(current)] || [];
        const hasEdge = neighbors.some((edge) => edge.target === next);

        expect(hasEdge).toBe(true);
      }
    });

    test('hop count matches path length', () => {
      const graph = {
        0: [{ target: 1, bandwidth: 90 }],
        1: [
          { target: 0, bandwidth: 90 },
          { target: 2, bandwidth: 75 }
        ],
        2: [{ target: 1, bandwidth: 75 }]
      };

      const networkState = createMockNetworkState(graph);
      const result = widestPathBandwidth(networkState, 0, 2);

      expect(result.hops).toBe(result.path.length - 1);
      expect(result.bottleneckBandwidth).toBe(75);
    });
  });
});