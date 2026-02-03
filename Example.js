import { SatelliteConstellation } from './Satellitedataprocessor.js';

/**
 * Example usage of the Satellite Data Processor
 * This demonstrates how to load TLE data and prepare it for routing algorithms
 */

async function initializeSatelliteNetwork() {
    // Create constellation manager
    const constellation = new SatelliteConstellation();
    
    // Load TLE data from file
    console.log('Loading satellite TLE data...');
    await constellation.loadFromTLE('Satellite Data/starlinkSATS.txt');
    
    // Update positions to current time
    const now = new Date();
    constellation.updateAllPositions(now);
    
    // Build network topology with 5000km max range
    const networkStats = constellation.buildNetworkGraph(5000);
    console.log('Network Statistics:', networkStats);
    
    // Example: Find satellites near a specific location (e.g., New York City)
    const nyc = constellation.findClosestSatelliteToLocation(40.7128, -74.0060, 0);
    console.log('Closest satellite to NYC:', nyc.satellite.name, `(${nyc.distance.toFixed(2)} km away)`);
    
    // Example: Get a specific satellite's network information
    const sat = constellation.getSatellite(0);
    if (sat) {
        console.log(`\nSatellite ${sat.name} (ID: ${sat.id}):`);
        console.log(`  Position (ECI): x=${sat.position.x.toFixed(2)}, y=${sat.position.y.toFixed(2)}, z=${sat.position.z.toFixed(2)} km`);
        
        const geo = sat.getGeodeticDegrees();
        console.log(`  Position (Geo): lat=${geo.latitude.toFixed(4)}°, lon=${geo.longitude.toFixed(4)}°, alt=${geo.altitude.toFixed(2)} km`);
        console.log(`  Visible neighbors: ${sat.visibleNeighbors.length}`);
        console.log(`  Available bandwidth: ${sat.availableBandwidth} Mbps`);
        
        // Show first 5 neighbors with distances and latencies
        console.log('  First 5 neighbors:');
        sat.visibleNeighbors.slice(0, 5).forEach(neighborId => {
            const distance = sat.neighborDistances.get(neighborId);
            const latency = sat.neighborLatencies.get(neighborId);
            const neighbor = constellation.getSatellite(neighborId);
            console.log(`    - ${neighbor.name}: ${distance.toFixed(2)} km, ${latency.toFixed(3)} ms latency`);
        });
    }
    
    // Export complete network state for routing algorithms
    const networkState = constellation.exportNetworkState();
    console.log('\nNetwork state exported with', networkState.satellites.length, 'satellites');
    
    return { constellation, networkState };
}

// Example: Simulate network over time
async function simulateNetworkEvolution() {
    const constellation = new SatelliteConstellation();
    await constellation.loadFromTLE('Satellite Data/starlinkSATS.txt');
    
    // Simulate network at different time points
    const timeSteps = [0, 60, 120, 180]; // seconds from now
    const now = new Date();
    
    console.log('\nSimulating network topology over time:');
    
    for (const deltaSeconds of timeSteps) {
        const timestamp = new Date(now.getTime() + deltaSeconds * 1000);
        constellation.updateAllPositions(timestamp);
        const stats = constellation.buildNetworkGraph(5000);
        
        console.log(`T+${deltaSeconds}s: ${stats.links} active links`);
    }
}

// Example: Prepare data for shortest path routing
function prepareForRoutingAlgorithm(constellation, sourceId, destinationId) {
    // Get network graph in format suitable for Dijkstra's or A*
    const graph = constellation.networkGraph;
    
    const source = constellation.getSatellite(sourceId);
    const destination = constellation.getSatellite(destinationId);
    
    if (!source || !destination) {
        console.error('Invalid source or destination satellite ID');
        return null;
    }
    
    // For shortest path (by hop count)
    const hopCountGraph = new Map();
    graph.forEach((neighbors, nodeId) => {
        hopCountGraph.set(nodeId, neighbors.map(n => ({
            target: n.target,
            weight: 1 // Each hop costs 1
        })));
    });
    
    // For minimum latency routing
    const latencyGraph = new Map();
    graph.forEach((neighbors, nodeId) => {
        latencyGraph.set(nodeId, neighbors.map(n => ({
            target: n.target,
            weight: n.latency // Weight by propagation latency
        })));
    });
    
    // For load-balanced routing (considering available bandwidth)
    const bandwidthGraph = new Map();
    graph.forEach((neighbors, nodeId) => {
        const nodeSat = constellation.getSatellite(nodeId);
        bandwidthGraph.set(nodeId, neighbors.map(n => {
            const neighborSat = constellation.getSatellite(n.target);
            // Weight inversely by minimum available bandwidth on the link
            const minBandwidth = Math.min(nodeSat.availableBandwidth, neighborSat.availableBandwidth);
            const weight = minBandwidth > 0 ? 1 / minBandwidth : Infinity;
            return {
                target: n.target,
                weight: weight
            };
        }));
    });
    
    return {
        source: sourceId,
        destination: destinationId,
        graphs: {
            hopCount: hopCountGraph,
            latency: latencyGraph,
            bandwidth: bandwidthGraph
        },
        sourcePosition: source.getGeodeticDegrees(),
        destinationPosition: destination.getGeodeticDegrees()
    };
}

// Run examples
(async function main() {
    console.log('=== Satellite Network Data Processor ===\n');
    
    try {
        const { constellation, networkState } = await initializeSatelliteNetwork();
        
        // Example routing preparation
        console.log('\n=== Preparing for Routing Algorithms ===');
        const routingData = prepareForRoutingAlgorithm(constellation, 0, 50);
        if (routingData) {
            console.log('Routing graphs prepared for algorithms:');
            console.log('  - Hop count (shortest path)');
            console.log('  - Latency (minimum latency)');
            console.log('  - Bandwidth (load-balanced)');
        }
        
        // Optionally run time evolution simulation
        // await simulateNetworkEvolution();
        
    } catch (error) {
        console.error('Error:', error);
    }
})();