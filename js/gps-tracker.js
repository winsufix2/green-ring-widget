import { haversineDistance, projectGpsToRing } from './map-projection.js';

export class GpsTracker {
  constructor(options = {}) {
    this.onLocation = options.onLocation || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onSpeed = options.onSpeed || (() => {});

    this.watchId = null;
    this.isTracking = false;
    this.isSignalLost = false;

    // Last known coordinates
    this.lastFix = null;
    this.currentPosition = null;

    // Speed calculation & smoothing
    this.currentSpeedKmh = 0;
    this.speedFilterAlpha = 0.35; // Exponential smoothing factor
    this.speedHistory = [];

    // Signal loss watchdog timer (12 seconds)
    this.watchdogInterval = null;
    this.lastFixTimestamp = 0;
    this.lossThresholdMs = 15000;
  }

  /**
   * Start GPS tracking via browser Geolocation API
   */
  start() {
    if (!('geolocation' in navigator)) {
      this.onStatus({
        type: 'error',
        message: 'Geolocation API не поддерживается данным браузером',
        code: 'UNSUPPORTED'
      });
      return false;
    }

    if (this.isTracking) return true;

    this.isTracking = true;
    this.isSignalLost = false;
    this.onStatus({ type: 'searching', message: 'Поиск GPS сигнала...' });

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleGeoSuccess(pos),
      (err) => this.handleGeoError(err),
      geoOptions
    );

    // Start watchdog to detect silent GPS signal drop
    this.watchdogInterval = setInterval(() => {
      if (this.isTracking && this.lastFixTimestamp > 0) {
        const timeSinceLastFix = Date.now() - this.lastFixTimestamp;
        if (timeSinceLastFix > this.lossThresholdMs && !this.isSignalLost) {
          this.isSignalLost = true;
          this.currentSpeedKmh = 0;
          this.onSpeed(0);
          this.onStatus({
            type: 'warning',
            message: 'GPS сигнал ослаб. Позиция сохранена.',
            code: 'SIGNAL_LOST',
            retained: true
          });
        }
      }
    }, 3000);

    return true;
  }

  /**
   * Stop tracking
   */
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    this.isTracking = false;
    this.onStatus({ type: 'stopped', message: 'GPS трекинг остановлен' });
  }

  /**
   * Process a successful GPS fix from Geolocation API
   */
  handleGeoSuccess(pos) {
    const coords = pos.coords;
    const now = Date.now();

    const lat = coords.latitude;
    const lon = coords.longitude;
    const accuracy = coords.accuracy || 10;
    const heading = coords.heading || 0;

    let calculatedSpeedKmh = 0;

    // Check if browser directly supplied accurate speed
    if (typeof coords.speed === 'number' && !isNaN(coords.speed) && coords.speed >= 0) {
      calculatedSpeedKmh = coords.speed * 3.6; // convert m/s to km/h
    } else if (this.lastFix) {
      // Calculate speed manually from distance & time delta
      const timeDeltaSec = (now - this.lastFix.timestamp) / 1000;
      if (timeDeltaSec > 0.5 && timeDeltaSec < 30) {
        const distMeters = haversineDistance(
          this.lastFix.lat,
          this.lastFix.lon,
          lat,
          lon
        );

        // Threshold: filter out GPS micro-jitter when standing still (< 2.5m in < 3s)
        if (distMeters < 2.5 && timeDeltaSec < 3) {
          calculatedSpeedKmh = 0;
        } else {
          const rawSpeed = (distMeters / timeDeltaSec) * 3.6;
          // Discard unrealistic GPS teleport jumps (> 120 km/h for a walk/run stream)
          if (rawSpeed <= 120) {
            calculatedSpeedKmh = rawSpeed;
          } else {
            calculatedSpeedKmh = this.currentSpeedKmh;
          }
        }
      }
    }

    // Apply exponential smoothing to avoid erratic speed flickers
    this.currentSpeedKmh =
      this.speedFilterAlpha * calculatedSpeedKmh +
      (1 - this.speedFilterAlpha) * this.currentSpeedKmh;

    // Clean display rounding
    const displaySpeed = Math.round(this.currentSpeedKmh * 10) / 10;

    // Project coordinates onto Moscow Green Ring
    const projection = projectGpsToRing(lat, lon);

    this.lastFix = {
      lat,
      lon,
      accuracy,
      heading,
      speed: displaySpeed,
      timestamp: now
    };
    this.lastFixTimestamp = now;
    this.isSignalLost = false;

    this.onSpeed(displaySpeed);
    this.onLocation({
      lat,
      lon,
      speed: displaySpeed,
      accuracy,
      heading,
      projection,
      isLive: true,
      timestamp: now
    });

    this.onStatus({
      type: 'live',
      message: `GPS активен (точность: ±${Math.round(accuracy)}м)`
    });
  }

  /**
   * Handle Geolocation API errors without crashing
   */
  handleGeoError(err) {
    let msg = 'Ошибка получения GPS координат';
    let code = 'UNKNOWN';

    switch (err.code) {
      case err.PERMISSION_DENIED:
        msg = 'Доступ к геолокации запрещен в настройках браузера';
        code = 'PERMISSION_DENIED';
        break;
      case err.POSITION_UNAVAILABLE:
        msg = 'Информация о местоположении недоступна (сохраняем позицию)';
        code = 'POSITION_UNAVAILABLE';
        break;
      case err.TIMEOUT:
        msg = 'Таймаут получения GPS (сохраняем позицию)';
        code = 'TIMEOUT';
        break;
    }

    this.isSignalLost = true;
    this.onStatus({
      type: 'warning',
      message: msg,
      code,
      retained: !!this.lastFix
    });

    // DO NOT break UI: keep last known fix!
  }

  /**
   * Feed external GPS coordinates (from mobile companion, WebSocket or API)
   */
  feedExternalGps({ lat, lon, speed, heading, accuracy }) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return;

    const now = Date.now();
    const projection = projectGpsToRing(lat, lon);
    const validSpeed = typeof speed === 'number' ? Math.max(0, speed) : this.currentSpeedKmh;

    this.currentSpeedKmh = validSpeed;
    this.lastFix = {
      lat,
      lon,
      speed: validSpeed,
      heading: heading || 0,
      accuracy: accuracy || 5,
      timestamp: now
    };
    this.lastFixTimestamp = now;
    this.isSignalLost = false;

    this.onSpeed(validSpeed);
    this.onLocation({
      lat,
      lon,
      speed: validSpeed,
      heading: heading || 0,
      accuracy: accuracy || 5,
      projection,
      isLive: true,
      timestamp: now
    });

    this.onStatus({
      type: 'live',
      message: `GPS получен с телефона (дистанционно)`
    });
  }
}
