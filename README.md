# LEOrbit - Satellite Visualizer

3D visualization of Starlink satellite constellation with route selection.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000

## How It Works

1. Frontend loads TLE data and renders satellites on a 3D globe
2. Search for start/end locations using the UI panel
3. When you select a location, it POSTs to `/api/route`
4. Backend logs the location data to console

## API

**POST /api/route**
```json
{
  "start": { "displayName": "...", "lat": 40.7, "lon": -74.0 },
  "end": { "displayName": "...", "lat": 34.0, "lon": -118.2 }
}
```

**GET /api/route** - Returns current route selection

## Files

- `server.js` - Express backend
- `index.js` - Three.js frontend (maybe later refactor to different components)
- `Satellitedataprocessor.js` - TLE parsing & constellation data
- `LocationService.js` - Nominatim geocoding
- `Example.js` - Dylan's example file