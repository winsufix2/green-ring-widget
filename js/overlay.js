import { MAP_CONFIG, GREEN_RING_PARKS } from './config.js';
import { GpsTracker } from './gps-tracker.js';
import { BpmModule } from './bpm-module.js';
import { angleToPixels, haversineDistance } from './map-projection.js';

class StreamOverlay {
  constructor() {
    this.elements = {};
    this.gpsTracker = null;
    this.bpmModule = null;
    this.ws = null;

    // Marker position state for 60fps lerp smoothing
    this.currentMarkerX = MAP_CONFIG.circleCenter.x;
    this.currentMarkerY = MAP_CONFIG.circleCenter.y - MAP_CONFIG.circleRadius;
    this.targetMarkerX = this.currentMarkerX;
    this.targetMarkerY = this.currentMarkerY;
    this.markerAngle = -90;
    this.lerpFactor = 0.08; // smooth easing

    // Stream state
    this.speedKmh = 0;
    this.baseDistanceKm = 32.0;
    this.accumulatedDistanceMeters = 0;
    this.totalDistanceKm = 32.0;
    this.lastTrackedGps = null;
    this.currentPark = 'Парк «Измайлово»';
    this.progressPercent = 20;

    // Check cap image availability
    this.capImgAvailable = false;
  }

  async init() {
    this.cacheElements();
    this.parseUrlParams();
    await this.testCapImage();
    this.initModules();
    this.initWebSocket();
    this.initKeyboardShortcuts();
    this.startRenderLoop();
    this.initDefaultLocation();

    // Auto-start live GPS tracking directly on the device
    // This allows Moblin on the streamer's phone to track location autonomously!
    this.gpsTracker.start();

    // Auto-connect to Pulsoid or HypeRate if token provided in URL (optional fallback)
    const pulsoidToken = this.urlParams.get('pulsoid');
    const hyperateId = this.urlParams.get('hyperate');
    if (pulsoidToken && this.bpmModule) {
      this.bpmModule.connectPulsoid(pulsoidToken);
    } else if (hyperateId && this.bpmModule) {
      this.bpmModule.connectHypeRate(hyperateId);
    }
  }

  cacheElements() {
    this.elements = {
      overlayRoot: document.getElementById('overlay-root'),
      mapContainer: document.getElementById('map-container'),
      mapImage: document.getElementById('map-image'),
      markerCap: document.getElementById('marker-cap'),
      markerFallback: document.getElementById('marker-fallback'),
      markerPulse: document.getElementById('marker-pulse'),
      markerWrapper: document.getElementById('marker-wrapper'),

      // Top HUD
      speedValue: document.getElementById('hud-speed-value'),
      distanceValue: document.getElementById('hud-distance-value'),
      distanceIcon: document.getElementById('hud-distance-icon'),
      bpmValue: document.getElementById('hud-bpm-value'),
      heartIcon: document.getElementById('hud-heart-icon'),
      parkBadge: document.getElementById('hud-park-badge'),
      gpsStatusPill: document.getElementById('hud-gps-pill'),
      progressFill: document.getElementById('hud-progress-fill'),
      progressText: document.getElementById('hud-progress-text'),

      // Controls overlay
      controlsPanel: document.getElementById('controls-panel'),
      btnToggleLayout: document.getElementById('btn-toggle-layout'),
      statusText: document.getElementById('status-message')
    };
  }

  parseUrlParams() {
    this.urlParams = new URLSearchParams(window.location.search);

    // Initial distance parameter (default 32.0 km)
    // Supports ?dist=32 or ?km=32 to initialize or reset distance anytime
    const paramDist = parseFloat(this.urlParams.get('dist') || this.urlParams.get('km'));
    if (!isNaN(paramDist) && paramDist >= 0) {
      this.baseDistanceKm = paramDist;
      this.totalDistanceKm = paramDist;
      this.accumulatedDistanceMeters = 0;
      try {
        localStorage.setItem('green_ring_total_dist_km', paramDist.toFixed(2));
      } catch (e) {}
    } else {
      try {
        const saved = parseFloat(localStorage.getItem('green_ring_total_dist_km'));
        if (!isNaN(saved) && saved >= 32.0) {
          this.totalDistanceKm = saved;
          this.baseDistanceKm = saved;
        } else {
          this.baseDistanceKm = 32.0;
          this.totalDistanceKm = 32.0;
        }
      } catch (e) {
        this.baseDistanceKm = 32.0;
        this.totalDistanceKm = 32.0;
      }
    }

    // Layout configuration
    const layout = this.urlParams.get('layout') || this.urlParams.get('pos') || 'default';
    if (layout === 'fullscreen') {
      this.elements.overlayRoot.classList.add('layout-fullscreen');
    } else if (layout === 'bottom-left') {
      this.elements.overlayRoot.classList.add('layout-bottom-left');
    } else if (layout === 'bottom-right') {
      this.elements.overlayRoot.classList.add('layout-bottom-right');
    } else if (layout === 'center') {
      this.elements.overlayRoot.classList.add('layout-center');
    }

    // Hide control panel for clean stream look (default: hidden, toggle with 'H')
    if (this.elements.controlsPanel) {
      if (this.urlParams.get('controls') !== '1') {
        this.elements.controlsPanel.classList.add('obs-hidden');
      }
    }
  }

