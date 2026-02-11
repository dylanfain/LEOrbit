import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { loadConstellation } from './satellite-client.js';
import { LocationService } from './LocationService.js';
import { createStarfield } from './starfield.js';

// ============== Scene Setup ==============
const w = window.innerWidth;
const h = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.z = 2;

const scene = new THREE.Scene();

// OrbitControls - locked to Earth center, no panning
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;              // Disable panning
controls.target.set(0, 0, 0);            // Lock target to Earth center
controls.minDistance = 1.2;              // Don't allow zooming inside Earth
controls.maxDistance = 10;               // Max zoom out distance

// ============== Starfield ==============
const starfield = createStarfield();
scene.add(starfield);

// ============== Earth ==============
const earthGeo = new THREE.SphereGeometry(1, 64, 32);
const textureLoader = new THREE.TextureLoader();
const earthTexture = textureLoader.load('/textures/2k_earth_daymap.jpg');
const earthMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: earthTexture
});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// ============== Lighting ==============
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemiLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// ============== Location Markers ==============
const markerGeo = new THREE.CircleGeometry(0.025, 32);
const BASE_MARKER_SCALE = 1.0;
const REFERENCE_DISTANCE = 2.0; // Camera distance at which markers are "normal" size

const startMarkerMat = new THREE.MeshBasicMaterial({ 
    color: 0x00ff88, 
    side: THREE.DoubleSide 
});
const startMarker = new THREE.Mesh(markerGeo, startMarkerMat);
startMarker.visible = false;
scene.add(startMarker);

const endMarkerMat = new THREE.MeshBasicMaterial({ 
    color: 0xff4466, 
    side: THREE.DoubleSide 
});
const endMarker = new THREE.Mesh(markerGeo, endMarkerMat);
endMarker.visible = false;
scene.add(endMarker);

const routeStats = {
    hops: document.getElementById('route-hops'),
    latency: document.getElementById('route-latency')
};

function setRouteStats(hopsText = '-', latencyText = '-') {
    if (routeStats.hops) {
        routeStats.hops.textContent = hopsText;
    }
    if (routeStats.latency) {
        routeStats.latency.textContent = latencyText;
    }
}

// ============== Utility Functions ==============
function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    return new THREE.Vector3(x, y, z);
}

function positionMarkerAtLocation(marker, lat, lon) {
    const surfacePos = latLonToVector3(lat, lon, 1.005);
    marker.position.copy(surfacePos);
    
    // Orient marker to face outward from Earth center
    marker.lookAt(0, 0, 0);
    marker.rotateX(Math.PI); // Flip to face outward
    
    marker.visible = true;
}

function lookAtLocation(lat, lon) {
    const targetPoint = latLonToVector3(lat, lon, 1.0);
    const cameraPos = latLonToVector3(lat, lon, 3.0);
    
    camera.position.copy(cameraPos);
    camera.lookAt(0, 0, 0);  // Always look at Earth center
    controls.update();
}

function updateMarkerScales() {
    const cameraDistance = camera.position.length();
    const scale = (cameraDistance / REFERENCE_DISTANCE) * BASE_MARKER_SCALE;
    
    startMarker.scale.setScalar(scale);
    endMarker.scale.setScalar(scale);
}

// ============== Satellite Configuration ==============
const satelliteGeo = new THREE.SphereGeometry(0.005, 8, 8);
let satelliteScale = 0.75;
let currentSatelliteColor = new THREE.Color(0xffffff);
let altitudeModeEnabled = false;
let minAltitude = 0;
let maxAltitude = 0;

const satelliteMeshes = []; // Three.js meshes
let constellation = null;   // Loaded by loadConstellation()

