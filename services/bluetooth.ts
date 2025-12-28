import { Capacitor } from '@capacitor/core';

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
}

class BluetoothService {
  private isConnected: boolean = false;
  private connectedDevice: BluetoothDevice | null = null;
  private listeners: ((connected: boolean) => void)[] = [];

  // Request Bluetooth permissions (Android 12+)
  async requestPermissions(): Promise<boolean> {
    try {
      if (Capacitor.getPlatform() === 'android') {
        const { permissions } = await (window as any).cordova.plugin.permission.requestPermissions([
          'android.permission.BLUETOOTH_SCAN',
          'android.permission.BLUETOOTH_CONNECT',
          'android.permission.ACCESS_FINE_LOCATION'
        ]);
        return permissions.every((p: any) => p.hasPermission);
      }
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  }

  // Scan untuk device Bluetooth
  async scanDevices(): Promise<BluetoothDevice[]> {
    try {
      // Gunakan Cordova BluetoothSerial plugin
      const devices = await (window as any).bluetoothSerial.list();
      return devices.map((device: any) => ({
        id: device.address,
        name: device.name,
        rssi: 0
      }));
    } catch (error) {
      console.error('Scan error:', error);
      return [];
    }
  }

  // Connect ke device Arduino
  async connectToDevice(deviceId: string): Promise<boolean> {
    try {
      await (window as any).bluetoothSerial.connect(deviceId);
      this.isConnected = true;
      this.connectedDevice = { id: deviceId, name: deviceId, rssi: 0 };
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Disconnect dari device
  async disconnect(): Promise<void> {
    try {
      await (window as any).bluetoothSerial.disconnect();
      this.isConnected = false;
      this.connectedDevice = null;
      this.notifyListeners();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  // Kirim command ke Arduino
  async sendCommand(command: string): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('Bluetooth tidak terhubung');
      return false;
    }
    try {
      await (window as any).bluetoothSerial.write(command);
      return true;
    } catch (error) {
      console.error('Send command error:', error);
      return false;
    }
  }

  // Dengarkan response dari Arduino
  listenForData(callback: (data: string) => void) {
    try {
      (window as any).bluetoothSerial.subscribeRawData(() => {
        (window as any).bluetoothSerial.read((data: string) => {
          callback(data);
        });
      });
    } catch (error) {
      console.error('Listen error:', error);
    }
  }

  // Get status koneksi
  getStatus(): { isConnected: boolean; device: BluetoothDevice | null } {
    return {
      isConnected: this.isConnected,
      device: this.connectedDevice
    };
  }

  // Subscribe ke perubahan status
  onStatusChange(callback: (connected: boolean) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.isConnected));
  }
}

export const bluetoothService = new BluetoothService();
