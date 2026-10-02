import { haversineDistance, projectGpsToRing } from './map-projection.js';

class MobileTracker {
  constructor() {
    this.ws = null;
    this.isTracking = false;
    this.watchId = null;
    this.wakeLock = null;

    // GPS metrics
    this.lastFix = null;
    this.currentSpeed = 0;
    this.baseDistanceKm = 32.0;
    this.totalDistanceM = 0;

    // Heart rate
    this.currentBpm = 0;
    this.bleDevice = null;

    // DOM Elements
    this.el = {
      connStatus: document.getElementById('conn-status'),
      btnGps: document.getElementById('btn-gps-toggle'),
      btnBle: document.getElementById('btn-ble-connect'),
      valSpeed: document.getElementById('val-speed'),
      valPark: document.getElementById('val-park'),
      valAccuracy: document.getElementById('val-accuracy'),
      valDist: document.getElementById('val-dist'),
      valBpm: document.getElementById('val-bpm'),
      logBox: document.getElementById('status-log')
    };
  }

  init() {
    this.initWebSocket();
    this.bindEvents();
    this.requestWakeLock();
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    if (this.el.logBox) {
      this.el.logBox.textContent = `[${time}] ${msg}`;
    }
    console.log(`[MobileTracker] ${msg}`);
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.el.connStatus.className = 'connection-pill conn-online';
        this.el.connStatus.innerHTML = '<span class="dot"></span>СВЯЗЬ С OBS ЕСТЬ';
        this.log('Подключено к OBS серверу');
      };

      this.ws.onclose = () => {
        this.el.connStatus.className = 'connection-pill conn-offline';
        this.el.connStatus.innerHTML = '<span class="dot"></span>НЕТ СВЯЗИ (ПОВТОР...)';
        setTimeout(connect, 2500);
      };

      this.ws.onerror = () => {
        this.el.connStatus.className = 'connection-pill conn-offline';
        this.el.connStatus.innerHTML = '<span class="dot"></span>ОШИБКА СЕТИ';
      };
    };

    connect();
  }

  sendGpsData(data) {
    // 1. Send via WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'gps', data }));
    }
    // 2. Also send via HTTP POST fallback
    fetch('/api/gps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});
  }

  sendBpmData(bpm, source = 'mobile') {
    this.currentBpm = bpm;
    this.el.valBpm.textContent = bpm;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'bpm', data: { value: bpm, source } }));
    }
    fetch('/api/bpm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpm, source })
    }).catch(() => {});
  }

  bindEvents() {
    this.el.btnGps.addEventListener('click', () => this.toggleGps());
    this.el.btnBle.addEventListener('click', () => this.connectBle());

    // BPM Presets
    document.querySelectorAll('.btn-preset').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const bpm = parseInt(e.target.dataset.bpm, 10);
        this.sendBpmData(bpm, 'preset');
        this.log(`BPM установлен: ${bpm}`);
      });
    });

    // Step buttons
    document.getElementById('btn-bpm-minus').addEventListener('click', () => {
      const newBpm = Math.max(0, this.currentBpm - 5);
      this.sendBpmData(newBpm, 'manual');
    });
    document.getElementById('btn-bpm-plus').addEventListener('click', () => {
      const newBpm = this.currentBpm === 0 ? 80 : this.currentBpm + 5;
      this.sendBpmData(newBpm, 'manual');
    });
  }

  toggleGps() {
    if (this.isTracking) {
      this.stopGps();
    } else {
      this.startGps();
    }
  }

  startGps() {
    if (!('geolocation' in navigator)) {
      alert('Геолокация не поддерживается вашим браузером');
      return;
    }

    this.isTracking = true;
    this.el.btnGps.classList.add('active');
    this.el.btnGps.textContent = '⏹ ОСТАНОВИТЬ ТРАНСЛЯЦИЮ GPS';
    this.log('Запрос высокоточного GPS...');

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleGpsSuccess(pos),
      (err) => this.handleGpsError(err),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  stopGps() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
    this.el.btnGps.classList.remove('active');
    this.el.btnGps.textContent = '🛰️ НАЧАТЬ ТРАНСЛЯЦИЮ GPS';
    this.el.valSpeed.textContent = '0.0';
    this.log('GPS остановлен');
  }

  handleGpsSuccess(pos) {
    const coords = pos.coords;
    const now = Date.now();
    const lat = coords.latitude;
    const lon = coords.longitude;
    const accuracy = coords.accuracy || 5;
    const heading = coords.heading || 0;

    let speedKmh = 0;
    if (typeof coords.speed === 'number' && coords.speed >= 0) {
      speedKmh = coords.speed * 3.6;
    } else if (this.lastFix) {
      const dt = (now - this.lastFix.timestamp) / 1000;
      if (dt > 0.5 && dt < 30) {
        const d = haversineDistance(this.lastFix.lat, this.lastFix.lon, lat, lon);
        if (d >= 2) {
          this.totalDistanceM += d;
          speedKmh = Math.min(120, (d / dt) * 3.6);
        }
      }
    }

    // Exponential smoothing
    this.currentSpeed = 0.4 * speedKmh + 0.6 * this.currentSpeed;
    const roundedSpeed = Math.round(this.currentSpeed * 10) / 10;

    // Project to Green Ring to find current park
    const projection = projectGpsToRing(lat, lon);

    this.lastFix = { lat, lon, timestamp: now };

    // Update UI
    this.el.valSpeed.textContent = roundedSpeed.toFixed(1);
    this.el.valAccuracy.textContent = `±${Math.round(accuracy)}м`;
    this.el.valPark.textContent = projection.currentPark;
    const totalKm = this.baseDistanceKm + (this.totalDistanceM / 1000);
    this.el.valDist.textContent = `${totalKm.toFixed(2)} км`;

    // Transmit to OBS
    this.sendGpsData({
      lat,
      lon,
      speed: roundedSpeed,
      heading,
      accuracy,
      parkName: projection.currentPark
    });

    this.log(`Координаты отправлены: ${lat.toFixed(5)}, ${lon.toFixed(5)} (${roundedSpeed} км/ч)`);
  }

  handleGpsError(err) {
    this.log(`GPS ошибка: ${err.message}`);
  }

  async connectBle() {
    if (!('bluetooth' in navigator)) {
      alert('Web Bluetooth не поддерживается этим мобильным браузером. На Android используйте Chrome с HTTPS.');
      return;
    }

    try {
      this.log('Поиск Bluetooth пульсометра / часов...');
      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });

      this.log(`Подключение к ${this.bleDevice.name || 'часам'}...`);
      const server = await this.bleDevice.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => {
        const view = e.target.value;
        const flags = view.getUint8(0);
        const is16Bit = (flags & 0x01) !== 0;
        const bpm = is16Bit ? view.getUint16(1, true) : view.getUint8(1);
        if (bpm > 30 && bpm < 240) {
          this.sendBpmData(bpm, 'watch_ble');
        }
      });

      this.el.btnBle.textContent = `❤️ ПОДКЛЮЧЕНО: ${this.bleDevice.name || 'WATCH'}`;
      this.log('Пульсометр успешно подключен!');
    } catch (err) {
      this.log(`BLE ошибка: ${err.message}`);
    }
  }

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.log('Блокировка экрана включена (экран не погаснет)');
      } catch (err) {
        console.warn('WakeLock error:', err);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const tracker = new MobileTracker();
  tracker.init();
});
