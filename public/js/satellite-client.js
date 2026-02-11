import * as satelliteLib from 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.es.js';
import { createSatelliteModule } from '/shared/SatelliteDataProcessor.js';

const {
    SatelliteConstellation,
    SatelliteNode,
    EARTH_RADIUS_KM,
    SPEED_OF_LIGHT_KM_MS
} = createSatelliteModule(satelliteLib);

export {
    SatelliteConstellation,
    SatelliteNode,
    EARTH_RADIUS_KM,
    SPEED_OF_LIGHT_KM_MS
};

export async function loadConstellation(tleUrl = '/data/starlink.tle', options = {}) {
    const response = await fetch(tleUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch TLE data from ${tleUrl}: ${response.status}`);
    }

    const tleText = await response.text();
    const constellation = new SatelliteConstellation({ logger: options.logger });

    constellation.loadFromTLEText(tleText);
    constellation.updateAllPositions(new Date());

    return constellation;
}
