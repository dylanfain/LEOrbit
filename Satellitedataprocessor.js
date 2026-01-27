import * as satellite from 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.es.js';

/**
 * Satellite Network Data Processor
 * Handles TLE parsing, position calculation, and data preparation for routing algorithms
 */

// Constants
const EARTH_RADIUS_KM = 6371;
const SPEED_OF_LIGHT_KM_MS = 299792.458; // km/ms for latency calculations

/**
 * Represents a satellite with all necessary data for network routing
 */
class SatelliteNode {
    constructor(name, tle1, tle2, id) {
        this.id = id;
        this.name = name;
        this.tle1 = tle1;
        this.tle2 = tle2;
        
        // Initialize SGP4 satellite record for propagation
        this.satrec = satellite.twoline2satrec(tle1, tle2);
        
        // Position data (updated via propagation)
        this.position = null; // ECI coordinates {x, y, z} in km
        this.velocity = null; // ECI velocity {x, y, z} in km/s
        this.positionGeodetic = null; // {latitude, longitude, altitude} in radians/km
        
        // Network topology data
        this.visibleNeighbors = []; // Array of satellite IDs currently in LOS
        this.neighborDistances = new Map(); // Map<satelliteId, distance_km>
        this.neighborLatencies = new Map(); // Map<satelliteId, latency_ms>
        
        // Routing metadata
        this.currentLoad = 0; // Current bandwidth utilization (0-1)
        this.maxBandwidth = 1000; // Mbps (configurable)
        this.availableBandwidth = 1000; // Mbps
        
        // Temporal tracking
        this.lastUpdateTime = null;
    }
    
    /**
     * Update satellite position for a given timestamp
     */
    updatePosition(date) {
        const positionAndVelocity = satellite.propagate(this.satrec, date);
        
        if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
            this.position = positionAndVelocity.position; // ECI coords in km
            this.velocity = positionAndVelocity.velocity; // ECI velocity in km/s
            
            // Convert to geodetic coordinates for geographic analysis
            const gmst = satellite.gstime(date);
            this.positionGeodetic = satellite.eciToGeodetic(this.position, gmst);
            
            this.lastUpdateTime = date;
            return true;
        }
        
        return false;
    }
    
    /**
     * Get position as normalized Three.js coordinates (for later 3D rendering)
     */
    getThreeJsPosition() {
        if (!this.position) return null;
        
        const scale = 1 / EARTH_RADIUS_KM;
        return {
            x: this.position.x * scale,
            y: this.position.z * scale,
            z: this.position.y * scale
        };
    }
    
    /**
     * Get geodetic position in degrees
     */
    getGeodeticDegrees() {
        if (!this.positionGeodetic) return null;
        
        return {
            latitude: satellite.degreesLat(this.positionGeodetic.latitude),
            longitude: satellite.degreesLong(this.positionGeodetic.longitude),
            altitude: this.positionGeodetic.height
        };
    }
    
    /**
     * Calculate distance to another satellite
     */
    distanceTo(otherSatellite) {
        if (!this.position || !otherSatellite.position) return null;
        
        const dx = this.position.x - otherSatellite.position.x;
        const dy = this.position.y - otherSatellite.position.y;
        const dz = this.position.z - otherSatellite.position.z;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    /**
     * Calculate propagation latency to another satellite (in ms)
     */
    latencyTo(otherSatellite) {
        const distance = this.distanceTo(otherSatellite);
        if (distance === null) return null;
        
        return distance / SPEED_OF_LIGHT_KM_MS;
    }
    
    /**
     * Update bandwidth availability based on current load
     */
    updateBandwidth(utilizationPercentage) {
        this.currentLoad = Math.min(1, Math.max(0, utilizationPercentage));
        this.availableBandwidth = this.maxBandwidth * (1 - this.currentLoad);
    }
}

/**
 * Main constellation manager
 */