function getAltitudeColor(altitude) {
    const t = Math.max(0, Math.min(1, (altitude - minAltitude) / (maxAltitude - minAltitude)));
    const color = new THREE.Color();
    if (t < 0.33) {
        color.setHSL(0.35 - t * 0.35, 1, 0.5);
    } else if (t < 0.66) {
        color.setHSL(0.1 - (t - 0.33) * 0.15, 1, 0.5);
    } else {
        color.setHSL(0.95 - (t - 0.66) * 0.1, 1, 0.55);
    }
    return color;
}

function getPercentile(sortedArr, percentile) {
    const index = Math.floor(sortedArr.length * percentile / 100);
    return sortedArr[Math.min(index, sortedArr.length - 1)];
}

function updateSatelliteColors() {
    satelliteMeshes.forEach(mesh => {
        const altitude = mesh.userData.node.getGeodeticDegrees()?.altitude || 0;
        if (altitudeModeEnabled) {
            mesh.material.color.copy(getAltitudeColor(altitude));
        } else {
            mesh.material.color.copy(currentSatelliteColor);
        }
    });
}

// ============== Initialize Constellation ==============
async function initConstellation() {
    try {
        constellation = await loadConstellation('/data/starlink.tle');
        
        // Collect altitudes for percentile calculation
        const allAltitudes = [];
        constellation.satellites.forEach(satNode => {
            const geo = satNode.getGeodeticDegrees();
            if (geo) {
                allAltitudes.push(geo.altitude);
            }
        });
        
        // Calculate altitude range using percentiles
        allAltitudes.sort((a, b) => a - b);
        minAltitude = getPercentile(allAltitudes, 5);
        maxAltitude = getPercentile(allAltitudes, 95);
        
        document.getElementById('alt-min').textContent = `${Math.round(minAltitude)} km`;
        document.getElementById('alt-max').textContent = `${Math.round(maxAltitude)} km`;
        
        // Create meshes for each satellite
        constellation.satellites.forEach(satNode => {
            const pos = satNode.getThreeJsPosition();
            if (!pos) return;
            
            const satMat = new THREE.MeshBasicMaterial({
                color: currentSatelliteColor.clone()
            });
            
            const mesh = new THREE.Mesh(satelliteGeo, satMat);
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.scale.setScalar(satelliteScale);
            mesh.userData.node = satNode; // Reference to SatelliteNode
            
            earth.add(mesh);
            satelliteMeshes.push(mesh);
        });
        
        console.log(`Positioned ${satelliteMeshes.length} satellites`);
        
        // Update UI
        document.getElementById('sat-count').textContent = satelliteMeshes.length.toLocaleString();
        document.getElementById('loading').classList.add('hidden');
        
    } catch (error) {
        console.error('Error initializing constellation:', error);
        document.getElementById('loading').innerHTML = 
            '<span style="color: #ff6666;">Error loading satellite data</span>';
    }
}

// ============== Location Service ==============
const locationService = new LocationService();

let startLocation = null;
let endLocation = null;

const runButton = document.getElementById('run-route');
let routeLoading = false;

function updateRunButtonState() {
    if (!runButton) return;
    const ready = Boolean(startLocation && endLocation);
    runButton.disabled = !ready || routeLoading;
    runButton.textContent = routeLoading ? 'Running...' : 'Run Route';
}

runButton?.addEventListener('click', () => {
    if (runButton.disabled) return;
    sendRouteToBackend();
});

updateRunButtonState();

// Send route data to backend
async function sendRouteToBackend() {
    if (!startLocation || !endLocation) {
        return;
    }

    routeLoading = true;
    updateRunButtonState();
    console.log('[route] Submitting request to backend...', {
        start: startLocation.displayName,
        end: endLocation.displayName
    });

    try {
        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                start: startLocation, 
                end: endLocation 
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Route service error');
        }

        const hopsText = typeof data.hops === 'number' ? data.hops.toString() : '-';
        const latencyText = typeof data.estimatedLatencyMs === 'number'
            ? data.estimatedLatencyMs.toFixed(2)
            : '-';

        setRouteStats(hopsText, latencyText);
        console.log('Route computed:', {
            hops: data.hops,
            latencyMs: data.estimatedLatencyMs,
            path: data.path
        });
    } catch (error) {
        setRouteStats('-', '-');
        console.error('Failed to send route to backend:', error);
    } finally {
        routeLoading = false;
        updateRunButtonState();
    }
}

