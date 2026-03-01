import * as THREE from 'three';
import { SatelliteConnector } from './SatelliteConnector.js';

export class PathAnimator {
    constructor(scene, earth) {
        this.scene = scene;
        this.earth = earth;
        this.connector = new SatelliteConnector(scene, earth);
        this.pulses = [];
        this.isAnimating = false;

        console.log('[PathAnimator] Initialized');
    }

    async animatePath(pathSegments, delayBetweenHops = 300) {
        console.log('[PathAnimator:animatePath] Starting animation', {
            segmentCount: pathSegments.length,
            delayBetweenHops: delayBetweenHops + 'ms'
        });

        this.clear();
        this.isAnimating = true;

        for (let i = 0; i < pathSegments.length; i++) {
            if (!this.isAnimating) {
                console.log('[PathAnimator:animatePath] Animation interrupted');
                break;
            }

            const segment = pathSegments[i];

            console.log(`[PathAnimator:animatePath] Drawing segment ${i + 1}/${pathSegments.length}`, {
                startPos: segment.start.toArray(),
                endPos: segment.end.toArray(),
                color: segment.color ? segment.color.getHexString() : 'default',
                distance: segment.start.distanceTo(segment.end).toFixed(2) + ' units'
            });

            // create arc for segment
            const arc = this.connector.createArc(
                segment.start,
                segment.end,
                segment.color || new THREE.Color(0x00f2ff)
            );

            console.log(`[PathAnimator:animatePath] Arc created for segment ${i + 1}`);

            // traveling pulse animation
            const pulse = this.connector.createTravelingPulse(arc, 800);
            if (pulse) {
                this.pulses.push(pulse);
                console.log(`[PathAnimator:animatePath] Pulse added for segment ${i + 1}`, {
                    activePulses: this.pulses.length
                });
            }

            // delay before next hop
            if (i < pathSegments.length - 1) {
                console.log(`[PathAnimator:animatePath] Waiting ${delayBetweenHops}ms before next hop`);
                await this.delay(delayBetweenHops);
            }
        }

        console.log('[PathAnimator:animatePath] Animation sequence complete', {
            totalSegments: pathSegments.length,
            activePulses: this.pulses.length
        });
    }

    update() {
        this.connector.update();
        const now = Date.now();
        const initialPulseCount = this.pulses.length;

        this.pulses = this.pulses.filter(pulse => {
            if (!pulse.active) return false;

            const elapsed = now - pulse.startTime;
            const t = Math.min(elapsed / pulse.duration, 1);

            if (t >= 1) {
                pulse.mesh.visible = false;
                this.scene.remove(pulse.mesh);
                pulse.mesh.geometry.dispose();
                pulse.mesh.material.dispose();
                return false;
            }

            // pulse along curve
            const position = pulse.curve.getPoint(t);
            pulse.mesh.position.copy(position);

            // pulse fades near end
            pulse.mesh.material.opacity = t < 0.8 ? 1 : (1 - t) * 5;

            return true;
        });

    }

    clear() {
        console.log('[PathAnimator:clear] Clearing animation', {
            activePulses: this.pulses.length,
            isAnimating: this.isAnimating
        });

        this.isAnimating = false;
        this.connector.clear();

        // clean up
        this.pulses.forEach(pulse => {
            if (pulse.mesh.parent) {
                this.scene.remove(pulse.mesh);
            }
            pulse.mesh.geometry.dispose();
            pulse.mesh.material.dispose();
        });
        this.pulses = [];

        console.log('[PathAnimator:clear] Animation cleared');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispose() {
        console.log('[PathAnimator:dispose] Disposing animator');
        this.clear();
        this.connector.dispose();
    }
}
