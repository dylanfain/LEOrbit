import { readFile } from 'fs/promises';
import satellite from 'satellite.js';
import { createSatelliteModule } from '../shared/SatelliteDataProcessor.js';

const {
    SatelliteConstellation,
    SatelliteNode,
    EARTH_RADIUS_KM,
    SPEED_OF_LIGHT_KM_MS
} = createSatelliteModule(satellite);

export async function buildConstellation(tlePath, options = {}) {
    const tleText = await readFile(tlePath, 'utf-8');
    const constellation = new SatelliteConstellation({ logger: options.logger });

    constellation.loadFromTLEText(tleText);
    constellation.updateAllPositions(new Date());

    return constellation;
}

export {
    SatelliteConstellation,
    SatelliteNode,
    EARTH_RADIUS_KM,
    SPEED_OF_LIGHT_KM_MS
};
