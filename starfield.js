import * as THREE from 'three';

/**
 * Shared starfield background module
 * Used by both the 3D visualization and analytics pages
 */

 //Create a starfield Points object for use in a Three.js scene
export function createStarfield({ count = 5000, minRadius = 400, radiusSpread = 100, size = 1.2 } = {}) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i += 3) {
        const radius = minRadius + Math.random() * radiusSpread;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size,
        sizeAttenuation: true
    });

    const starfield = new THREE.Points(geometry, material);
    starfield.name = 'starfield';
    return starfield;
}

/**
 * Initialize a standalone star background in a container element
 * Used by pages that don't have their own Three.js scene (e.g. analytics)
 */
export function initStarBackground(container) {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const starfield = createStarfield();
    scene.add(starfield);

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, starfield };
}