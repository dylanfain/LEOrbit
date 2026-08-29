const NOOP_LOGGER = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

export function createSatelliteModule(satelliteLib, options = {}) {
    if (!satelliteLib) {
        throw new Error('satelliteLib dependency is required');
    }

    const moduleLogger = options.logger ?? null;
    const baseLogger = moduleLogger ?? NOOP_LOGGER;

    const EARTH_RADIUS_KM = 6371;
    const SPEED_OF_LIGHT_KM_MS = 299792.458;

    const toDegrees = (value, fn) => {
        try {
            return fn ? fn(value) : value;
        } catch (_) {
            return value;
        }
    };

    const toEdgeDistance = (distanceKm) => Math.fround(distanceKm);

    class SatelliteNode {
        constructor(name, tle1, tle2, id) {
            this.id = id;
            this.name = name;

            this.satrec = satelliteLib.twoline2satrec(tle1, tle2);

            this.position = null;
            this.velocity = null;
            this.positionGeodetic = null;

            this.currentLoad = 0;
            this.maxBandwidth = 1000;
            this.availableBandwidth = 1000;

            this.lastUpdateTime = null;
        }

        updatePosition(date) {
            const positionAndVelocity = satelliteLib.propagate(this.satrec, date);

            if (
                positionAndVelocity &&
                positionAndVelocity.position &&
                typeof positionAndVelocity.position !== 'boolean'
            ) {
                this.position = positionAndVelocity.position;
                this.velocity = positionAndVelocity.velocity;

                const gmst = satelliteLib.gstime(date);
                this.positionGeodetic = satelliteLib.eciToGeodetic(this.position, gmst);

                this.lastUpdateTime = date;
                return true;
            }

            return false;
        }

        getThreeJsPosition() {
            if (!this.position) return null;

            const scale = 1 / EARTH_RADIUS_KM;
            return {
                x: this.position.x * scale,
                y: this.position.z * scale,
                z: this.position.y * scale
            };
        }

        getGeodeticDegrees() {
            if (!this.positionGeodetic) return null;

            return {
                latitude: toDegrees(this.positionGeodetic.latitude, satelliteLib.degreesLat),
                longitude: toDegrees(this.positionGeodetic.longitude, satelliteLib.degreesLong),
                altitude: this.positionGeodetic.height
            };
        }

        distanceTo(otherSatellite) {
            if (!this.position || !otherSatellite.position) return null;

            const dx = this.position.x - otherSatellite.position.x;
            const dy = this.position.y - otherSatellite.position.y;
            const dz = this.position.z - otherSatellite.position.z;

            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        latencyTo(otherSatellite) {
            const distance = this.distanceTo(otherSatellite);
            if (distance === null) return null;

            return distance / SPEED_OF_LIGHT_KM_MS;
        }

        updateBandwidth(utilizationPercentage) {
            this.currentLoad = Math.min(1, Math.max(0, utilizationPercentage));
            this.availableBandwidth = this.maxBandwidth * (1 - this.currentLoad);
        }
    }

    const parseTLE = (tleText) => {
        const lines = tleText.trim().split('\n');
        const parsedData = [];

        for (let i = 0; i < lines.length; i += 3) {
            if (i + 2 < lines.length) {
                const name = lines[i].trim();
                const line1 = lines[i + 1].trim();
                const line2 = lines[i + 2].trim();

                parsedData.push({
                    name,
                    tle1: line1,
                    tle2: line2
                });
            }
        }

        return parsedData;
    };

    class SatelliteConstellation {
        constructor({ logger } = {}) {
            this.logger = logger ?? baseLogger;
            this.satellites = [];
            this.satelliteMap = new Map();
            this.lastUpdateTime = null;
            this.networkGraph = new Map();
        }

        loadFromTLEText(tleText) {
            const tleData = parseTLE(tleText);
            this.logger.info?.(`Parsing ${tleData.length} satellites from TLE data...`);

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
                    this.logger.warn?.(`Failed to create satellite ${satData.name}: ${error.message}`);
                }
            });

            this.logger.info?.(`Successfully loaded ${this.satellites.length} satellites`);
            return this.satellites.length;
        }

        async loadFromTLE(fetcher) {
            if (typeof fetcher !== 'function') {
                throw new Error('A fetcher function returning TLE text is required');
            }

            const tleText = await fetcher();
            return this.loadFromTLEText(tleText);
        }

        updateAllPositions(date = new Date()) {
            let successCount = 0;

            this.satellites.forEach((sat) => {
                if (sat.updatePosition(date)) {
                    successCount++;
                }
            });

            this.lastUpdateTime = date;
            this.logger.info?.(`Updated ${successCount}/${this.satellites.length} satellite positions`);

            return successCount;
        }

        checkLineOfSight(sat1, sat2) {
            if (!sat1.position || !sat2.position) return false;

            const p1 = sat1.position;
            const p2 = sat2.position;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dz = p2.z - p1.z;

            const satDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const dirX = dx / satDistance;
            const dirY = dy / satDistance;
            const dirZ = dz / satDistance;

            const t = -(p1.x * dirX + p1.y * dirY + p1.z * dirZ);
            const tClamped = Math.max(0, Math.min(satDistance, t));

            const closestX = p1.x + tClamped * dirX;
            const closestY = p1.y + tClamped * dirY;
            const closestZ = p1.z + tClamped * dirZ;

            const distToEarth = Math.sqrt(closestX * closestX + closestY * closestY + closestZ * closestZ);

            return distToEarth > EARTH_RADIUS_KM;
        }

        buildSpatialIndex() {
            const spatialIndex = new Map();
            const gridSize = 2000; // 2000 km cells

            this.satellites.forEach((sat) => {
                if (!sat || !sat.position) return;

                const cellX = Math.floor(sat.position.x / gridSize);
                const cellY = Math.floor(sat.position.y / gridSize);
                const cellZ = Math.floor(sat.position.z / gridSize);
                const cellKey = `${cellX},${cellY},${cellZ}`;

                if (!spatialIndex.has(cellKey)) {
                    spatialIndex.set(cellKey, []);
                }
                spatialIndex.get(cellKey).push(sat);
            });

            return spatialIndex;
        }

        getCandidateNeighbors(sat, spatialIndex) {
            if (!sat || !sat.position) return new Set();
            const gridSize = 2000;
            const candidates = new Set();
            const cellX = Math.floor(sat.position.x / gridSize);
            const cellY = Math.floor(sat.position.y / gridSize);
            const cellZ = Math.floor(sat.position.z / gridSize);

            // Check neighboring cells (3x3x3 cube)
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
                        const cellSats = spatialIndex.get(key);
                        if (cellSats) {
                            cellSats.forEach((other) => {
                                if (other && other.id !== sat.id && other.position) {
                                    candidates.add(other);
                                }
                            });
                        }
                    }
                }
            }

            return candidates;
        }

        buildNetworkGraph(maxRange = 5000) {
            const adjacencyList = new Map();
            this.satellites.forEach((sat) => {
                adjacencyList.set(sat.id, []);
            });

            // Build spatial index for faster neighbor lookup
            const spatialIndex = this.buildSpatialIndex();
            let totalLinks = 0;
            let pairwiseChecks = 0;

            this.satellites.forEach((sat1) => {
                const sat1Edges = adjacencyList.get(sat1.id);
                const candidates = this.getCandidateNeighbors(sat1, spatialIndex);

                candidates.forEach((sat2) => {
                    if (sat1.id >= sat2.id) return; // Avoid duplicate edges

                    pairwiseChecks++;
                    const distance = sat1.distanceTo(sat2);
                    if (distance === null || distance > maxRange) return;

                    if (this.checkLineOfSight(sat1, sat2)) {
                        const edgeDistance = toEdgeDistance(distance);
                        sat1Edges.push({
                            target: sat2.id,
                            distance: edgeDistance
                        });

                        const sat2Edges = adjacencyList.get(sat2.id);
                        sat2Edges.push({
                            target: sat1.id,
                            distance: edgeDistance
                        });

                        totalLinks++;
                    }
                });
            });

            this.networkGraph = adjacencyList;
            this.logger.info?.(
                `Network graph built: ${this.satellites.length} nodes, ${totalLinks} links (${pairwiseChecks} checks)`
            );

            return {
                nodes: this.satellites.length,
                links: totalLinks,
                graph: adjacencyList
            };
        }

        buildNetworkGraphLazy(maxRange = 5000) {
            const adjacencyList = new Map();
            this.satellites.forEach((sat) => {
                adjacencyList.set(sat.id, null); // Mark as not yet computed
            });

            this.networkGraph = adjacencyList;
            this.maxLazyRange = maxRange;
            this.lazyGraphCache = new Map(); // Cache computed neighbor sets
            
            this.logger.info?.(`Lazy graph initialized for ${this.satellites.length} satellites`);
            
            return {
                nodes: this.satellites.length,
                links: 0,
                graph: adjacencyList,
                mode: 'lazy'
            };
        }

        getNeighborsForSatellite(satId) {
            if (this.networkGraph.get(satId) !== null) {
                return this.networkGraph.get(satId) || [];
            }

            // Check cache first
            if (this.lazyGraphCache.has(satId)) {
                const cached = this.lazyGraphCache.get(satId);
                this.networkGraph.set(satId, cached);
                return cached;
            }

            // Compute neighbors for this satellite
            const sat1 = this.satellites[satId];
            if (!sat1) return [];

            const neighbors = [];
            for (let i = 0; i < this.satellites.length; i++) {
                if (i === satId) continue;

                const sat2 = this.satellites[i];
                const distance = sat1.distanceTo(sat2);
                
                if (distance === null || distance > this.maxLazyRange) continue;
                if (!this.checkLineOfSight(sat1, sat2)) continue;
                neighbors.push({
                    target: sat2.id,
                    distance: toEdgeDistance(distance)
                });
            }

            this.networkGraph.set(satId, neighbors);
            this.lazyGraphCache.set(satId, neighbors);
            
            return neighbors;
        }

        getSatellite(id) {
            return this.satelliteMap.get(id);
        }

        findClosestSatelliteToLocation(latitude, longitude, altitude = 0, options = {}) {
            const { minNeighbors = 0 } = options;

            let closestSat = null;
            let closestDistance = Infinity;

            let bestConnectedSat = null;
            let bestConnectedDistance = Infinity;

            this.satellites.forEach((sat) => {
                const satGeo = sat.getGeodeticDegrees();
                if (!satGeo) return;

                const latDiff = (satGeo.latitude - latitude) * Math.PI / 180;
                const lonDiff = (satGeo.longitude - longitude) * Math.PI / 180;
                const altDiff = satGeo.altitude - altitude;

                const distance = Math.sqrt(
                    (EARTH_RADIUS_KM * latDiff) ** 2 +
                    (EARTH_RADIUS_KM * Math.cos(latitude * Math.PI / 180) * lonDiff) ** 2 +
                    altDiff ** 2
                );

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSat = sat;
                }

                const neighborCount = this.networkGraph.get(sat.id)?.length ?? 0;
                if (
                    neighborCount >= minNeighbors &&
                    distance < bestConnectedDistance
                ) {
                    bestConnectedDistance = distance;
                    bestConnectedSat = sat;
                }
            });

            const chosenSat = bestConnectedSat ?? closestSat;
            const chosenDistance = bestConnectedSat ? bestConnectedDistance : closestDistance;

            return {
                satellite: chosenSat,
                distance: chosenDistance,
                neighborCount: this.networkGraph.get(chosenSat?.id)?.length ?? 0
            };
        }

    }

    return {
        SatelliteConstellation,
        SatelliteNode,
        EARTH_RADIUS_KM,
        SPEED_OF_LIGHT_KM_MS
    };
}
