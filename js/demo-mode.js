import { MAP_CONFIG, GREEN_RING_PARKS } from './config.js';
import { angleToPixels, shortestAngleDiffDeg } from './map-projection.js';

export class DemoMode {
  constructor(options = {}) {
    this.onFrame = options.onFrame || (() => {});
    this.onSpeedChange = options.onSpeedChange || (() => {});
    this.onBpmHint = options.onBpmHint || (() => {});

    this.isActive = false;
    this.animFrameId = null;

    // Start at top: Ботанический сад (-91.4 deg)
    this.currentAngleDeg = GREEN_RING_PARKS[0].angleDeg;

    // Tour duration for 1 full loop in seconds (default: 75 seconds for a complete scenic 360° tour)
    this.tourDurationSec = options.tourDurationSec || 75;

    // Realistic displayed metrics
    this.baseSpeedKmh = 6.2;
    this.currentSpeedKmh = 6.2;

    this.lastTimestamp = 0;
    this.phase = 0;
    this.totalDistanceKm = 0;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.lastTimestamp = performance.now();
    this.loop = this.loop.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.isActive = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      this.start();
    }
    return this.isActive;
  }

  setTourDuration(sec) {
    this.tourDurationSec = Math.max(10, Math.min(600, sec));
  }

  loop(now) {
    if (!this.isActive) return;

    if (!this.lastTimestamp) this.lastTimestamp = now;
    const dtSeconds = Math.min(0.1, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;

    // Animate phase for organic speed fluctuations (walking up hills, jogging stretches)
    this.phase += dtSeconds * 0.6;
    const wave = Math.sin(this.phase) * 2.8 + Math.sin(this.phase * 2.3) * 1.2;
    this.currentSpeedKmh = Math.max(4.0, Math.min(13.5, this.baseSpeedKmh + wave));

    // Calculate angular advance for scenic tour
    const degPerSec = 360 / this.tourDurationSec;
    const stepDeg = degPerSec * dtSeconds;

    // Advance angle clockwise
    this.currentAngleDeg += stepDeg;
    if (this.currentAngleDeg > 180) {
      this.currentAngleDeg -= 360;
    }

    // Determine current park, next park and progress
    const { currentPark, nextPark, progressPercent } = this.calculateParkStatus(this.currentAngleDeg);
    const progressKm = ((progressPercent / 100) * MAP_CONFIG.totalRouteLengthKm).toFixed(1);

    // Compute pixel coordinates on circular map
    const coords = angleToPixels(this.currentAngleDeg);

    // Notify listeners
    const displaySpeed = Math.round(this.currentSpeedKmh * 10) / 10;
    this.onBpmHint(this.currentSpeedKmh);
    this.onSpeedChange(displaySpeed);

    this.onFrame({
      ...coords,
      speed: displaySpeed,
      currentPark,
      nextPark,
      progressPercent,
      progressKm,
      isDemo: true
    });

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  calculateParkStatus(angleDeg) {
    const numParks = GREEN_RING_PARKS.length;
    let closestPark = GREEN_RING_PARKS[0];
    let minDiff = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < numParks; i++) {
      const p = GREEN_RING_PARKS[i];
      const diff = Math.abs(shortestAngleDiffDeg(angleDeg, p.angleDeg));
      if (diff < minDiff) {
        minDiff = diff;
        closestPark = p;
        closestIdx = i;
      }
    }

    const nextPark = GREEN_RING_PARKS[(closestIdx + 1) % numParks];

    // Calculate clockwise progress from start (Ботанический сад, -91.4 deg)
    const startAngle = GREEN_RING_PARKS[0].angleDeg;
    let cwDeg = angleDeg - startAngle;
    if (cwDeg < 0) cwDeg += 360;
    const progressPercent = Math.min(100, Math.max(0, Math.round((cwDeg / 360) * 100)));

    return {
      currentPark: closestPark.name,
      nextPark: nextPark.name,
      progressPercent
    };
  }
}