function setupLocationInput(inputId, dropdownId, isStart) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    
    input.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (isStart) {
            startLocation = null;
        } else {
            endLocation = null;
        }
        updateRunButtonState();
        
        if (query.length < 3) {
            dropdown.classList.remove('visible');
            return;
        }
        
        dropdown.innerHTML = '<div class="dropdown-item loading">Searching...</div>';
        dropdown.classList.add('visible');
        
        try {
            const results = await locationService.search(query);
            
            if (results.length === 0) {
                dropdown.innerHTML = '<div class="dropdown-item no-results">No results found</div>';
                return;
            }
            
            dropdown.innerHTML = results.map((r, i) => `
                <div class="dropdown-item" data-index="${i}">
                    ${r.displayName}
                </div>
            `).join('');
            
            // Attach click handlers
            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    const index = parseInt(item.dataset.index);
                    const selected = results[index];
                    
                    input.value = selected.displayName.split(',')[0]; // Short name
                    dropdown.classList.remove('visible');
                    
                    if (isStart) {
                        startLocation = selected;
                        positionMarkerAtLocation(startMarker, selected.lat, selected.lon);
                        lookAtLocation(selected.lat, selected.lon);
                    } else {
                        endLocation = selected;
                        positionMarkerAtLocation(endMarker, selected.lat, selected.lon);
                        lookAtLocation(selected.lat, selected.lon);
                    }
                    
                    updateRunButtonState();
                });
            });
            
        } catch (error) {
            console.error('Search error:', error);
            dropdown.innerHTML = '<div class="dropdown-item error">Search failed</div>';
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });
    
    // Hide dropdown on escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
        }
    });
}

// ============== UI Event Handlers ==============
const satColorPicker = document.getElementById('sat-color');
const colorHexDisplay = document.getElementById('color-hex');
const altitudeToggle = document.getElementById('altitude-toggle');
const altitudeLegend = document.getElementById('altitude-legend');
const starsToggle = document.getElementById('stars-toggle');
const sizeSlider = document.getElementById('sat-size');
const sizeValue = document.getElementById('size-value');

satColorPicker.addEventListener('input', (e) => {
    const hexColor = e.target.value;
    colorHexDisplay.textContent = hexColor;
    currentSatelliteColor.set(hexColor);
    
    if (!altitudeModeEnabled) {
        updateSatelliteColors();
    }
});

altitudeToggle.addEventListener('change', (e) => {
    altitudeModeEnabled = e.target.checked;
    altitudeLegend.classList.toggle('visible', altitudeModeEnabled);
    satColorPicker.disabled = altitudeModeEnabled;
    updateSatelliteColors();
});

starsToggle.addEventListener('change', (e) => {
    starfield.visible = e.target.checked;
});

sizeSlider.addEventListener('input', (e) => {
    satelliteScale = parseFloat(e.target.value);
    sizeValue.textContent = satelliteScale.toFixed(1) + 'x';
    satelliteMeshes.forEach(mesh => {
        mesh.scale.setScalar(satelliteScale);
    });
});

// ============== Window Resize ==============
window.addEventListener('resize', () => {
    const newW = window.innerWidth;
    const newH = window.innerHeight;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
});

// ============== Animation Loop ==============
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Update marker scales based on camera distance
    updateMarkerScales();
    
    renderer.render(scene, camera);
}

// ============== Initialize ==============
initConstellation();
setupLocationInput('start-location', 'start-dropdown', true);
setupLocationInput('end-location', 'end-dropdown', false);
animate();
