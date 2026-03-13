import * as THREE from 'three';
import { SatelliteConnector } from './SatelliteConnector.js';

export class PathAnimator {
    constructor(scene, earth) {
        this.scene = scene;
        this.earth = earth;
        this.connector = new SatelliteConnector(scene, earth);
        this.pulses = [];
        this.segmentEntries = [];
        this.isAnimating = false;
        this.animationRunToken = 0;
        this.loopDelayMs = 750;
        this.defaultPulseDuration = 800;

        console.log('[PathAnimator] Initialized');
    }

    animatePath(pathSegments, options = {}) {
        console.log('[PathAnimator:animatePath] Starting animation', {
            segmentCount: pathSegments.length,
            loopDelayMs: (options.loopDelayMs ?? this.loopDelayMs) + 'ms'
        });

        this.clear();
        this.isAnimating = true;
        this.loopDelayMs = options.loopDelayMs ?? this.loopDelayMs;
        this.defaultPulseDuration = options.defaultPulseDuration ?? this.defaultPulseDuration;
        this.segmentEntries = pathSegments.map((segment, index) => {
            const mesh = segment.style === 'dashed-line' || segment.style === 'line'
                ? this.connector.createStraightLine(segment.start, segment.end, {
                    color: segment.color || new THREE.Color(0x00f2ff),
                    opacity: segment.opacity,
                    dashed: segment.style === 'dashed-line',
                    dashSize: segment.dashSize,
                    gapSize: segment.gapSize,
                    radius: segment.radius,
                    tubularSegments: segment.tubularSegments,
                    radialSegments: segment.radialSegments
                })
                : this.connector.createArc(
                    segment.start,
                    segment.end,
                    segment.color || new THREE.Color(0x00f2ff)
                );

            console.log(`[PathAnimator:animatePath] Segment ${index + 1}/${pathSegments.length} created`, {
                style: segment.style || 'arc',
                animate: segment.animate !== false
            });

            return { ...segment, mesh };
        });

        const runToken = ++this.animationRunToken;
        this.runAnimationLoop(runToken);
    }

    async runAnimationLoop(runToken) {
        const animatedSegments = this.segmentEntries.filter(segment => segment.animate !== false);

        while (this.isAnimating && runToken === this.animationRunToken) {
            for (const segment of animatedSegments) {
                if (!this.isAnimating || runToken !== this.animationRunToken) {
                    return;
                }

                const pulse = this.connector.createTravelingPulse(
                    segment.mesh,
                    segment.pulseDuration ?? this.defaultPulseDuration,
                    segment.pulseColor
                );

                if (pulse) {
                    this.pulses.push(pulse);
                }

                await this.delay(segment.pulseDuration ?? this.defaultPulseDuration);
            }

            if (animatedSegments.length === 0) {
                return;
            }

            await this.delay(this.loopDelayMs);
        }
    }

    update() {
        if (this.pulses.length === 0 && this.connector.meshes.length === 0) {
            return;
        }

        this.connector.update();
        const now = Date.now();

        this.pulses = this.pulses.filter(pulse => {
            if (!pulse.active) return false;

            const elapsed = now - pulse.startTime;
            const t = Math.min(elapsed / pulse.duration, 1);

            if (t >= 1) {
                pulse.mesh.visible = false;
                if (pulse.mesh.parent) {
                    pulse.mesh.parent.remove(pulse.mesh);
                }
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
        this.animationRunToken += 1;
        this.segmentEntries = [];
        this.connector.clear();

        // clean up
        this.pulses.forEach(pulse => {
            if (pulse.mesh.parent) {
                pulse.mesh.parent.remove(pulse.mesh);
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
