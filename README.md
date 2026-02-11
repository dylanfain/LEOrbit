# LEOrbit - Satellite Visualizer

LEOrbit renders the Starlink constellation in Three.js while a Node/Express backend computes satellite-to-satellite routes on demand.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 and use the UI panel to pick start/end locations. The frontend fetches fresh constellation data from `/data/starlink.tle`, and the backend responds with the closest satellites plus the computed inter-satellite path.

## Project Structure

```
├── server.js                     # Express entry point
├── package.json
├── public/                       # Browser assets
│   ├── index.html                # 3D visualization UI
│   ├── analytics.html            # Analytics dashboard
│   ├── data/                     # Starlink constellation data
│   ├── textures/
│   └── js/
│       ├── index.js              # Three.js scene + UI panel
│       ├── satellite-client.js   # Browser wrapper around the shared constellation logic
│       ├── LocationService.js    # Nominatim geocoding helper
│       ├── starfield.js          # Background stars
│       └── Example.js            # Old demo
├── server/
│   ├── satellite-server.js       # Node wrapper for the shared module
│   └── routing/dijkstra-hop.js   # Hop-count Dijkstra implementation
└── shared/
    └── SatelliteDataProcessor.js # Dependency-injected constellation + satellite classes
```

The Express server statically serves `public/` and exposes `/shared/...` so browser modules can import the shared code without bundling.

## Architecture Overview

1. **Shared Constellation Logic** – `shared/SatelliteDataProcessor.js` exports a `createSatelliteModule` factory. Both the browser and Node entry points inject their respective `satellite.js` dependency, so the same classes and helpers run in each environment.
2. **Browser (`public/js/index.js`)** – `loadConstellation()` (from `satellite-client.js`) fetches `/data/starlink.tle`, seeds the visualization, and updates UI stats like total satellites, hop count, and estimated latency.
3. **Server (`server.js`)** – At startup the server loads the constellation once via `buildConstellation()`. Each `/api/route` request refreshes orbital positions, rebuilds the network graph (default 5,000 km max link range), finds the closest satellites to the requested lat/lon pairs, and runs Dijkstra to produce the hop-optimal route.

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `TLE_PATH` | `./public/data/starlink.tle` | Path to constellation data |
| `MAX_LINK_RANGE_KM` | `5000` | Max distance when building the network graph |

## API

### `POST /api/route`

Request:

```json
{
  "start": { "displayName": "New York City", "lat": 40.7128, "lon": -74.0060 },
  "end":   { "displayName": "Los Angeles", "lat": 34.0522, "lon": -118.2437 }
}
```

Response:

```json
{
  "startLocation": { "...": "..." },
  "endLocation": { "...": "..." },
  "startSatellite": {
    "id": 120,
    "name": "STARLINK-1200",
    "distanceKm": 520.42,
    "geodetic": { "latitude": 41.0, "longitude": -72.3, "altitude": 540.1 }
  },
  "endSatellite": { "...": "..." },
  "path": [120, 486, 913, 32],
  "hops": 3,
  "estimatedLatencyMs": 13.7,
  "timestamp": "2026-02-11T21:17:00.123Z"
}
```

- Returns `400` if the payload is malformed.
- Returns `503` if the constellation is not ready or no viable path exists.

### `GET /api/route`

Returns the most recent route payload (or `503` if the constellation has not been initialized yet).

## Next Steps

- Wire additional routing algorithms into `server/routing/`.
- Feed the analytics page with real telemetry from `/api/route`.
- Schedule background constellation refreshes if near-real-time accuracy is required.
