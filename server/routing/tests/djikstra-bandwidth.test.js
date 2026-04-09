import { widestPathBandwidth } from '../djikstra-bandwidth.js';

function createMockNetworkState(graph) {
  return {
    timestamp: new Date(),
    satellites: [],
    graph
  };
}

describe('widestPathBandwidth', () => {
  test('returns null when no path exists', () => {
    const graph = {
      0: [{ target: 1, bandwidth: 80 }],
      1: [{ target: 0, bandwidth: 80 }],
      2: []
    };

    expect(widestPathBandwidth(createMockNetworkState(graph), 0, 2)).toBeNull();
  });

  test('keeps direct low-usage route when it is cheapest', () => {
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

    expect(widestPathBandwidth(createMockNetworkState(graph), 0, 2)).toEqual({
      path: [0, 2],
      hops: 1,
      bottleneckBandwidth: 95
    });
  });

  test('prefers lower aggregate usage over a single weaker direct edge', () => {
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

    expect(widestPathBandwidth(createMockNetworkState(graph), 0, 3)).toEqual({
      path: [0, 1, 2, 3],
      hops: 3,
      bottleneckBandwidth: 75
    });
  });

  test('optimizes against the same lower-is-better usage metric the UI reports', () => {
    const graph = {
      0: [
        { target: 1, bandwidth: 90 },
        { target: 2, bandwidth: 55 }
      ],
      1: [
        { target: 0, bandwidth: 90 },
        { target: 3, bandwidth: 88 }
      ],
      2: [
        { target: 0, bandwidth: 55 },
        { target: 3, bandwidth: 54 }
      ],
      3: [
        { target: 1, bandwidth: 88 },
        { target: 2, bandwidth: 54 }
      ]
    };

    expect(widestPathBandwidth(createMockNetworkState(graph), 0, 3)).toEqual({
      path: [0, 1, 3],
      hops: 2,
      bottleneckBandwidth: 89
    });
  });
});
