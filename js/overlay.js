import { MAP_CONFIG, GREEN_RING_PARKS } from './config.js';
import { GpsTracker } from './gps-tracker.js';
import { BpmModule } from './bpm-module.js';
import { angleToPixels } from './map-projection.js';

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
    this.bpmValue = 0;
    this.currentPark = 'Ожидание сигнала...';
    this.progressPercent = 0;

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

    // Auto-connect to Pulsoid or HypeRate if token provided in URL
    const pulsoidToken = this.urlParams.get('pulsoid');
    const hyperateId = this.urlParams.get('hyperate');
    if (pulsoidToken) {
      this.bpmModule.connectPulsoid(pulsoidToken);
    } else if (hyperateId) {
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
      bpmValue: document.getElementById('hud-bpm-value'),
      heartIcon: document.getElementById('hud-heart-icon'),
      parkBadge: document.getElementById('hud-park-badge'),
      gpsStatusPill: document.getElementById('hud-gps-pill'),
      bpmStatusPill: document.getElementById('hud-bpm-pill'),
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

    // Initialize BPM Module
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
    const def = GREEN_RING_PARKS[0];
    const initialCoords = angleToPixels(def.angleDeg);
    this.currentMarkerX = initialCoords.x;
    this.currentMarkerY = initialCoords.y;
    this.targetMarkerX = initialCoords.x;
    this.targetMarkerY = initialCoords.y;
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
      if (state.bpm && state.bpm.value > 0) {
        this.handleBpmUpdate(state.bpm.value, state.bpm.source);
      }
      if (state.gps && state.gps.speed !== undefined) {
        this.gpsTracker.feedExternalGps(state.gps);
      }
    } else if (msg.type === 'gps') {
      this.gpsTracker.feedExternalGps(msg.data);
    } else if (msg.type === 'bpm') {
      const bpmVal = msg.data?.value ?? msg.data;
      this.handleBpmUpdate(bpmVal, msg.data?.source || 'remote');
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

  // Handle GPS location updates
  handleGpsLocation(loc) {
    const proj = loc.projection;
    if (proj) {
      this.targetMarkerX = proj.x;
      this.targetMarkerY = proj.y;
      this.markerAngle = proj.angleDeg;
      this.updateParkInfo(proj.currentPark, proj.progressPercent);
    }

    this.elements.gpsStatusPill.className = 'hud-pill status-live';
    this.elements.gpsStatusPill.innerHTML = '<span class="status-dot"></span>GPS LIVE';
  }

  handleGpsStatus(status) {
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

  // Handle BPM updates
  handleBpmUpdate(bpm, source) {
    this.bpmValue = Math.max(0, bpm);
    this.elements.bpmValue.textContent = this.bpmValue;

    if (this.bpmValue > 30) {
      const beatIntervalSec = 60 / this.bpmValue;
      this.elements.heartIcon.style.animationDuration = `${beatIntervalSec.toFixed(2)}s`;
      this.elements.heartIcon.classList.add('beating');

      if (this.bpmValue >= 160) {
        this.elements.bpmValue.style.color = '#ff1744';
      } else if (this.bpmValue >= 140) {
        this.elements.bpmValue.style.color = '#ff9100';
      } else if (this.bpmValue >= 115) {
        this.elements.bpmValue.style.color = '#00e676';
      } else {
        this.elements.bpmValue.style.color = '#ffffff';
      }

      this.elements.bpmStatusPill.className = 'hud-pill status-live';
      this.elements.bpmStatusPill.innerHTML = `<span class="status-dot"></span>BPM: ${source.toUpperCase()}`;
    } else {
      this.elements.heartIcon.classList.remove('beating');
      this.elements.bpmValue.style.color = '#888888';
      this.elements.bpmStatusPill.className = 'hud-pill status-waiting';
      this.elements.bpmStatusPill.innerHTML = '<span class="status-dot"></span>BPM: ОЖИДАНИЕ';
    }
  }

  handleBpmStatus(status) {
    if (status.type === 'connected') {
      console.log('[BPM]', status.message);
    }
  }

  updateSpeedDisplay(speed) {
    this.speedKmh = speed;
    this.elements.speedValue.textContent = speed.toFixed(1);
  }

  updateParkInfo(parkName, progressPercent) {
    this.currentPark = parkName;
    this.progressPercent = progressPercent;
    if (this.elements.parkBadge) {
      this.elements.parkBadge.textContent = `📍 ${parkName}`;
    }
    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${progressPercent}%`;
    }
    if (this.elements.progressText) {
      this.elements.progressText.textContent = `${progressPercent}%`;
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
