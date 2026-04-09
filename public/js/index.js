import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { loadConstellation } from './satellite-client.js';
import { LocationService } from './LocationService.js';
import { createStarfield } from './starfield.js';
import { PathAnimator } from './PathAnimator.js';
import {
    clearRoutePayload,
    isNarrowScreen,
    loadRoutePayload,
    loadRouteUiState,
    saveRoutePayload,
    saveRouteUiState
} from './route-session.js';

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

// ============== Path Animator ==============
const pathAnimator = new PathAnimator(scene, earth);

// ============== Lighting ==============
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemiLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// ============== Location Markers ==============
const BASE_MARKER_SCALE = 0.06;
const REFERENCE_DISTANCE = 2.0; // Camera distance at which markers are "normal" size
const MARKER_SCALE_EPSILON = 0.0001;
const LOCATION_SEARCH_DEBOUNCE_MS = 180;

function createLocationMarker(texturePath) {
    const texture = textureLoader.load(texturePath);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
    });
    const marker = new THREE.Sprite(material);
    marker.center.set(0.5, 0); // Bottom-center pin tip sits exactly at marker position
    marker.visible = false;
    scene.add(marker);
    return marker;
}

const startMarker = createLocationMarker('/textures/location_start.png');
const endMarker = createLocationMarker('/textures/location_end.png');
let lastMarkerScale = null;

const routeStats = {
    hops: document.getElementById('route-hops'),
    latency: document.getElementById('route-latency')
};
const panelToggleButton = document.getElementById('panel-toggle-btn');

const ALGORITHM_KEYS = ['hop', 'latency', 'bandwidth'];
const ALGORITHM_ROUTE_STYLES = Object.freeze({
    hop: {
        label: 'Hop Count',
        color: new THREE.Color(0xc540ff),
        pulseColor: new THREE.Color(0xf08cff)
    },
    latency: {
        label: 'Latency',
        color: new THREE.Color(0xffc740),
        pulseColor: new THREE.Color(0xffe18f)
    },
    bandwidth: {
        label: 'Bandwidth',
        color: new THREE.Color(0x40d2ff),
        pulseColor: new THREE.Color(0x96eaff)
    }
});
const MULTI_ROUTE_HIGHLIGHT_COLOR = new THREE.Color(0xffffff);
const selectedAlgorithms = new Set(['hop']);
let currentRouteData = null;
let isPanelCollapsed = false;

function getDisplayedHopCount(routePayload) {
    if (typeof routePayload?.hops === 'number') {
        return routePayload.hops;
    }

    if (Array.isArray(routePayload?.path) && routePayload.path.length > 0) {
        return routePayload.path.length + 1;
    }

    return null;
}

function setRouteStats(hopsText = '-', latencyText = '-') {
    if (routeStats.hops) {
        routeStats.hops.textContent = hopsText;
    }
    if (routeStats.latency) {
        routeStats.latency.textContent = latencyText;
    }
}

function getSelectedAlgorithmsList() {
    return ALGORITHM_KEYS.filter((algorithm) => selectedAlgorithms.has(algorithm));
}

function getSingleSelectedRoute() {
    const selected = getSelectedAlgorithmsList();
    if (selected.length !== 1) {
        return null;
    }

    return currentRouteData?.algorithms?.[selected[0]] ?? null;
}

function updateRouteStatsForSelection() {
    const route = getSingleSelectedRoute();
    if (!route) {
        setRouteStats('-', '-');
        return;
    }

    const displayedHops = getDisplayedHopCount(route);
    const hopsText = displayedHops !== null ? displayedHops.toString() : '-';
    const latencyText = typeof route.estimatedLatencyMs === 'number'
        ? route.estimatedLatencyMs.toFixed(2)
        : '-';

    setRouteStats(hopsText, latencyText);
}

function renderSelectedRoutes() {
    pathAnimator.clear();
    clearHighlightedSatellites();

    const selected = getSelectedAlgorithmsList();
    updateRouteStatsForSelection();

    if (!currentRouteData || selected.length === 0) {
        return;
    }

    highlightSatellitesFromRoutes(currentRouteData, selected);

    const pathSegments = selected.flatMap((algorithm) =>
        buildRouteSegmentsForAlgorithm(currentRouteData.algorithms?.[algorithm], algorithm)
    );

    if (pathSegments.length > 0) {
        pathAnimator.animatePath(pathSegments, {
            defaultPulseDuration: ROUTE_SEGMENT_TRAVEL_MS,
            loopDelayMs: ROUTE_LOOP_DELAY_MS
        });
    }
}