class SatelliteConstellation {
    constructor() {
        this.satellites = [];
        this.satelliteMap = new Map(); // For quick ID lookup
        this.lastUpdateTime = null;
        this.networkGraph = null; // Adjacency list representation
    }
    
    /**
     * Parse TLE data from text string
     */
    parseTLE(tleText) {
        const lines = tleText.trim().split('\n');
        const parsedData = [];
        
        for (let i = 0; i < lines.length; i += 3) {
            if (i + 2 < lines.length) {
                const name = lines[i].trim();
                const line1 = lines[i + 1].trim();
                const line2 = lines[i + 2].trim();
                
                parsedData.push({
                    name: name,
                    tle1: line1,
                    tle2: line2
                });
            }
        }
        
        return parsedData;
    }
    
    /**
     * Load satellites from TLE data
     */
    async loadFromTLE(tleFilePath) {
        try {
            const response = await fetch(tleFilePath);
            const tleText = await response.text();
            const tleData = this.parseTLE(tleText);
            
            console.log(`Parsing ${tleData.length} satellites from TLE data...`);
            
            tleData.forEach((satData, index) => {
                try {
                    const satNode = new SatelliteNode(
                        satData.name,
                        satData.tle1,
                        satData.tle2,
                        index
                    );
                    
                    this.satellites.push(satNode);
                    this.satelliteMap.set(index, satNode);
                } catch (error) {
                    console.warn(`Failed to create satellite ${satData.name}:`, error);
                }
            });
            
            console.log(`Successfully loaded ${this.satellites.length} satellites`);
            return this.satellites.length;
        } catch (error) {
            console.error('Error loading TLE file:', error);
            throw error;
        }
    }
    
    /**
     * Update all satellite positions for a given timestamp
     */
    updateAllPositions(date = new Date()) {
        let successCount = 0;
        
        this.satellites.forEach(sat => {
            if (sat.updatePosition(date)) {
                successCount++;
            }
        });
        
        this.lastUpdateTime = date;
        console.log(`Updated ${successCount}/${this.satellites.length} satellite positions`);
        
        return successCount;
    }
    
    /**
     * Calculate line-of-sight visibility between two satellites
     * Returns true if satellites can see each other (no Earth obstruction)
     */
    checkLineOfSight(sat1, sat2) {
        if (!sat1.position || !sat2.position) return false;
        
        const p1 = sat1.position;
        const p2 = sat2.position;
        
        // Vector from sat1 to sat2
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        
        // Distance between satellites
        const satDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Normalize direction vector
        const dirX = dx / satDistance;
        const dirY = dy / satDistance;
        const dirZ = dz / satDistance;
        
        // Check if line segment intersects Earth sphere
        // Using parametric line: P(t) = P1 + t * direction, where t ∈ [0, satDistance]
        // Earth center is at origin with radius EARTH_RADIUS_KM
        
        // Compute closest point on line to Earth center
        const t = -(p1.x * dirX + p1.y * dirY + p1.z * dirZ);
        
        // Clamp t to line segment
        const tClamped = Math.max(0, Math.min(satDistance, t));
        
        // Closest point on line segment to Earth center
        const closestX = p1.x + tClamped * dirX;
        const closestY = p1.y + tClamped * dirY;
        const closestZ = p1.z + tClamped * dirZ;
        
        // Distance from Earth center to closest point
        const distToEarth = Math.sqrt(closestX * closestX + closestY * closestY + closestZ * closestZ);
        
        // LOS exists if line doesn't intersect Earth
        return distToEarth > EARTH_RADIUS_KM;
    }
    
