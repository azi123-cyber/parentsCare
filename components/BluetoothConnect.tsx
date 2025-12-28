import React, { useState, useEffect } from 'react';
import { Bluetooth, Loader2, AlertCircle, CheckCircle2, Wifi } from 'lucide-react';
import { bluetoothService, BluetoothDevice } from '../services/bluetooth';

interface BluetoothConnectProps {
  onConnected: (connected: boolean) => void;
}

export const BluetoothConnect: React.FC<BluetoothConnectProps> = ({ onConnected }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [error, setError] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Request permissions saat mount
  useEffect(() => {
    requestPermissions();
  }, []);

  // Listen status changes
  useEffect(() => {
    const unsubscribe = bluetoothService.onStatusChange((connected) => {
      setIsConnected(connected);
      onConnected(connected);
    });
    return unsubscribe;
  }, [onConnected]);

  const requestPermissions = async () => {
    try {
      const granted = await bluetoothService.requestPermissions();
      setPermissionGranted(granted);
      if (!granted) {
        setError('Izin Bluetooth ditolak. Silakan aktifkan di Pengaturan.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setError('');
    try {
      const foundDevices = await bluetoothService.scanDevices();
      setDevices(foundDevices);
      if (foundDevices.length === 0) {
        setError('Tidak ada device Bluetooth terdeteksi. Pastikan Arduino sudah nyala.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    setError('');
    try {
      const success = await bluetoothService.connectToDevice(device.id);
      if (success) {
        setConnectedDevice(device);
        setIsConnected(true);
      } else {
        setError('Gagal terhubung ke device. Coba lagi.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await bluetoothService.disconnect();
      setConnectedDevice(null);
      setIsConnected(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!permissionGranted) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-amber-600 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-semibold text-amber-900">Izin Bluetooth Diperlukan</p>
            <p className="text-xs text-amber-700 mt-1">Aplikasi membutuhkan izin Bluetooth untuk terhubung ke Arduino.</p>
            <button 
              onClick={requestPermissions}
              className="mt-3 text-xs bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 transition"
            >
              Berikan Izin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-600 mt-0.5" size={18} />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {isConnected && connectedDevice ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-green-600" size={20} />
              <div>
                <p className="text-sm font-semibold text-green-900">Terhubung ke Arduino</p>
                <p className="text-xs text-green-700">{connectedDevice.name}</p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-xs bg-red-500 text-white px-3 py-1.5 rounded hover:bg-red-600 transition"
            >
              Putus
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isScanning ? <Loader2 className="animate-spin" size={18} /> : <Bluetooth size={18} />}
            {isScanning ? 'Memindai...' : 'Cari Device Arduino'}
          </button>

          {devices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Device Ditemukan:</p>
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => handleConnect(device)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-left hover:bg-blue-50 hover:border-blue-300 transition"
                >
                  <p className="text-sm font-medium text-slate-800">{device.name}</p>
                  <p className="text-xs text-slate-500">{device.id}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