  async testCapImage() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.capImgAvailable = true;
        this.elements.markerCap.src = 'cap.png';
        this.elements.markerCap.style.display = 'block';
        this.elements.markerFallback.style.display = 'none';
        resolve(true);
      };
      img.onerror = () => {
        this.capImgAvailable = false;
        this.elements.markerCap.style.display = 'none';
        this.elements.markerFallback.style.display = 'flex';
        resolve(false);
      };
      img.src = 'cap.png';
    });
  }

  initModules() {
    // Initialize GPS Tracker
    this.gpsTracker = new GpsTracker({
      onLocation: (loc) => this.handleGpsLocation(loc),
      onStatus: (status) => this.handleGpsStatus(status),
      onSpeed: (speed) => this.updateSpeedDisplay(speed)
    });

    // Initialize BPM Module (fallback)
    this.bpmModule = new BpmModule({
      onBpm: (bpm, source) => this.handleBpmUpdate(bpm, source),
      onStatus: (status) => this.handleBpmStatus(status)
    });

    // Button event bindings
    if (this.elements.btnToggleLayout) {
      this.elements.btnToggleLayout.addEventListener('click', () => this.cycleLayout());
    }
  }

  initDefaultLocation() {
    // 32 km corresponds to Park 7: Парк «Измайлово» (kmMark ~33)
    const izmaylovoPark = GREEN_RING_PARKS.find((p) => p.id === 7) || GREEN_RING_PARKS[0];
    const initialCoords = angleToPixels(izmaylovoPark.angleDeg);
    this.currentMarkerX = initialCoords.x;
    this.currentMarkerY = initialCoords.y;
    this.targetMarkerX = initialCoords.x;
    this.targetMarkerY = initialCoords.y;
    this.markerAngle = izmaylovoPark.angleDeg;

    this.updateParkInfo(izmaylovoPark.name);
    this.updateDistanceDisplay(this.totalDistanceKm);
  }

  initWebSocket() {
    // Optional WebSocket connection: if running on a server, sync with it.
    // If running standalone or server unreachable, does NOT block the widget!
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected to stream sync server');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {}
      };

      this.ws.onerror = () => {};
    } catch (e) {}
  }

  handleServerMessage(msg) {
    if (!msg) return;

    if (msg.type === 'init') {
      const state = msg.data;
      if (state.gps && state.gps.speed !== undefined) {
        this.gpsTracker.feedExternalGps(state.gps);
      }
      if (typeof state.dist === 'number') {
        this.updateDistanceDisplay(state.dist);
      }
    } else if (msg.type === 'gps') {
      this.gpsTracker.feedExternalGps(msg.data);
    } else if (msg.type === 'dist') {
      const distVal = msg.data?.value ?? msg.data;
      if (typeof distVal === 'number') {
        this.updateDistanceDisplay(distVal);
      }
    }
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toUpperCase()) {
        case 'H':
          if (this.elements.controlsPanel) {
            this.elements.controlsPanel.classList.toggle('obs-hidden');
          }
          break;
        case 'L':
          this.cycleLayout();
          break;
      }
    });
  }

  // Handle GPS location updates and automatically accumulate distance
  handleGpsLocation(loc) {
    const now = Date.now();

    // 1. Accumulate physical distance automatically via Haversine formula
    if (this.lastTrackedGps && typeof loc.lat === 'number' && typeof loc.lon === 'number') {
      const deltaM = haversineDistance(
        this.lastTrackedGps.lat,
        this.lastTrackedGps.lon,
        loc.lat,
        loc.lon
      );

      const timeDeltaSec = Math.max(0.5, (now - (this.lastTrackedGps.time || now)) / 1000);
      const impliedSpeedKmh = (deltaM / timeDeltaSec) * 3.6;

      // Filter GPS jitter: must move at least 2.5 meters, realistic speed (< 90 km/h)
      if (deltaM >= 2.5 && impliedSpeedKmh <= 90) {
        this.accumulatedDistanceMeters += deltaM;
        this.totalDistanceKm = this.baseDistanceKm + (this.accumulatedDistanceMeters / 1000);
        this.updateDistanceDisplay(this.totalDistanceKm);

        try {
          localStorage.setItem('green_ring_total_dist_km', this.totalDistanceKm.toFixed(2));
        } catch (e) {}

        this.lastTrackedGps = { lat: loc.lat, lon: loc.lon, time: now };
      } else if (deltaM < 2.5) {
        this.lastTrackedGps.time = now;
      }
    } else if (typeof loc.lat === 'number' && typeof loc.lon === 'number') {
      this.lastTrackedGps = { lat: loc.lat, lon: loc.lon, time: now };
    }

    // 2. Project marker onto ring
    const proj = loc.projection;
    if (proj) {
      this.targetMarkerX = proj.x;
      this.targetMarkerY = proj.y;
      this.markerAngle = proj.angleDeg;
      this.updateParkInfo(proj.currentPark);
    }

    if (this.elements.gpsStatusPill) {
      this.elements.gpsStatusPill.className = 'hud-pill status-live';
      this.elements.gpsStatusPill.innerHTML = '<span class="status-dot"></span>GPS LIVE';
    }
  }

  handleGpsStatus(status) {
    if (!this.elements.gpsStatusPill) return;

    if (status.type === 'live') {
      this.elements.gpsStatusPill.className = 'hud-pill status-live';
      this.elements.gpsStatusPill.innerHTML = '<span class="status-dot"></span>GPS LIVE';
    } else if (status.type === 'warning') {
      this.elements.gpsStatusPill.className = 'hud-pill status-retained';
      this.elements.gpsStatusPill.innerHTML = '<span class="status-dot"></span>GPS СОХРАНЁН';
    } else if (status.type === 'searching') {
      this.elements.gpsStatusPill.className = 'hud-pill status-waiting';
      this.elements.gpsStatusPill.innerHTML = '<span class="status-dot"></span>GPS ПОИСК...';
    }
  }

  // Handle BPM updates (safe fallback if still used anywhere)
  handleBpmUpdate(bpm, source) {
    if (this.elements.bpmValue) {
      this.elements.bpmValue.textContent = Math.max(0, bpm);
    }
  }

  handleBpmStatus(status) {}

  updateSpeedDisplay(speed) {
    this.speedKmh = speed;
    if (this.elements.speedValue) {
      this.elements.speedValue.textContent = speed.toFixed(1);
    }
  }

  updateDistanceDisplay(distKm) {
    this.totalDistanceKm = distKm;
    if (this.elements.distanceValue) {
      this.elements.distanceValue.textContent = distKm.toFixed(1);
    }

    // Route Progress: 160 km total
    const progressPct = Math.min(100, Math.max(0, Math.round((distKm / MAP_CONFIG.totalRouteLengthKm) * 100)));
    this.progressPercent = progressPct;

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${progressPct}%`;
    }
    if (this.elements.progressText) {
      this.elements.progressText.textContent = `${progressPct}%`;
    }
  }

  updateParkInfo(parkName) {
    this.currentPark = parkName;
    if (this.elements.parkBadge) {
      this.elements.parkBadge.textContent = `📍 ${parkName}`;
    }
  }

  cycleLayout() {
    const layouts = ['', 'layout-bottom-left', 'layout-bottom-right', 'layout-center', 'layout-fullscreen'];
    const currentIdx = layouts.findIndex((cls) => cls && this.elements.overlayRoot.classList.contains(cls));
    const nextIdx = (currentIdx + 1) % layouts.length;

    layouts.forEach((cls) => {
      if (cls) this.elements.overlayRoot.classList.remove(cls);
    });

    if (layouts[nextIdx]) {
      this.elements.overlayRoot.classList.add(layouts[nextIdx]);
    }
  }

  startRenderLoop() {
    const render = () => {
      this.currentMarkerX += (this.targetMarkerX - this.currentMarkerX) * this.lerpFactor;
      this.currentMarkerY += (this.targetMarkerY - this.currentMarkerY) * this.lerpFactor;

      const pctX = (this.currentMarkerX / MAP_CONFIG.imageWidth) * 100;
      const pctY = (this.currentMarkerY / MAP_CONFIG.imageHeight) * 100;

      if (this.elements.markerWrapper) {
        this.elements.markerWrapper.style.left = `${pctX.toFixed(3)}%`;
        this.elements.markerWrapper.style.top = `${pctY.toFixed(3)}%`;
      }

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.streamOverlay = new StreamOverlay();
  window.streamOverlay.init();
});
