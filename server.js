import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Store latest route selection (in-memory for now)
let currentRoute = {
    start: null,
    end: null,
    timestamp: null
};

// POST endpoint for route selection
app.post('/api/route', (req, res) => {
    const { start, end } = req.body;
    
    currentRoute = {
        start,
        end,
        timestamp: new Date().toISOString()
    };
    
    console.log('\n=== Route Selection Received ===');
    if (start) {
        console.log(`Start: ${start.displayName}`);
        console.log(`       Lat: ${start.lat}, Lon: ${start.lon}`);
    }
    if (end) {
        console.log(`End:   ${end.displayName}`);
        console.log(`       Lat: ${end.lat}, Lon: ${end.lon}`);
    }
    console.log('================================\n');
    
    res.json({ 
        success: true, 
        message: 'Route received',
        route: currentRoute
    });
});

// GET endpoint to retrieve current route (useful for debugging)
app.get('/api/route', (req, res) => {
    res.json(currentRoute);
});

app.listen(PORT, () => {
    console.log(`\n🛰️  Satellite Visualizer Server`);
    console.log(`   Running at http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop\n`);
});