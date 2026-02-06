/**
 * Location Service - Nominatim API wrapper with debouncing
 */

class LocationService {
    constructor() {
        this.debounceTimer = null;
        this.debounceMs = 300;
        this.cache = new Map();
    }

    /**
     * Search for locations with debouncing
     * @param {string} query - Search query
     * @returns {Promise<Array>} - Array of {displayName, lat, lon}
     */
    search(query) {
        return new Promise((resolve, reject) => {
            // Clear any pending search
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            // Minimum 3 characters
            if (!query || query.length < 3) {
                resolve([]);
                return;
            }

            // Check cache first
            const cacheKey = query.toLowerCase().trim();
            if (this.cache.has(cacheKey)) {
                resolve(this.cache.get(cacheKey));
                return;
            }

            // Debounce the actual API call
            this.debounceTimer = setTimeout(async () => {
                try {
                    const results = await this._fetchFromNominatim(query);
                    this.cache.set(cacheKey, results);
                    resolve(results);
                } catch (error) {
                    reject(error);
                }
            }, this.debounceMs);
        });
    }

    /**
     * Direct search without debounce (for programmatic use)
     */
    async searchImmediate(query) {
        if (!query || query.length < 3) {
            return [];
        }

        const cacheKey = query.toLowerCase().trim();
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const results = await this._fetchFromNominatim(query);
        this.cache.set(cacheKey, results);
        return results;
    }

    /**
     * Fetch from Nominatim API
     */
    async _fetchFromNominatim(query) {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=5`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SatelliteVisualizer/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }

        const data = await response.json();

        return data.map(item => ({
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            type: item.type
        }));
    }

    /**
     * Cancel any pending search
     */
    cancel() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}

export { LocationService };