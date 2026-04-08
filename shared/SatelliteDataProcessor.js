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

        buildNetworkGraph(maxRange = 5000) {
            const adjacencyList = new Map();
            this.satellites.forEach((sat) => {
                adjacencyList.set(sat.id, []);
            });
            let totalLinks = 0;

            for (let i = 0; i < this.satellites.length; i++) {
                const sat1 = this.satellites[i];
                const sat1Edges = adjacencyList.get(sat1.id);

                for (let j = i + 1; j < this.satellites.length; j++) {
                    const sat2 = this.satellites[j];

                    const distance = sat1.distanceTo(sat2);
                    if (distance === null || distance > maxRange) continue;

                    if (this.checkLineOfSight(sat1, sat2)) {
                        const latency = sat1.latencyTo(sat2);

                        sat1Edges.push({
                            target: sat2.id,
                            distance,
                            latency
                        });

                        const sat2Edges = adjacencyList.get(sat2.id);
                        sat2Edges.push({
                            target: sat1.id,
                            distance,
                            latency
                        });

                        totalLinks++;
                    }
                }
            }

            this.networkGraph = adjacencyList;
            this.logger.info?.(
                `Network graph built: ${this.satellites.length} nodes, ${totalLinks} links`
            );

            return {
                nodes: this.satellites.length,
                links: totalLinks,
                graph: adjacencyList
            };
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

        exportNetworkState() {
            const graphEntries = this.networkGraph instanceof Map
                ? this.networkGraph
                : new Map();

            return {
                timestamp: this.lastUpdateTime,
                satellites: this.satellites.map((sat) => ({
                    id: sat.id,
                    name: sat.name,
                    position: sat.position,
                    positionGeodetic: sat.getGeodeticDegrees(),
                    neighbors: this.networkGraph.get(sat.id) || [],
                    bandwidth: {
                        total: sat.maxBandwidth,
                        available: sat.availableBandwidth,
                        load: sat.currentLoad
                    }
                })),
                graph: Object.fromEntries(graphEntries)
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
