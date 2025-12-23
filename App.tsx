
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Battery, MapPin, AlertTriangle, Bluetooth, Volume2, Lightbulb, Smartphone, 
  Vibrate, Radio, LogOut, Lock, Signal, X, ShieldCheck, Map as MapIcon, RefreshCw
} from 'lucide-react';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { BottomNav } from './components/BottomNav';
import { Auth } from './components/Auth'; 
import { analyzeSafetyStatus } from './services/geminiService';
import { 
    updateMyLocation, 
    listenToChildLocation, 
    listenToParentLocation,
    sendCommandToChild,
    listenForCommands,
    clearCommand,
    getChildCredentials,
    listenToSessionChanges
} from './services/firebase';
import { BraceletData, PhoneData, AnalysisResult, LogEntry, UserProfile, ChildCredentials, GPSCoordinates } from './types';

// --- HELPER: REAL DEVICE SENSORS ---

const getRealBatteryLevel = async (): Promise<number> => {
  if ('getBattery' in navigator) {
    const battery: any = await (navigator as any).getBattery();
    return Math.floor(battery.level * 100);
  }
  return 100; // Fallback
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c * 1000; // Meters
};

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [childCredentials, setChildCredentials] = useState<ChildCredentials | null>(null);
  
  // App State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);

  // Data State (Realtime)
  const [myLocation, setMyLocation] = useState<GPSCoordinates | null>(null);
  const [targetLocation, setTargetLocation] = useState<GPSCoordinates | null>(null);
  
  // Child Specific State
  const [bluetoothDevice, setBluetoothDevice] = useState<any | null>(null);
  const [bluetoothServer, setBluetoothServer] = useState<any | null>(null);
  const [bluetoothChar, setBluetoothChar] = useState<any | null>(null);
  
  const [permissionStatus, setPermissionStatus] = useState({
    gps: false,
    bluetooth: false
  });

  const [braceletData, setBraceletData] = useState<BraceletData>({
    id: 'DISCONNECTED',
    status: 'terputus',
    lastUpdate: new Date(),
    rawValue: '',
    batteryLevel: 0,
    isBuzzerOn: false,
    isLedOn: false
  });

  const [phoneData, setPhoneData] = useState<PhoneData>({
    isOnline: true,
    batteryLevel: 0,
    isCharging: false
  });

  // Watch ID for Geolocation
  const watchIdRef = useRef<number | null>(null);

  // --- LOGGING ---
  const addLog = (type: 'danger' | 'info' | 'login' | 'command', title: string, description: string) => {
    setLogs(prev => [{ id: Date.now().toString(), timestamp: new Date(), type, title, description }, ...prev]);
  };

  // --- SESSION MANAGEMENT ---
  useEffect(() => {
    if (currentUser?.sessionId) {
      const unsub = listenToSessionChanges(currentUser.username, currentUser.sessionId, () => {
        alert("Sesi Anda telah berakhir karena login di perangkat lain.");
        setCurrentUser(null);
        window.location.reload();
      });
      return () => unsub();
    }
  }, [currentUser]);

  // --- BATTERY POLLING (REAL) ---
  useEffect(() => {
    const updateBattery = async () => {
      const level = await getRealBatteryLevel();
      setPhoneData(prev => ({ ...prev, batteryLevel: level }));
    };
    updateBattery();
    const interval = setInterval(updateBattery, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // --- GPS TRACKING (STRICT & REAL) ---
  const startGpsTracking = useCallback(() => {
    if (!navigator.geolocation) {
      alert("GPS tidak didukung di perangkat ini.");
      return;
    }

    // Clear existing watch
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GPSCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: Date.now(),
          provider: 'gps'
        };
        
        setMyLocation(coords);
        setPermissionStatus(p => ({ ...p, gps: true }));

        // Upload to Firebase
        if (currentUser) {
           updateMyLocation(currentUser.familyId, currentUser.role!, coords);
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        setPermissionStatus(p => ({ ...p, gps: false }));
        addLog('danger', 'GPS Error', `Gagal mengambil lokasi: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  }, [currentUser]);

  // --- BLUETOOTH (REAL WEB API) ---
  const connectBluetooth = async () => {
    try {
      // Filter for standard Serial (HC-05/06) or HM-10 UUIDs
      // Or acceptAllDevices (requires optionalServices)
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['00001101-0000-1000-8000-00805f9b34fb', 0xFFE0] // Serial Port Profile UUIDs
      });

      setBluetoothDevice(device);
      
      device.addEventListener('gattserverdisconnected', () => {
        setBraceletData(prev => ({ ...prev, status: 'terputus' }));
        setPermissionStatus(p => ({ ...p, bluetooth: false }));
        addLog('danger', 'Bluetooth Putus', 'Koneksi ke gelang terputus!');
      });

      const server = await device.gatt!.connect();
      setBluetoothServer(server);
      setBraceletData(prev => ({ ...prev, status: 'terhubung', id: device.name || 'Arduino' }));
      setPermissionStatus(p => ({ ...p, bluetooth: true }));
      addLog('info', 'Bluetooth Terhubung', `Terhubung ke ${device.name}`);

      // Attempt to find a writable characteristic
      // Note: This is simplified. In a real app, you iterate services.
      // Assuming a simple Serial service here for demo purposes (usually the first one)
      const services = await server.getPrimaryServices();
      if (services.length > 0) {
        const service = services[0];
        const characteristics = await service.getCharacteristics();
        if (characteristics.length > 0) {
           const char = characteristics[0];
           setBluetoothChar(char);
           
           // Start Notifications (Reading Data)
           if (char.properties.notify) {
             await char.startNotifications();
             char.addEventListener('characteristicvaluechanged', (event: any) => {
                const decoder = new TextDecoder();
                const value = decoder.decode(event.target.value);
                handleIncomingBluetoothData(value);
             });
           }
        }
      }

    } catch (error) {
      console.error(error);
      alert("Koneksi Gagal. Pastikan Bluetooth aktif dan pilih perangkat.");
    }
  };

  const handleIncomingBluetoothData = (data: string) => {
    // Expecting format like: "BAT:88|SOS:0" from Arduino
    // Simple parsing logic
    setBraceletData(prev => {
        const newData = { ...prev, rawValue: data, lastUpdate: new Date() };
        if (data.includes("SOS:1")) {
            if (!prev.isBuzzerOn) triggerSOS();
        }
        return newData;
    });
  };

  const sendBluetoothCommand = async (cmd: string) => {
    if (!bluetoothChar) {
      addLog('danger', 'Gagal Kirim', 'Bluetooth tidak terhubung/siap.');
      return;
    }
    try {
      const encoder = new TextEncoder();
      await bluetoothChar.writeValue(encoder.encode(cmd));
      addLog('command', 'Terkirim ke Gelang', `Perintah: ${cmd}`);
      
      // Update local state optimistic
      if (cmd === 'BUZZER_ON') setBraceletData(p => ({...p, isBuzzerOn: true}));
      if (cmd === 'BUZZER_OFF') setBraceletData(p => ({...p, isBuzzerOn: false}));
      if (cmd === 'LED_ON') setBraceletData(p => ({...p, isLedOn: true}));
      if (cmd === 'LED_OFF') setBraceletData(p => ({...p, isLedOn: false}));

    } catch (e) {
      addLog('danger', 'Error Bluetooth', 'Gagal mengirim data.');
    }
  };

  // --- ROLE SPECIFIC EFFECTS ---

  // 1. Child Logic
  useEffect(() => {
    if (currentUser?.role === 'child') {
      // Start GPS immediately on mount (browser will prompt)
      startGpsTracking();
      
      // Listen for commands from Parent
      const unsubCmd = listenForCommands(currentUser.familyId, async (cmd) => {
        if (Date.now() - cmd.timestamp > 30000) return; // Ignore old commands

        addLog('command', 'Perintah Orang Tua', `Menerima perintah: ${cmd.type}`);
        
        if (cmd.type === 'VIBRATE') {
          if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
        } else if (cmd.type === 'BUZZER_ON') {
          sendBluetoothCommand('BUZZER_ON');
        } else if (cmd.type === 'BUZZER_OFF') {
          sendBluetoothCommand('BUZZER_OFF');
        }
        await clearCommand(currentUser.familyId);
      });

      // Listen to Parent Location (so child can see where parent is)
      const unsubLoc = listenToParentLocation(currentUser.familyId, (coords) => {
         setTargetLocation(coords);
      });

      return () => {
        unsubCmd();
        unsubLoc();
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      };
    }
  }, [currentUser]); // Run only when user is set

  // 2. Parent Logic
  useEffect(() => {
    if (currentUser?.role === 'parent') {
      startGpsTracking(); // Parent also tracks own location

      // Fetch Child Credentials
      getChildCredentials(currentUser.familyId).then(setChildCredentials);

      // Listen to Child Location
      const unsub = listenToChildLocation(currentUser.familyId, (coords) => {
         if (coords) {
            setTargetLocation(coords);
            setPhoneData(prev => ({
                ...prev,
                location: coords,
                isOnline: (Date.now() - coords.updatedAt) < 60000 // Considered online if update < 1 min ago
            }));
         } else {
             setPhoneData(prev => ({ ...prev, isOnline: false }));
         }
      });
      return () => {
          unsub();
          if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      };
    }
  }, [currentUser]);

  // --- ACTIONS ---

  const triggerSOS = () => {
    addLog('danger', 'SOS TRIGGERED', 'Mengirim sinyal bahaya!');
    if (currentUser?.role === 'child') {
        updateMyLocation(currentUser.familyId, 'child', {
            ...myLocation!,
            updatedAt: Date.now()
        });
        // Also buzz local bracelet
        sendBluetoothCommand('BUZZER_ON');
    }
  };

  const handleRunAnalysis = async () => {
    setLoadingAi(true);
    const result = await analyzeSafetyStatus(braceletData, phoneData);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setLogs([]);
  };

  // --- RENDER ---

  if (!currentUser) {
    return (
        <div className="h-full w-full bg-slate-50 flex items-center justify-center p-4">
             <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <ShieldCheck size={48} className="text-blue-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-slate-800">Guardian Tracker</h1>
                    <p className="text-slate-500 text-sm">Realtime Arduino & GPS System</p>
                </div>
                <Auth onLoginSuccess={handleLoginSuccess} />
             </div>
        </div>
    );
  }

  // --- CHILD VIEW (GATEKEEPER) ---
  if (currentUser.role === 'child') {
     // Strict Gatekeeper: Must have GPS and Bluetooth to proceed
     if (!permissionStatus.gps || !permissionStatus.bluetooth) {
         return (
             <div className="h-full bg-slate-900 text-white flex flex-col p-6">
                 <h2 className="text-xl font-bold mb-6">Status Sistem Anak</h2>
                 
                 <div className="space-y-4 flex-1">
                     {/* GPS Check */}
                     <div className={`p-4 rounded-xl border ${permissionStatus.gps ? 'bg-green-900/30 border-green-500' : 'bg-red-900/20 border-red-500'}`}>
                         <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-3">
                                 <MapPin size={24} className={permissionStatus.gps ? 'text-green-400' : 'text-red-400'} />
                                 <span className="font-bold">Sinyal GPS</span>
                             </div>
                             <span className="text-xs font-mono">{permissionStatus.gps ? 'AKTIF' : 'MATI'}</span>
                         </div>
                         {!permissionStatus.gps && (
                             <button onClick={startGpsTracking} className="mt-2 w-full py-2 bg-red-600 rounded-lg text-xs font-bold">Aktifkan Izin Lokasi</button>
                         )}
                     </div>

                     {/* Bluetooth Check */}
                     <div className={`p-4 rounded-xl border ${permissionStatus.bluetooth ? 'bg-green-900/30 border-green-500' : 'bg-red-900/20 border-red-500'}`}>
                         <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-3">
                                 <Bluetooth size={24} className={permissionStatus.bluetooth ? 'text-green-400' : 'text-red-400'} />
                                 <span className="font-bold">Koneksi Gelang</span>
                             </div>
                             <span className="text-xs font-mono">{permissionStatus.bluetooth ? 'TERHUBUNG' : 'TERPUTUS'}</span>
                         </div>
                         {!permissionStatus.bluetooth && (
                             <button onClick={connectBluetooth} className="mt-2 w-full py-2 bg-blue-600 rounded-lg text-xs font-bold">Sambungkan Arduino</button>
                         )}
                     </div>
                 </div>
                 
                 <p className="text-xs text-slate-500 text-center mb-4">Aplikasi tidak akan berjalan tanpa kedua izin di atas.</p>
             </div>
         );
     }

     // Active Child Dashboard
     return (
         <div className="h-full bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden">
             {/* Background Map Effect */}
             <div className="absolute inset-0 opacity-10 pointer-events-none">
                 {/* Placeholder for map vibe */}
                 <div className="grid grid-cols-6 h-full gap-1">
                    {Array.from({length: 24}).map((_,i) => <div key={i} className="border border-white/20 rounded"></div>)}
                 </div>
             </div>

             <div className="z-10 text-center space-y-8 w-full px-8">
                 <div className="animate-pulse">
                     <div className="w-40 h-40 mx-auto bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                         <ShieldCheck size={64} className="text-green-400" />
                     </div>
                     <p className="mt-4 text-green-400 font-bold tracking-widest text-sm">SYSTEM ARMED</p>
                     <p className="text-slate-500 text-xs mt-1">Mengirim Lokasi & Data Sensor...</p>
                 </div>

                 <button 
                    onClick={triggerSOS}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-6 rounded-2xl font-black text-2xl shadow-lg shadow-red-900/50 active:scale-95 transition-transform"
                 >
                    SOS DARURAT
                 </button>

                 <div className="bg-slate-800/80 backdrop-blur rounded-xl p-4 text-left border border-slate-700">
                     <p className="text-xs text-slate-400 mb-2">INFO ORANG TUA</p>
                     {targetLocation ? (
                         <div>
                             <p className="text-white font-bold flex items-center gap-2">
                                 <MapIcon size={16} className="text-blue-400"/> 
                                 {calculateDistance(myLocation!.lat, myLocation!.lng, targetLocation.lat, targetLocation.lng).toFixed(0)} Meter
                             </p>
                             <p className="text-xs text-slate-500">Jarak dari posisi Anda</p>
                         </div>
                     ) : (
                         <p className="text-slate-500 text-sm italic">Mencari lokasi orang tua...</p>
                     )}
                 </div>
             </div>
         </div>
     );
  }

  // --- PARENT VIEW ---
  
  const renderParentContent = () => {
      switch (activeTab) {
        case 'home':
            return (
                <div className="space-y-4 pb-24">
                     {/* Connectivity Status */}
                    <div className={`p-6 rounded-2xl text-white shadow-lg ${phoneData.isOnline ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-slate-600'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold">{phoneData.isOnline ? 'Perangkat Anak Online' : 'Perangkat Offline'}</h2>
                                <p className="text-sm opacity-80 mt-1">
                                    {phoneData.location ? `Update: ${new Date(phoneData.location.updatedAt).toLocaleTimeString()}` : 'Belum ada data lokasi'}
                                </p>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${phoneData.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                        </div>
                        
                        <div className="mt-6 flex gap-4">
                            <div className="bg-white/20 p-2 rounded-lg text-center flex-1">
                                <Battery size={20} className="mx-auto mb-1" />
                                <span className="text-sm font-bold">{phoneData.batteryLevel}%</span>
                            </div>
                             <div className="bg-white/20 p-2 rounded-lg text-center flex-1">
                                <Bluetooth size={20} className="mx-auto mb-1" />
                                <span className="text-sm font-bold">{braceletData.status === 'terhubung' ? 'Linked' : 'No Link'}</span>
                            </div>
                        </div>
                    </div>

                    {/* AI Card */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-purple-100 rounded-md"><Bluetooth size={16} className="text-purple-600"/></div>
                                <h3 className="text-sm font-bold">Analisis Keamanan</h3>
                            </div>
                            <button onClick={handleRunAnalysis} disabled={loadingAi} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100">
                                <RefreshCw size={16} className={loadingAi ? 'animate-spin text-blue-600' : 'text-slate-500'} />
                            </button>
                        </div>
                        {aiAnalysis ? (
                            <div className="text-sm space-y-2">
                                <p className="text-slate-700">{aiAnalysis.message}</p>
                                <div className="bg-purple-50 p-2 rounded text-purple-700 text-xs font-bold">
                                    {aiAnalysis.recommendation}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400">Tekan tombol refresh untuk analisis AI berdasarkan data sensor.</p>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                         <button onClick={() => sendCommandToChild(currentUser.familyId, 'BUZZER_ON')} className="p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col items-center gap-2 text-red-600 active:scale-95 transition-transform">
                             <Volume2 />
                             <span className="text-xs font-bold">Bunyikan Alarm</span>
                         </button>
                         <button onClick={() => sendCommandToChild(currentUser.familyId, 'VIBRATE')} className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex flex-col items-center gap-2 text-orange-600 active:scale-95 transition-transform">
                             <Vibrate />
                             <span className="text-xs font-bold">Getarkan HP</span>
                         </button>
                    </div>
                </div>
            );
        case 'map':
            if (!targetLocation) return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Menunggu lokasi anak...</div>;
            return (
                <div className="h-full w-full bg-slate-100 relative">
                     <iframe 
                        width="100%" 
                        height="100%" 
                        src={`https://maps.google.com/maps?q=${targetLocation.lat},${targetLocation.lng}&z=15&output=embed`} 
                        style={{border:0}} 
                        loading="lazy"
                     ></iframe>
                     <div className="absolute bottom-4 left-4 right-4 bg-white p-4 rounded-xl shadow-lg">
                         <div className="flex justify-between items-center">
                            <div>
                                <p className="text-xs text-slate-500">Akurasi GPS</p>
                                <p className="font-bold text-slate-800">{targetLocation.accuracy?.toFixed(0) || '?'} Meter</p>
                            </div>
                             <a 
                                href={`https://www.google.com/maps/dir/?api=1&destination=${targetLocation.lat},${targetLocation.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700"
                             >
                                 Rute Ke Anak
                             </a>
                         </div>
                     </div>
                </div>
            );
        case 'settings':
            return (
                <div className="p-4 space-y-4">
                     <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
                         <div className="w-20 h-20 bg-slate-100 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-slate-400">
                             {currentUser.username.charAt(0).toUpperCase()}
                         </div>
                         <h2 className="font-bold text-lg">{currentUser.username}</h2>
                         <p className="text-xs text-slate-500 mb-6">{currentUser.familyId}</p>
                         
                         <div className="text-left bg-slate-50 p-4 rounded-xl space-y-3 mb-6">
                             <div className="flex justify-between text-sm">
                                 <span className="text-slate-500">Akun Anak</span>
                                 <span className="font-bold">{childCredentials?.username}</span>
                             </div>
                             <div className="flex justify-between text-sm">
                                 <span className="text-slate-500">PIN Akses</span>
                                 <span className="font-mono bg-white px-2 rounded border">{childCredentials?.pin}</span>
                             </div>
                         </div>

                         <button onClick={() => setCurrentUser(null)} className="w-full py-3 border border-red-200 text-red-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                             <LogOut size={16} /> Logout
                         </button>
                     </div>
                </div>
            );
        default: return null;
      }
  }

  return (
    <div className="h-full w-full bg-slate-50 sm:p-4 flex justify-center">
      <div className="w-full max-w-md h-full sm:h-[90vh] bg-white sm:rounded-[2.5rem] sm:shadow-2xl relative flex flex-col overflow-hidden border-slate-200 sm:border">
         {activeTab !== 'map' && <Header 
            title={activeTab === 'home' ? 'Dashboard Ortu' : 'Pengaturan'} 
            notificationCount={logs.filter(l => l.type === 'danger').length}
            onNotificationClick={() => setShowNotifications(true)}
         />}
         
         <div className="flex-1 overflow-y-auto scrollbar-hide">
            {renderParentContent()}
         </div>
         
         <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

         {showNotifications && (
             <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
                 <div className="bg-white w-full rounded-2xl max-h-[60vh] flex flex-col p-4 shadow-xl">
                     <div className="flex justify-between items-center mb-4 border-b pb-2">
                         <h3 className="font-bold">Notifikasi</h3>
                         <button onClick={() => setShowNotifications(false)}><X /></button>
                     </div>
                     <div className="overflow-y-auto space-y-2 flex-1">
                         {logs.map(log => (
                             <div key={log.id} className="text-xs p-2 bg-slate-50 rounded border">
                                 <span className="font-bold text-slate-700 block">{log.title}</span>
                                 <span className="text-slate-500">{log.description}</span>
                             </div>
                         ))}
                         {logs.length === 0 && <p className="text-center text-xs text-slate-400">Kosong</p>}
                     </div>
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};

export default App;