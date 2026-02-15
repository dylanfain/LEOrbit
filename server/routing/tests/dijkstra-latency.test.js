/**
 * Test Suite for dijkstraLatencyShortestPath
 * 
 * Tests the Dijkstra shortest path algorithm implementation for satellite network routing.
 * This version optimizes for minimum latency, not hop count.
 */

import { dijkstraLatencyShortestPath } from '../dijkstra-latency.js';

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
describe('dijkstraLatencyShortestPath', () => {
  
  // ========== EDGE CASES ==========
  
  describe('Edge Cases', () => {
    
    test('source and destination are the same', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 0.33 }],
        1: [{ target: 0, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      
      const result = dijkstraLatencyShortestPath(networkState, 0, 0);
      
      expect(result).toEqual({
        path: [0],
        hops: 0,
        totalLatency: 0
      });
    });
    
    test('invalid networkState - null', () => {
      expect(() => {
        dijkstraLatencyShortestPath(null, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });
    
    test('invalid networkState - missing graph property', () => {
      expect(() => {
        dijkstraLatencyShortestPath({ timestamp: new Date() }, 0, 1);
      }).toThrow('Invalid networkState: missing graph');
    });
    
    test('empty graph', () => {
      const networkState = createMockNetworkState({});
      const result = dijkstraLatencyShortestPath(networkState, 0, 1);
      
      expect(result).toBeNull();
    });
    
    test('source node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33 }],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 999, 1);
      
      expect(result).toBeNull();
    });
    
    test('destination node not in graph', () => {
      const graph = {
        1: [{ target: 2, distance: 100, latency: 0.33 }],
        2: [{ target: 1, distance: 100, latency: 0.33 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 1, 999);
      
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
      const result = dijkstraLatencyShortestPath(networkState, 0, 3);
      
      expect(result).toBeNull();
    });
    
    test('single node graph', () => {
      const graph = {
        0: []
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 0);
      
      expect(result).toEqual({
        path: [0],
        hops: 0,
        totalLatency: 0
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
      const result = dijkstraLatencyShortestPath(networkState, 0, 1);
      
      expect(result).toEqual({
        path: [0, 1],
        hops: 1,
        totalLatency: 0.33
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
      const result = dijkstraLatencyShortestPath(networkState, 0, 2);
      
      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        totalLatency: 0.66
      });
    });
  });
  
  // ========== LATENCY-SPECIFIC TESTS ==========
  
  describe('Latency Optimization', () => {
    
    test('chooses lower latency path over fewer hops', () => {
      // Direct path: 0 -> 2 = 50ms (1 hop)
      // Via 1: 0 -> 1 -> 2 = 10 + 20 = 30ms (2 hops)
      // Should choose the 2-hop path because latency is lower
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 10 },
          { target: 2, distance: 500, latency: 50 }
        ],
        1: [
          { target: 0, distance: 100, latency: 10 },
          { target: 2, distance: 200, latency: 20 }
        ],
        2: [
          { target: 0, distance: 500, latency: 50 },
          { target: 1, distance: 200, latency: 20 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 2);
      
      expect(result).toEqual({
        path: [0, 1, 2],
        hops: 2,
        totalLatency: 30
      });
    });
    
    test('chooses direct path when latency is lower', () => {
      // Direct path: 0 -> 2 = 5ms (1 hop)
      // Via 1: 0 -> 1 -> 2 = 10 + 10 = 20ms (2 hops)
      // Should choose direct path
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 10 },
          { target: 2, distance: 50, latency: 5 }
        ],
        1: [
          { target: 0, distance: 100, latency: 10 },
          { target: 2, distance: 100, latency: 10 }
        ],
        2: [
          { target: 0, distance: 50, latency: 5 },
          { target: 1, distance: 100, latency: 10 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 2);
      
      expect(result).toEqual({
        path: [0, 2],
        hops: 1,
        totalLatency: 5
      });
    });
    
    test('complex graph - finds minimum latency path', () => {
      // Multiple paths from 0 to 3:
      // 0 -> 3 direct = 100ms
      // 0 -> 1 -> 3 = 10 + 50 = 60ms
      // 0 -> 2 -> 3 = 20 + 30 = 50ms  <-- winner
      // 0 -> 1 -> 2 -> 3 = 10 + 15 + 30 = 55ms
      const graph = {
        0: [
          { target: 1, distance: 100, latency: 10 },
          { target: 2, distance: 200, latency: 20 },
          { target: 3, distance: 1000, latency: 100 }
        ],
        1: [
          { target: 0, distance: 100, latency: 10 },
          { target: 2, distance: 150, latency: 15 },
          { target: 3, distance: 500, latency: 50 }
        ],
        2: [
          { target: 0, distance: 200, latency: 20 },
          { target: 1, distance: 150, latency: 15 },
          { target: 3, distance: 300, latency: 30 }
        ],
        3: [
          { target: 0, distance: 1000, latency: 100 },
          { target: 1, distance: 500, latency: 50 },
          { target: 2, distance: 300, latency: 30 }
        ]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 3);
      
      expect(result).toEqual({
        path: [0, 2, 3],
        hops: 2,
        totalLatency: 50
      });
    });
  });
  
  // ========== REALISTIC SATELLITE SCENARIOS ==========
  
  describe('Realistic Satellite Network Scenarios', () => {
    
    test('LEO satellite mesh - optimizes for latency not hops', () => {
      // Satellite 0 to 4:
      // Path via 3: 0 -> 3 -> 4 = 8.33 + 6.33 = 14.66ms (2 hops)
      // Path via 1,2: 0 -> 1 -> 2 -> 4 = 6.67 + 6.0 + 7.33 = 20ms (3 hops)
      // Should choose 0 -> 3 -> 4
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
      const result = dijkstraLatencyShortestPath(networkState, 0, 4);
      
      expect(result.path).toEqual([0, 3, 4]);
      expect(result.hops).toBe(2);
      expect(result.totalLatency).toBeCloseTo(14.66, 1);
    });
  });
  
  // ========== PATH VALIDATION ==========
  
  describe('Path Validation', () => {
    
    test('hop count matches path length', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 10 }],
        1: [
          { target: 0, distance: 100, latency: 10 },
          { target: 2, distance: 100, latency: 20 }
        ],
        2: [{ target: 1, distance: 100, latency: 20 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 2);
      
      expect(result.hops).toBe(result.path.length - 1);
    });
    
    test('totalLatency equals sum of edge latencies', () => {
      const graph = {
        0: [{ target: 1, distance: 100, latency: 10 }],
        1: [
          { target: 0, distance: 100, latency: 10 },
          { target: 2, distance: 100, latency: 20 }
        ],
        2: [{ target: 1, distance: 100, latency: 20 }]
      };
      const networkState = createMockNetworkState(graph);
      const result = dijkstraLatencyShortestPath(networkState, 0, 2);
      
      // Path is 0 -> 1 -> 2, latencies are 10 + 20 = 30
      expect(result.totalLatency).toBe(30);
    });
  });
});
