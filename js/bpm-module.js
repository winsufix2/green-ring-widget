/**
 * Live Heart Rate (BPM) Module for Streamers
 * Supports:
 * 1. Pulsoid Integration (wss://dev.pulsoid.net/api/v1/data/web-socket?access_token=...)
 * 2. HypeRate Integration (wss://app.hyperate.io/socket/websocket)
 * 3. Web Bluetooth GATT (Heart Rate Service 0x180D)
 * 4. WebSocket / REST API (/api/bpm)
 */
export class BpmModule {
  constructor(options = {}) {
    this.onBpm = options.onBpm || (() => {});
    this.onStatus = options.onStatus || (() => {});

    this.currentBpm = 0;
    this.source = 'none';

    // Bluetooth GATT
    this.bleDevice = null;
    this.bleServer = null;
    this.bleCharacteristic = null;
    this.isBleConnected = false;

    // Cloud streaming WebSocket (Pulsoid / HypeRate)
    this.cloudWs = null;
  }

  /**
   * Connect to Pulsoid Heart Rate stream using streamer's token
   */
  connectPulsoid(token) {
    if (!token) return;
    try {
      this.onStatus({ type: 'connecting', message: 'Подключение к Pulsoid...' });
      const wsUrl = `wss://dev.pulsoid.net/api/v1/data/web-socket?access_token=${token}`;
      this.cloudWs = new WebSocket(wsUrl);

      this.cloudWs.onopen = () => {
        this.source = 'pulsoid';
        this.onStatus({ type: 'connected', message: 'Пульсометр Pulsoid подключен!' });
      };

      this.cloudWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const hr = data?.data?.heart_rate ?? data?.heart_rate;
          if (typeof hr === 'number' && hr > 30 && hr < 240) {
            this.currentBpm = hr;
            this.onBpm(hr, 'pulsoid');
          }
        } catch (e) {}
      };

      this.cloudWs.onclose = () => {
        console.log('[Pulsoid] Disconnected. Reconnecting in 5s...');
        setTimeout(() => this.connectPulsoid(token), 5000);
      };
    } catch (err) {
      console.warn('[Pulsoid] Connection error:', err);
    }
  }

  /**
   * Connect to HypeRate Heart Rate stream using streamer's session ID
   */
  connectHypeRate(hyperateId) {
    if (!hyperateId) return;
    try {
      this.onStatus({ type: 'connecting', message: 'Подключение к HypeRate...' });
      const wsUrl = `wss://app.hyperate.io/socket/websocket?token=PUBLIC_TOKEN`;
      this.cloudWs = new WebSocket(wsUrl);

      this.cloudWs.onopen = () => {
        // Phoenix channel join
        this.cloudWs.send(JSON.stringify({
          topic: `hr:${hyperateId}`,
          event: 'phx_join',
          payload: {},
          ref: '1'
        }));
        this.source = 'hyperate';
        this.onStatus({ type: 'connected', message: 'HypeRate подключен!' });
      };

      this.cloudWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'hr_update' && data.payload?.hr) {
            const hr = parseInt(data.payload.hr, 10);
            if (hr > 30 && hr < 240) {
              this.currentBpm = hr;
              this.onBpm(hr, 'hyperate');
            }
          }
        } catch (e) {}
      };

      this.cloudWs.onclose = () => {
        setTimeout(() => this.connectHypeRate(hyperateId), 5000);
      };
    } catch (err) {
      console.warn('[HypeRate] Connection error:', err);
    }
  }

  isBluetoothSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connectBle() {
    if (!this.isBluetoothSupported()) {
      this.onStatus({
        type: 'error',
        message: 'Web Bluetooth не поддерживается данным браузером.'
      });
      return false;
    }

    try {
      this.onStatus({ type: 'connecting', message: 'Поиск Bluetooth пульсометра...' });
      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.handleBleDisconnect();
      });

      this.bleServer = await this.bleDevice.gatt.connect();
      const service = await this.bleServer.getPrimaryService('heart_rate');
      this.bleCharacteristic = await service.getCharacteristic('heart_rate_measurement');

      await this.bleCharacteristic.startNotifications();
      this.bleCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
        this.handleHeartRateMeasurement(e.target.value);
      });

      this.isBleConnected = true;
      this.source = 'bluetooth';
      this.onStatus({
        type: 'connected',
        message: `Пульсометр подключен: ${this.bleDevice.name || 'BLE HR'}`
      });
      return true;
    } catch (err) {
      this.onStatus({ type: 'error', message: err.message || 'Ошибка BLE' });
      return false;
    }
  }

  handleBleDisconnect() {
    this.isBleConnected = false;
    if (this.source === 'bluetooth') {
      this.source = 'none';
      this.currentBpm = 0;
      this.onBpm(0, 'none');
    }
    this.onStatus({ type: 'warning', message: 'BLE соединение разорвано' });
  }

  handleHeartRateMeasurement(dataView) {
    if (!dataView || dataView.byteLength < 2) return;
    const flags = dataView.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const bpm = is16Bit ? dataView.getUint16(1, true) : dataView.getUint8(1);

    if (bpm > 30 && bpm < 240) {
      this.currentBpm = bpm;
      this.source = 'bluetooth';
      this.onBpm(bpm, 'bluetooth');
    }
  }

  setExternalBpm(bpm, source = 'external') {
    const parsed = parseInt(bpm, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      this.currentBpm = parsed;
      this.source = source;
      this.onBpm(parsed, source);
    }
  }
}
