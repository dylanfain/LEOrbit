import * as THREE from 'three';

export class SatelliteConnector {
    constructor(scene, parentObject = null) {
        this.scene = scene;
        this.parent = parentObject || scene;
        this.meshes = [];
        this.pointsCount = 64;
        this.activeColor = new THREE.Color(0x00f2ff);
        this.animationProgress = 0;
        this.isAnimating = false;
        this.earthRadius = 1.0;

        console.log('[SatelliteConnector] Initialized', {
            parent: this.parent.type || 'Scene',
            activeColor: this.activeColor.getHexString()
        });
    }

    toParentSpace(startVec, endVec) {
        const start = startVec.clone();
        const end = endVec.clone();

        if (this.parent !== this.scene) {
            const worldToLocal = new THREE.Matrix4();
            worldToLocal.copy(this.parent.matrixWorld).invert();
            start.applyMatrix4(worldToLocal);
            end.applyMatrix4(worldToLocal);
        }

        return { start, end };
    }

    createStraightLine(startVec, endVec, options = {}) {
        const { start, end } = this.toParentSpace(startVec, endVec);
        const useDashes = options.dashed === true;
        const radius = options.radius;

        if (!useDashes && Number.isFinite(radius) && radius > 0) {
            const curve = new THREE.LineCurve3(start.clone(), end.clone());
            const geometry = new THREE.TubeGeometry(
                curve,
                options.tubularSegments ?? Math.max(8, Math.floor(this.pointsCount / 4)),
                radius,
                options.radialSegments ?? 8,
                false
            );
            const material = new THREE.MeshBasicMaterial({
                color: options.color || this.activeColor,
                transparent: true,
                opacity: options.opacity ?? 1,
                blending: THREE.AdditiveBlending,
                depthTest: true
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.curve = curve;
            this.parent.add(mesh);
            this.meshes.push(mesh);
            return mesh;
        }

        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const material = useDashes
            ? new THREE.LineDashedMaterial({
                color: options.color || this.activeColor,
                transparent: true,
                opacity: options.opacity ?? 0.8,
                dashSize: options.dashSize ?? 0.03,
                gapSize: options.gapSize ?? 0.02
            })
            : new THREE.LineBasicMaterial({
                color: options.color || this.activeColor,
                transparent: true,
                opacity: options.opacity ?? 1
            });

        const line = new THREE.Line(geometry, material);
        line.userData.curve = new THREE.LineCurve3(start.clone(), end.clone());

        if (useDashes) {
            line.computeLineDistances();
        }

        this.parent.add(line);
        this.meshes.push(line);
        return line;
    }

    createArc(startVec, endVec, color = null) {
        console.log('[SatelliteConnector:createArc] Creating arc', {
            start: startVec.toArray(),
            end: endVec.toArray(),
            color: color ? color.getHexString() : 'default'
        });

        const { start, end } = this.toParentSpace(startVec, endVec);

        const startNorm = start.clone().normalize();
        const endNorm = end.clone().normalize();

        const axis = new THREE.Vector3().crossVectors(startNorm, endNorm).normalize();
        const angle = startNorm.angleTo(endNorm);

        console.log('[SatelliteConnector:createArc] Arc geometry', {
            angle: (angle * 180 / Math.PI).toFixed(2) + '°',
            arcLength: (angle * start.length()).toFixed(2) + ' units'
        });

        // parallel vectors
        if (angle < 0.001) {
            console.log('[SatelliteConnector:createArc] Vectors nearly parallel, using straight line');
            const line = this.createStraightLine(startVec, endVec, {
                color: color || this.activeColor,
                opacity: 1
            });

            console.log('[SatelliteConnector:createArc] Line created', {
                meshCount: this.meshes.length
            });

            return line;
        }

        // cubicBezierCurve3
        const mid1 = startNorm.clone().applyAxisAngle(axis, angle / 3);
        const mid2 = startNorm.clone().applyAxisAngle(axis, 2 * angle / 3);

        const maxAltitude = Math.max(start.length(), end.length());
        const arcHeight = maxAltitude * 1.15; // 15% above highest point

        mid1.multiplyScalar(arcHeight);
        mid2.multiplyScalar(arcHeight);

        const curve = new THREE.CubicBezierCurve3(start, mid1, mid2, end);

        console.log('[SatelliteConnector:createArc] Arc elevation', {
            startRadius: start.length().toFixed(3),
            endRadius: end.length().toFixed(3),
            mid1Radius: mid1.length().toFixed(3),
            mid2Radius: mid2.length().toFixed(3),
            earthRadius: this.earthRadius.toFixed(3),
            maxClearance: (arcHeight - this.earthRadius).toFixed(3),
            arcAngle: (angle * 180 / Math.PI).toFixed(2) + '°'
        });

        // make sure it's all above Earth
        let minDistanceToCenter = Infinity;
        for (let t = 0; t <= 1; t += 0.1) {
            const point = curve.getPoint(t);
            const distToCenter = point.length();
            if (distToCenter < minDistanceToCenter) {
                minDistanceToCenter = distToCenter;
            }
        }

        if (minDistanceToCenter < this.earthRadius) {
            // adding lift to try and visually circumvent, but console will still say this
            console.warn('[SatelliteConnector:createArc] Arc may intersect Earth!', {
                minDistance: minDistanceToCenter.toFixed(3),
                earthRadius: this.earthRadius.toFixed(3),
                deficit: (this.earthRadius - minDistanceToCenter).toFixed(3)
            });

            // the lift
            const additionalLift = (this.earthRadius - minDistanceToCenter) + 0.2;
            const liftFactor = (arcHeight + additionalLift) / arcHeight;
            mid1.multiplyScalar(liftFactor);
            mid2.multiplyScalar(liftFactor);

            console.log('[SatelliteConnector:createArc] Applied corrective lift', {
                additionalLift: additionalLift.toFixed(3),
                newMid1Radius: mid1.length().toFixed(3),
                newMid2Radius: mid2.length().toFixed(3)
            });
        } else {
            console.log('[SatelliteConnector:createArc] ✓ Arc clears Earth surface', {
                minClearance: (minDistanceToCenter - this.earthRadius).toFixed(3)
            });
        }

        const geometry = new THREE.TubeGeometry(curve, this.pointsCount, 0.005, 8, false);

        const material = new THREE.MeshBasicMaterial({
            color: color || this.activeColor,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthTest: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.curve = curve; // Store curve for animation
        this.parent.add(mesh);
        this.meshes.push(mesh);

        console.log('[SatelliteConnector:createArc] Arc mesh created', {
            meshCount: this.meshes.length,
            tubeSegments: this.pointsCount,
            color: material.color.getHexString()
        });

        return mesh;
    }

    // pulse effect
    createTravelingPulse(arcMesh, duration = 1000, color = 0xffffff) {
        if (!arcMesh.userData.curve) {
            console.warn('[SatelliteConnector:createTravelingPulse] No curve data on mesh');
            return null;
        }

        console.log('[SatelliteConnector:createTravelingPulse] Creating pulse', {
            duration: duration + 'ms'
        });

        const pulseGeo = new THREE.SphereGeometry(0.015, 16, 16);
        const pulseMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);

        this.parent.add(pulse);

        console.log('[SatelliteConnector:createTravelingPulse] Pulse created');

        return {
            mesh: pulse,
            curve: arcMesh.userData.curve,
            startTime: Date.now(),
            duration,
            active: true
        };
    }

    update() {
        if (this.meshes.length === 0) {
            return;
        }

        const pulse = 0.6 + Math.sin(Date.now() * 0.005) * 0.2;
        this.meshes.forEach(mesh => {
            if (mesh.material.opacity !== undefined) {
                mesh.material.opacity = pulse;
            }
        });
    }

    clear() {
        console.log('[SatelliteConnector:clear] Clearing meshes', {
            meshCount: this.meshes.length
        });

        this.meshes.forEach(mesh => {
            this.parent.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.meshes = [];

        console.log('[SatelliteConnector:clear] All meshes cleared');
    }

    dispose() {
        console.log('[SatelliteConnector:dispose] Disposing connector');
        this.clear();
    }
}
