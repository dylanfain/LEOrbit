/**
 * Test Suite for dijkstraHopShortestPath
 * 
 * Tests the Dijkstra shortest path algorithm implementation for satellite network routing.
 * Covers normal operations, edge cases, error handling, and graph topology variations.
 */

import { dijkstraHopShortestPath } from '../Djikstrahop.js';

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
describe('dijkstraHopShortestPath', () => {
  
  // ========== EDGE CASES ==========
  
  describe('Edge Cases', () => {
    
    test('source and destination are the same', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      
      const result = dijkstraHopShortestPath(networkState, 0, 0);
      
      expect(result).toEqual({
        path: [0],
        hops: 0,
        cost: 0
      });
    });
    
    test('invalid networkState - null', () => {
      expect(() => {
        dijkstraHopShortestPath(null, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });
    
    test('invalid networkState - missing graph property', () => {
      expect(() => {
        dijkstraHopShortestPath({ timestamp: new Date() }, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });
    
    test('empty graph', () => {
      const networkState = createMockNetworkState({});
      const result = dijkstraHopShortestPath(networkState, 0, 1);
      
      expect(result).toBeNull();
    });
    
    test('source node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33 }],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 999, 1);
      
      expect(result).toBeNull();
    });
    
    test('destination node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33 }],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 1, 999);
      
      expect(result).toBeNull();
    });
    
    test('disconnected graph - no path exists', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }],
        2: [{ target: 3, distance: 100, latency: 0.33 }],
        3: [{ target: 2, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 3);
      
      expect(result).toBeNull();
    });
    
    test('single node graph', () => {
      const graph = {
        0: []
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 0);
      
      expect(result).toEqual({
        path: [0],
        hops: 0,
        cost: 0
      });
    });
  });
  
  // ========== SIMPLE PATHS ==========
  
  describe('Simple Paths', () => {
    
    test('direct connection between two nodes', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 1);
      
      expect(result).toEqual({
        path: [0, 1],
        hops: 1,
        cost: 1
      });
    });
    
    test('linear chain A -> B -> C', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 2);
      
      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        cost: 2
      });
    });
    
    test('reverse path in linear chain C -> B -> A', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 2, 0);
      
      expect(result).toEqual({
        path: [2, 1, 0],
        hops: 2,
        cost: 2
      });
    });
  });
  
  // ========== COMPLEX TOPOLOGIES ==========
  
  describe('Complex Topologies', () => {
    
    test('triangle topology - finds shortest path', () => {
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 1, distance: 100, latency: 0.33 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 2);
      
      // Should take direct path 0 -> 2
      expect(result).toEqual({
        path: [0, 2],
        hops: 1,
        cost: 1
      });
    });
    
    test('diamond topology - multiple paths of same length', () => {
      // 0 -> 1 -> 3
      // 0 -> 2 -> 3
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        3: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 3);
      
      expect(result).toBeDefined();
      expect(result.path[0]).toBe(0);
      expect(result.path[result.path.length - 1]).toBe(3);
      expect(result.hops).toBe(2);
      expect(result.cost).toBe(2);
      // Path could be [0, 1, 3] or [0, 2, 3]
      expect([1, 2]).toContain(result.path[1]);
    });
    
    test('detour graph - chooses shorter hop count over distance', () => {
      // Direct long path: 0 -> 3 (1 hop)
      // Shorter distance but more hops: 0 -> 1 -> 2 -> 3 (3 hops)
      const graph = {
        0: [
          { target: 1, distance: 10, latency: 0.03 },
          { target: 3, distance: 1000, latency: 3.33 }
        ],
        1: [
          { target: 0, distance: 10, latency: 0.03 },
          { target: 2, distance: 10, latency: 0.03 }
        ],
        2: [
          { target: 1, distance: 10, latency: 0.03 },
          { target: 3, distance: 10, latency: 0.03 }
        ],
        3: [
          { target: 0, distance: 1000, latency: 3.33 },
          { target: 2, distance: 10, latency: 0.03 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 3);
      
      // Should choose direct path because hop-count is what matters
      expect(result).toEqual({
        path: [0, 3],
        hops: 1,
        cost: 1
      });
    });
    
    test('star topology - hub and spoke', () => {
      // Node 0 is hub, nodes 1-4 are spokes
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 },
          { target: 4, distance: 100, latency: 0.33 }
        ],
        1: [{ target: 0, distance: 100, latency: 0.33 }],
        2: [{ target: 0, distance: 100, latency: 0.33 }],
        3: [{ target: 0, distance: 100, latency: 0.33 }],
        4: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 1, 4);
      
      // Must go through hub: 1 -> 0 -> 4
      expect(result).toEqual({
        path: [1, 0, 4],
        hops: 2,
        cost: 2
      });
    });
    
    test('long chain - 6 nodes', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        3: [
          { target: 2, distance: 100, latency: 0.33 },
          { target: 4, distance: 100, latency: 0.33 }
        ],
        4: [
          { target: 3, distance: 100, latency: 0.33 },
          { target: 5, distance: 100, latency: 0.33 }
        ],
        5: [{ target: 4, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 5);
      
      expect(result).toEqual({
        path: [0, 1, 2, 3, 4, 5],
        hops: 5,
        cost: 5
      });
    });
  });
  
  // ========== GRAPH KEY FORMATS ==========
  
  describe('Graph Key Format Handling', () => {
    
    test('handles numeric keys', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 1);
      
      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });
    
    test('handles string keys', () => {
      const graph = {
        '0': [{ target: 1, distance: 100, latency: 0.33 }],
        '1': [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 1);
      
      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });
    
    test('handles mixed key formats', () => {
      const graph = {
        '0': [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 1);
      
      expect(result).toBeDefined();
      expect(result.path).toEqual([0, 1]);
    });
  });
  
  // ========== REALISTIC SATELLITE SCENARIOS ==========
  
  describe('Realistic Satellite Network Scenarios', () => {
    
    test('simulates LEO satellite mesh - partial connectivity', () => {
      // Simulates a small constellation where not all satellites can see each other
      const graph = {
        0: [
          { target: 1, distance: 2000, latency: 6.67 },
          { target: 3, distance: 2500, latency: 8.33 }
        ],
        1: [
          { target: 0, distance: 2000, latency: 6.67 },
          { target: 2, distance: 1800, latency: 6.0 }
        ],
        2: [
          { target: 1, distance: 1800, latency: 6.0 },
          { target: 4, distance: 2200, latency: 7.33 }
        ],
        3: [
          { target: 0, distance: 2500, latency: 8.33 },
          { target: 4, distance: 1900, latency: 6.33 }
        ],
        4: [
          { target: 2, distance: 2200, latency: 7.33 },
          { target: 3, distance: 1900, latency: 6.33 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 4);
      
      expect(result).toBeDefined();
      expect(result.path[0]).toBe(0);
      expect(result.path[result.path.length - 1]).toBe(4);
      expect(result.hops).toBe(2);
      // Path should be [0, 3, 4]
      expect(result.path).toEqual([0, 3, 4]);
    });
    
    test('satellite with no neighbors (isolated)', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }],
        2: [] // Isolated satellite
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 2);
      
      expect(result).toBeNull();
    });
    
    test('complete graph - all satellites visible to each other', () => {
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        2: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 1, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        3: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 1, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 3);
      
      // Should always be direct path in complete graph
      expect(result).toEqual({
        path: [0, 3],
        hops: 1,
        cost: 1
      });
    });
  });
  
  // ========== PATH VALIDATION ==========
  
  describe('Path Validation', () => {
    
    test('returned path is continuous and valid', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [
          { target: 1, distance: 100, latency: 0.33 },
          { target: 3, distance: 100, latency: 0.33 }
        ],
        3: [{ target: 2, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 3);
      
      expect(result).toBeDefined();
      
      // Validate path continuity
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
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [
          { target: 0, distance: 100, latency: 0.33 },
          { target: 2, distance: 100, latency: 0.33 }
        ],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraHopShortestPath(networkState, 0, 2);
      
      expect(result.hops).toBe(result.path.length - 1);
      expect(result.cost).toBe(result.hops);
    });
  });
});