function persistRouteUiState() {
    saveRouteUiState({
        selectedAlgorithms: getSelectedAlgorithmsList(),
        panelCollapsed: isPanelCollapsed
    });
}

function syncPanelToggleUi() {
    const isCollapsed = isNarrowScreen() && isPanelCollapsed;
    document.body.classList.toggle('panel-collapsed', isCollapsed);

    if (panelToggleButton) {
        panelToggleButton.textContent = isCollapsed ? 'Show Controls' : 'Hide Controls';
        panelToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
    }
}

function setPanelCollapsed(nextValue, { persist = true } = {}) {
    isPanelCollapsed = Boolean(nextValue);
    syncPanelToggleUi();

    if (persist) {
        persistRouteUiState();
    }
}

function hydrateRouteFromSession() {
    const savedRoute = loadRoutePayload();
    const savedUiState = loadRouteUiState();
    if (!savedRoute?.startLocation || !savedRoute?.endLocation || !savedRoute?.algorithms) {
        return;
    }

    selectedAlgorithms.clear();
    const restoredAlgorithms = Array.isArray(savedUiState?.selectedAlgorithms) && savedUiState.selectedAlgorithms.length > 0
        ? savedUiState.selectedAlgorithms
        : ['hop'];

    restoredAlgorithms.forEach((algorithm) => {
        if (ALGORITHM_KEYS.includes(algorithm)) {
            selectedAlgorithms.add(algorithm);
        }
    });

    if (selectedAlgorithms.size === 0) {
        selectedAlgorithms.add('hop');
    }

    isPanelCollapsed = Boolean(savedUiState?.panelCollapsed);
    syncPanelToggleUi();

    document.querySelectorAll('.algorithm-btn').forEach((button) => {
        const algorithm = button.dataset.algorithm;
        button.classList.toggle('active', Boolean(algorithm && selectedAlgorithms.has(algorithm)));
    });

    currentRouteData = savedRoute;
    startLocation = savedRoute.startLocation;
    endLocation = savedRoute.endLocation;

    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');

    if (startInput && startLocation?.displayName) {
        startInput.value = startLocation.displayName.split(',')[0];
    }

    if (endInput && endLocation?.displayName) {
        endInput.value = endLocation.displayName.split(',')[0];
    }

    if (Number.isFinite(Number(startLocation?.lat)) && Number.isFinite(Number(startLocation?.lon))) {
        positionMarkerAtLocation(startMarker, startLocation.lat, startLocation.lon);
    }

    if (Number.isFinite(Number(endLocation?.lat)) && Number.isFinite(Number(endLocation?.lon))) {
        positionMarkerAtLocation(endMarker, endLocation.lat, endLocation.lon);
        lookAtLocation(endLocation.lat, endLocation.lon);
    }

    renderSelectedRoutes();
    updateRunButtonState();
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
    marker.visible = true;
}

function lookAtLocation(lat, lon) {
    const cameraPos = latLonToVector3(lat, lon, 3.0);

    camera.position.copy(cameraPos);
    camera.lookAt(0, 0, 0);  // Always look at Earth center
    controls.update();
}

function updateMarkerScales() {
    const cameraDistance = camera.position.length();
    const scale = (cameraDistance / REFERENCE_DISTANCE) * BASE_MARKER_SCALE;

    if (lastMarkerScale !== null && Math.abs(scale - lastMarkerScale) < MARKER_SCALE_EPSILON) {
        return;
    }

    startMarker.scale.setScalar(scale);
    endMarker.scale.setScalar(scale);
    lastMarkerScale = scale;
}

// ============== Satellite Configuration ==============
const satelliteGeo = new THREE.SphereGeometry(0.005, 8, 8);
let satelliteScale = 0.5;
let currentSatelliteColor = new THREE.Color(0xffffff);
let altitudeModeEnabled = false;
let minAltitude = 0;
let maxAltitude = 0;

const satelliteMeshes = []; // Three.js meshes
const satelliteMeshById = new Map();
let constellation = null;   // Loaded by loadConstellation()