    /**
     * Build network topology graph based on current satellite positions
     * Maximum communication range can be specified (in km)
     */
    buildNetworkGraph(maxRange = 5000) {
        console.log('Building network topology graph...');
        
        // Clear existing connections
        this.satellites.forEach(sat => {
            sat.visibleNeighbors = [];
            sat.neighborDistances.clear();
            sat.neighborLatencies.clear();
        });
        
        // Build adjacency list
        const adjacencyList = new Map();
        let totalLinks = 0;
        
        for (let i = 0; i < this.satellites.length; i++) {
            const sat1 = this.satellites[i];
            adjacencyList.set(sat1.id, []);
            
            for (let j = i + 1; j < this.satellites.length; j++) {
                const sat2 = this.satellites[j];
                
                // Check if within communication range
                const distance = sat1.distanceTo(sat2);
                if (distance === null || distance > maxRange) continue;
                
                // Check line of sight
                if (this.checkLineOfSight(sat1, sat2)) {
                    // Add bidirectional link
                    sat1.visibleNeighbors.push(sat2.id);
                    sat2.visibleNeighbors.push(sat1.id);
                    
                    const latency = sat1.latencyTo(sat2);
                    
                    sat1.neighborDistances.set(sat2.id, distance);
                    sat1.neighborLatencies.set(sat2.id, latency);
                    
                    sat2.neighborDistances.set(sat1.id, distance);
                    sat2.neighborLatencies.set(sat1.id, latency);
                    
                    adjacencyList.get(sat1.id).push({
                        target: sat2.id,
                        distance: distance,
                        latency: latency
                    });
                    
                    if (!adjacencyList.has(sat2.id)) {
                        adjacencyList.set(sat2.id, []);
                    }
                    
                    adjacencyList.get(sat2.id).push({
                        target: sat1.id,
                        distance: distance,
                        latency: latency
                    });
                    
                    totalLinks++;
                }
            }
        }
        
        this.networkGraph = adjacencyList;
        
        console.log(`Network graph built: ${this.satellites.length} nodes, ${totalLinks} links`);
        console.log(`Average connectivity: ${(totalLinks * 2 / this.satellites.length).toFixed(2)} neighbors per satellite`);
        
        return {
            nodes: this.satellites.length,
            links: totalLinks,
            graph: adjacencyList
        };
    }
    
    /**
     * Get satellite by ID
     */
    getSatellite(id) {
        return this.satelliteMap.get(id);
    }
    
    /**
     * Find closest satellite to a geographic location
     */
    findClosestSatelliteToLocation(latitude, longitude, altitude = 0) {
        let closestSat = null;
        let minDistance = Infinity;
        
        this.satellites.forEach(sat => {
            const satGeo = sat.getGeodeticDegrees();
            if (!satGeo) return;
            
            // Simple spherical distance calculation
            const latDiff = (satGeo.latitude - latitude) * Math.PI / 180;
            const lonDiff = (satGeo.longitude - longitude) * Math.PI / 180;
            const altDiff = satGeo.altitude - altitude;
            
            // Approximate distance (good enough for finding closest)
            const distance = Math.sqrt(
                (EARTH_RADIUS_KM * latDiff) ** 2 +
                (EARTH_RADIUS_KM * Math.cos(latitude * Math.PI / 180) * lonDiff) ** 2 +
                altDiff ** 2
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                closestSat = sat;
            }
        });
        
        return {
            satellite: closestSat,
            distance: minDistance
        };
    }
    
    /**
     * Export network state for routing algorithms
     */
    exportNetworkState() {
        return {
            timestamp: this.lastUpdateTime,
            satellites: this.satellites.map(sat => ({
                id: sat.id,
                name: sat.name,
                position: sat.position,
                positionGeodetic: sat.getGeodeticDegrees(),
                neighbors: sat.visibleNeighbors,
                neighborDistances: Object.fromEntries(sat.neighborDistances),
                neighborLatencies: Object.fromEntries(sat.neighborLatencies),
                bandwidth: {
                    total: sat.maxBandwidth,
                    available: sat.availableBandwidth,
                    load: sat.currentLoad
                }
            })),
            graph: Object.fromEntries(this.networkGraph)
        };
    }
}

// Export for use in other modules
export { SatelliteConstellation, SatelliteNode, EARTH_RADIUS_KM, SPEED_OF_LIGHT_KM_MS };