// ============== Route Highlighting ==============
const ROUTE_HIGHLIGHT_SCALE_MULTIPLIER = 2.0;
const ROUTE_LOOP_DELAY_MS = 750;
const ROUTE_SEGMENT_TRAVEL_MS = 800;
const routeHighlightHaloGeo = new THREE.SphereGeometry(0.01, 12, 12);
let highlightedSatIds = new Set(); // ids of local meshes highlighted (for UI updates)
let highlightAlgorithmsBySatId = new Map();

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

function applyBaseSatelliteStyle(mesh) {
    const node = mesh.userData.node;
    const altitude = node.getGeodeticDegrees()?.altitude || 0;

    if (altitudeModeEnabled) mesh.material.color.copy(getAltitudeColor(altitude));
    else mesh.material.color.copy(currentSatelliteColor);

    mesh.scale.setScalar(satelliteScale);
    toggleRouteHighlightHalo(mesh, false);
}

function ensureRouteHighlightHalo(mesh, color = MULTI_ROUTE_HIGHLIGHT_COLOR) {
    if (!mesh.userData.routeHighlightHalo) {
        const haloMaterial = new THREE.MeshBasicMaterial({
            color: color.clone(),
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const halo = new THREE.Mesh(routeHighlightHaloGeo, haloMaterial);
        halo.scale.setScalar(1.9);
        halo.visible = false;
        mesh.add(halo);
        mesh.userData.routeHighlightHalo = halo;
    }

    mesh.userData.routeHighlightHalo.material.color.copy(color);
    return mesh.userData.routeHighlightHalo;
}

function toggleRouteHighlightHalo(mesh, isVisible, color = MULTI_ROUTE_HIGHLIGHT_COLOR) {
    if (isVisible) {
        ensureRouteHighlightHalo(mesh, color).visible = true;
        return;
    }

    if (mesh.userData.routeHighlightHalo) {
        mesh.userData.routeHighlightHalo.visible = false;
    }
}

function getMeshHighlightColor(mesh) {
    const id = Number(mesh?.userData?.node?.id);
    const algorithms = highlightAlgorithmsBySatId.get(id);

    if (!algorithms || algorithms.size === 0) {
        return null;
    }

    if (algorithms.size > 1) {
        return MULTI_ROUTE_HIGHLIGHT_COLOR;
    }

    const [algorithm] = algorithms;
    return ALGORITHM_ROUTE_STYLES[algorithm]?.color ?? MULTI_ROUTE_HIGHLIGHT_COLOR;
}

function applyHighlightedSatelliteStyle(mesh) {
    const highlightColor = getMeshHighlightColor(mesh) ?? MULTI_ROUTE_HIGHLIGHT_COLOR;
    mesh.material.color.copy(highlightColor);
    mesh.scale.setScalar(satelliteScale * ROUTE_HIGHLIGHT_SCALE_MULTIPLIER);
    toggleRouteHighlightHalo(mesh, true, highlightColor);
}

function isSatHighlighted(mesh) {
    const id = Number(mesh?.userData?.node?.id);
    return Number.isFinite(id) && highlightedSatIds.has(id);
}

function clearHighlightedSatellites() {
    highlightedSatIds.clear();
    highlightAlgorithmsBySatId.clear();
    satelliteMeshes.forEach(applyBaseSatelliteStyle);
}

function updateSatelliteColors() {
    // Respect highlighting (don't overwrite route sats when toggling modes/colors)
    satelliteMeshes.forEach((mesh) => {
        if (isSatHighlighted(mesh)) {
            applyHighlightedSatelliteStyle(mesh);
            return;
        }
        applyBaseSatelliteStyle(mesh);
    });
}

// Convert backend satellite position -> scene vector (Earth radius ~ 1.0 units)
function satPosToVector3(pos) {
    const R_EARTH_KM = 6371;
    return latLonToVector3(
        Number(pos.lat),
        Number(pos.lon),
        1 + (Number(pos.altitude || 0) / R_EARTH_KM)
    );
}

// Find nearest satellite mesh to a world position
function findNearestSatelliteMesh(worldPos, maxDistance = 0.03) {
    let bestMesh = null;
    let bestDist = Infinity;

    for (const mesh of satelliteMeshes) {
        const d = mesh.position.distanceTo(worldPos);
        if (d < bestDist) {
            bestDist = d;
            bestMesh = mesh;
        }
    }

    if (!bestMesh || bestDist > maxDistance) return null;
    return bestMesh;
}

function addHighlightedSatelliteFromRoute(algorithm, satelliteId, satellitePosition) {
    if (!satellitePosition) return false;
    if (!Number.isFinite(Number(satellitePosition.lat)) || !Number.isFinite(Number(satellitePosition.lon))) return false;

    const v = satPosToVector3(satellitePosition);
    const id = Number(satelliteId);
    let mesh = Number.isFinite(id) ? satelliteMeshById.get(id) : null;

    if (!mesh) {
        mesh = findNearestSatelliteMesh(v, 0.08);
    }
    if (!mesh) return false;

    mesh.position.copy(v);

    const meshId = Number(mesh.userData.node.id);
    highlightedSatIds.add(meshId);

    if (!highlightAlgorithmsBySatId.has(meshId)) {
        highlightAlgorithmsBySatId.set(meshId, new Set());
    }
    highlightAlgorithmsBySatId.get(meshId).add(algorithm);

    return true;
}

function highlightSatellitesFromRoutes(routePayload, algorithmsToDisplay) {
    highlightedSatIds.clear();
    highlightAlgorithmsBySatId.clear();

    let matched = 0;
    let requested = 0;

    for (const algorithm of algorithmsToDisplay) {
        const route = routePayload?.algorithms?.[algorithm];
        const satelliteIds = route?.path ?? [];
        const satellitePositions = route?.satellitePositions ?? [];

        requested += satellitePositions.length;

        for (let i = 0; i < satellitePositions.length; i++) {
            if (addHighlightedSatelliteFromRoute(algorithm, satelliteIds[i], satellitePositions[i])) {
                matched++;
            }
        }
    }

    satelliteMeshes.forEach((mesh) => {
        if (highlightedSatIds.has(Number(mesh.userData.node.id))) {
            applyHighlightedSatelliteStyle(mesh);
        } else {
            applyBaseSatelliteStyle(mesh);
        }
    });

    console.log('[route:highlight] highlighted:', matched, '/', requested);
}

// ============== Route Visualization ==============
function buildRouteSegmentsForAlgorithm(route, algorithm) {
    const satelliteIds = route?.path;
    const satellitePositions = route?.satellitePositions;
    if (!Array.isArray(satelliteIds) || satelliteIds.length < 1) return [];
    if (!Array.isArray(satellitePositions) || satellitePositions.length < 1) return [];

    const style = ALGORITHM_ROUTE_STYLES[algorithm] ?? ALGORITHM_ROUTE_STYLES.hop;
    const R_EARTH_KM = 6371;
    const pathSegments = [];
    const firstSat = satellitePositions[0];
    const lastSat = satellitePositions[satellitePositions.length - 1];

    if (startLocation && firstSat) {
        pathSegments.push({
            start: latLonToVector3(startLocation.lat, startLocation.lon, 1.005),
            end: latLonToVector3(firstSat.lat, firstSat.lon, 1 + (Number(firstSat.altitude ?? 0) / R_EARTH_KM)),
            color: style.color,
            style: 'line',
            animate: false,
            opacity: 0.35,
            radius: 0.0035
        });
    }

    for (let i = 0; i < satelliteIds.length - 1; i++) {
        const from = satellitePositions[i];
        const to = satellitePositions[i + 1];
        if (!from || !to) continue;

        const fromPos = latLonToVector3(from.lat, from.lon, 1 + (Number(from.altitude ?? 0) / R_EARTH_KM));
        const toPos = latLonToVector3(to.lat, to.lon, 1 + (Number(to.altitude ?? 0) / R_EARTH_KM));
        pathSegments.push({
            start: fromPos,
            end: toPos,
            color: style.color,
            pulseColor: style.pulseColor,
            style: 'arc',
            animate: true,
            pulseDuration: ROUTE_SEGMENT_TRAVEL_MS
        });
    }

    if (endLocation && lastSat) {
        pathSegments.push({
            start: latLonToVector3(lastSat.lat, lastSat.lon, 1 + (Number(lastSat.altitude ?? 0) / R_EARTH_KM)),
            end: latLonToVector3(endLocation.lat, endLocation.lon, 1.005),
            color: style.color,
            style: 'line',
            animate: false,
            opacity: 0.35,
            radius: 0.0035
        });
    }

    return pathSegments;
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
            satelliteMeshById.set(Number(satNode.id), mesh);
        });

        console.log(`Positioned ${satelliteMeshes.length} satellites`);

        // Update UI
        document.getElementById('sat-count').textContent = satelliteMeshes.length.toLocaleString();
        document.getElementById('loading').classList.add('hidden');
        hydrateRouteFromSession();

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
syncPanelToggleUi();

panelToggleButton?.addEventListener('click', () => {
    setPanelCollapsed(!isPanelCollapsed);
});

// Send route data to backend
async function sendRouteToBackend() {
    if (!startLocation || !endLocation) {
        return;
    }

    routeLoading = true;
    updateRunButtonState();

    // Clear existing visuals
    pathAnimator.clear();
    clearHighlightedSatellites();

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
                end: endLocation,
                algorithm: 'hop'
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Route service error');
        }

        currentRouteData = data;
        saveRoutePayload(data);
        persistRouteUiState();
        renderSelectedRoutes();
        console.log('Routes computed:', Object.keys(data.algorithms ?? {}));
    } catch (error) {
        currentRouteData = null;
        clearRoutePayload();
        pathAnimator.clear();
        clearHighlightedSatellites();
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
    let activeSearchToken = 0;
    let debounceTimer = null;

    input.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (isStart) {
            startLocation = null;
        } else {
            endLocation = null;
        }
        updateRunButtonState();

        if (query.length < 3) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            activeSearchToken += 1;
            dropdown.classList.remove('visible');
            return;
        }

        dropdown.innerHTML = '<div class="dropdown-item loading">Searching...</div>';
        dropdown.classList.add('visible');

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        const searchToken = ++activeSearchToken;

        debounceTimer = setTimeout(async () => {
            try {
                const results = await locationService.search(query);

                if (searchToken !== activeSearchToken || input.value !== query) {
                    return;
                }

                if (results.length === 0) {
                    dropdown.innerHTML = '<div class="dropdown-item no-results">No results found</div>';
                    return;
                }

                dropdown.innerHTML = results.map((r, i) => `
                    <div class="dropdown-item" data-index="${i}">
                        ${r.displayName}
                    </div>
                `).join('');

                dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const index = parseInt(item.dataset.index, 10);
                        const selected = results[index];

                        input.value = selected.displayName.split(',')[0]; // Short name
                        dropdown.classList.remove('visible');
                        activeSearchToken += 1;

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
                if (searchToken !== activeSearchToken) {
                    return;
                }

                console.error('Search error:', error);
                dropdown.innerHTML = '<div class="dropdown-item error">Search failed</div>';
            }
        }, LOCATION_SEARCH_DEBOUNCE_MS);
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

    // Preserve highlight multiplier when resizing
    satelliteMeshes.forEach((mesh) => {
        if (isSatHighlighted(mesh)) {
            applyHighlightedSatelliteStyle(mesh);
            return;
        }

        mesh.scale.setScalar(satelliteScale);
    });
});

// Algorithm selection
const algorithmButtons = document.querySelectorAll('.algorithm-btn');
algorithmButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const algorithm = e.currentTarget.dataset.algorithm;
        if (!algorithm) return;

        if (selectedAlgorithms.has(algorithm)) {
            selectedAlgorithms.delete(algorithm);
        } else {
            selectedAlgorithms.add(algorithm);
        }

        e.currentTarget.classList.toggle('active', selectedAlgorithms.has(algorithm));
        persistRouteUiState();
        renderSelectedRoutes();
    });
});

// ============== Window Resize ==============
window.addEventListener('resize', () => {
    const newW = window.innerWidth;
    const newH = window.innerHeight;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
    syncPanelToggleUi();
});

// ============== Animation Loop ==============
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update marker scales based on camera distance
    updateMarkerScales();

    // Update route animation pulses
    pathAnimator.update();

    renderer.render(scene, camera);
}

// ============== Initialize ==============
initConstellation();
setupLocationInput('start-location', 'start-dropdown', true);
setupLocationInput('end-location', 'end-dropdown', false);
animate();
