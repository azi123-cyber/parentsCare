import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Battery, MapPin, AlertTriangle, RefreshCw, Zap, ShieldCheck,
  Bluetooth, Volume2, Lightbulb, Smartphone, User,
  Vibrate, Radio, LogOut, CheckCircle, CheckCircle2, XCircle, Activity, History, Lock,
  Signal, Navigation, X, Key, Info, Phone, ArrowRight, MapPinned, ShieldAlert, Settings
} from 'lucide-react';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { BottomNav } from './components/BottomNav';
import { Auth } from './components/Auth';
import { analyzeSafetyStatus, getAiUsageCount, simulateAnalysis } from './services/aiService';
import {
  requestChildLocation,
  listenToLocationUpdates,
  updateDeviceLocation,
  listenForCommands,
  getChildCredentials,
  listenToSessionChanges,
  setupChildPresence,
  listenToChildStatus,
  updateChildBattery,
  clearCommand,
  listenToParentLocation,
  updateMyLocation,
  sendCommandToChild,
  updateChildSos,
  markCommandExecuted,
  logSystemActivity
} from './services/firebase';
import { BraceletData, PhoneData, AnalysisResult, LogEntry, UserProfile, ChildCredentials } from './types';
import { BluetoothConnect } from './components/BluetoothConnect';
import { bluetoothService } from './services/bluetooth';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';

// --- INITIAL STATES ---
const INITIAL_BRACELET: BraceletData = {
  id: 'ARD-UNO-01',
  childName: '...',
  batteryLevel: 0, // Default 0, menunggu data asli dari Bluetooth
  locationName: 'Dekat',
  status: 'terputus',
  lastUpdate: new Date(),
  isBuzzerOn: false,
  isLedOn: false,
  lastCommandSent: '-',
  signalStrength: 0
};

const INITIAL_PHONE: PhoneData = {
  isOnline: false, // Default offline
  batteryLevel: 0, // Default 0, menunggu data asli dari HP Anak
  isVibrating: false,
  gpsActive: true,
  lastPing: new Date(),
  location: { lat: -6.175392, lng: 106.827153, updatedAt: Date.now() }
};

// Utils for distance (Haversine)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Return in meters
};

const HOME_COORDS = { lat: -6.175392, lng: 106.827153 }; // Monas as default safe zone center

// --- VIBRATION UTILITIES ---
let vibrationInterval: any = null;

const stopVibration = () => {
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
};

const startVibration = (durationMs: number = 5000, isInfinite: boolean = false) => {
  stopVibration();

  const vibrateOnce = async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.vibrate({ duration: 1000 });
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } else if (navigator.vibrate) {
      navigator.vibrate(800);
    }
  };

  vibrateOnce();
  const interval = setInterval(vibrateOnce, 1200);
  vibrationInterval = interval;

  if (!isInfinite && durationMs > 0) {
    setTimeout(() => {
      if (vibrationInterval === interval) stopVibration();
    }, durationMs);
  }
};

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [childCredentials, setChildCredentials] = useState<ChildCredentials | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const [showBatteryWarning, setShowBatteryWarning] = useState(true);

  // Parent View State
  const [activeTab, setActiveTab] = useState('home');
  const [trackingMode, setTrackingMode] = useState<'gps' | 'bluetooth'>('gps');
  const [braceletData, setBraceletData] = useState<BraceletData>(INITIAL_BRACELET);
  const [phoneData, setPhoneData] = useState<PhoneData>(INITIAL_PHONE);
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiUsage, setAiUsage] = useState(getAiUsageCount());
  const [isLocating, setIsLocating] = useState(false);
  const [distanceFromHome, setDistanceFromHome] = useState(0);

  // Child View State
  const [isChildSos, setIsChildSos] = useState(false);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [showChildMap, setShowChildMap] = useState(false);
  const [parentLocation, setParentLocation] = useState<GPSCoordinates | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Toggle Dark Mode Class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Request Permissions & Persistent Login on Load
  useEffect(() => {
    const initApp = async () => {
      // Persistent Login Check
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setCurrentUser(parsedUser);
          addLog('login', 'Auto-Login', `Selamat datang kembali, ${parsedUser.username}`);
          if (parsedUser.role === 'parent') {
            getChildCredentials(parsedUser.familyId).then(creds => {
              if (creds) setChildCredentials(creds);
            });
          }
        } catch (e) {
          console.error("Failed to parse saved user", e);
          localStorage.removeItem('currentUser');
        }
      }

      // Request Notification Permission
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }

      // simulasi Bluetooth Permission Check
      console.log("System Status: Ready to connect Bluetooth.");

      // Onboarding Check
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    };
    initApp();
  }, []);

  // --- SESSION & SINGLE DEVICE LOGIC ---
  useEffect(() => {
    if (currentUser && currentUser.sessionId) {
      const unsubscribe = listenToSessionChanges(
        currentUser.username,
        currentUser.sessionId,
        () => {
          setSessionError(true);
          setCurrentUser(null);
          addLog('danger', 'Sesi Berakhir', 'Akun login di perangkat lain.');
        }
      );
      return () => unsubscribe();
    }
  }, [currentUser]);

  // Update Child Name based on User Data
  useEffect(() => {
    if (currentUser && currentUser.role === 'parent' && childCredentials) {
      setBraceletData(prev => ({ ...prev, childName: childCredentials.username }));
    } else if (currentUser && currentUser.role === 'child') {
      setBraceletData(prev => ({ ...prev, childName: currentUser.name }));
    }
  }, [currentUser, childCredentials]);


  // --- LOGGING SYSTEM ---
  const addLog = (type: 'danger' | 'info' | 'login' | 'command', title: string, description: string) => {
    const newLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      type,
      title,
      description
    };
    setLogs(prev => [newLog, ...prev]);
  };

  // --- REALTIME GPS LOGIC (FIREBASE - FAMILY SCOPED) ---

  useEffect(() => {
    if (currentUser?.role === 'parent') {
      const unsubscribe = listenToLocationUpdates(currentUser.familyId, (coords) => {
        if (!coords) return; // Mencegah crash jika data lokasi belum ada (null)

        setPhoneData(prev => ({
          ...prev,
          location: coords,
          lastPing: new Date(coords.updatedAt)
        }));

        const dist = calculateDistance(HOME_COORDS.lat, HOME_COORDS.lng, coords.lat, coords.lng);
        setDistanceFromHome(dist);
        setIsLocating(false);
        addLog('info', 'Lokasi Diperbarui', `Koordinat GPS terbaru diterima (Jarak: ${dist.toFixed(0)}m).`);
      });

      const unsubscribeStatus = listenToChildStatus(currentUser.familyId, (status) => {
        const isSos = status?.sos || false;
        setIsChildSos(isSos);

        if (isSos) {
          // Robust vibration loop for SOS
          startVibration(30000, true); // Vibrate until SOS is cleared or for 30s

          // Show Notification
          if (Notification.permission === 'granted') {
            new Notification("SOS DARURAT!", {
              body: "Anak dalam bahaya! Segera cek lokasi.",
              requireInteraction: true,
              icon: '/vite.svg'
            });
          }
        } else {
          stopVibration();
        }

        setPhoneData(prev => ({
          ...prev,
          isOnline: status?.online || false,
          batteryLevel: status?.battery || 0,
          lastPing: status?.lastSeen ? new Date(status.lastSeen) : prev.lastPing
        }));
      });
      return () => { unsubscribe(); unsubscribeStatus(); };
    }
  }, [currentUser]);

  // --- PARENT LOCATION UPLOAD (So Child can see Parent) ---
  useEffect(() => {
    if (currentUser?.role === 'parent') {
      const watchId = Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
        (pos, err) => {
          if (pos && !err) {
            updateMyLocation(currentUser.familyId, 'parent', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              updatedAt: Date.now(),
              accuracy: pos.coords.accuracy,
              provider: 'gps'
            });
          } else {
            console.error("Parent GPS Error:", err);
          }
        }
      );
      // Geolocation.watchPosition returns a Promise<string> (id)
      return () => { watchId.then(id => Geolocation.clearWatch({ id })); };
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'child') {
      const unsubscribe = listenForCommands(currentUser.familyId, async (cmd) => {
        if (!cmd || cmd.status !== 'pending') return;

        // Handle Location Request
        if (cmd.type === 'REQUEST_LOCATION') {
          await markCommandExecuted(currentUser.familyId, 'REQUEST_LOCATION');
          addLog('command', 'Permintaan Lokasi', 'Orang tua meminta lokasi terkini.');

          Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
            .then((position) => {
              const { latitude, longitude } = position.coords;
              updateDeviceLocation(currentUser.familyId, latitude, longitude);
            })
            .catch((error) => {
              addLog('danger', 'Gagal GPS', 'Tidak dapat mengambil lokasi perangkat.');
              logSystemActivity(currentUser.familyId, `GPS Error: ${error.message}`);
            });
        }
        // Handle Vibrate Command (Code 1)
        else if (cmd.type === 'VIBRATE') {
          await markCommandExecuted(currentUser.familyId, 'VIBRATE');
          addLog('command', 'Perintah Getar', 'Menerima Kode "1": Getar Berkelanjutan.');
          startVibration(0, true); // Continuous until stop
        }
        else if (cmd.type === 'STOP_VIBRATE') {
          await markCommandExecuted(currentUser.familyId, 'STOP_VIBRATE');
          addLog('command', 'Berhenti Getar', 'Perintah berhenti getar diterima.');
          stopVibration();
        }

        if (Notification.permission === 'granted') {
          new Notification("PERINGATAN DARI ORANG TUA", {
            body: "ORANG TUA MEMANGGIL! HARAP CEK HP.",
            requireInteraction: true,
          });
        }
      });

      // Setup Presence (Online/Offline)
      const unsubscribePresence = setupChildPresence(currentUser.familyId);

      // Get Real Battery Level (Web API)
      if ('getBattery' in navigator) {
        (navigator as any).getBattery().then((battery: any) => {
          updateChildBattery(currentUser.familyId, Math.floor(battery.level * 100));
          battery.addEventListener('levelchange', () => {
            updateChildBattery(currentUser.familyId, Math.floor(battery.level * 100));
          });
        });
      } else {
        updateChildBattery(currentUser.familyId, 100);
      }

      const unsubscribeParentLoc = listenToParentLocation(currentUser.familyId, (loc) => {
        if (loc) {
          setParentLocation(loc);
        }
      });

      // Child also listens to their own status to keep SOS in sync across reloads
      const unsubscribeChildStatus = listenToChildStatus(currentUser.familyId, (status) => {
        if (status) {
          setIsChildSos(status.sos || false);
        }
      });

      return () => { unsubscribe(); unsubscribePresence(); unsubscribeParentLoc(); unsubscribeChildStatus(); };
    }
  }, [currentUser]);


  // --- BLUETOOTH LOGIC ---
  useEffect(() => {
    try {
      const unsubscribe = bluetoothService.onStatusChange((connected) => {
        setBluetoothConnected(connected);
        setBraceletData(prev => ({
          ...prev,
          status: connected ? 'terhubung' : 'terputus',
          signalStrength: connected ? 75 : 0
        }));
        const logTitle = connected ? 'Bluetooth Terhubung' : 'Bluetooth Terputus';
        const logDesc = connected ? 'Berhasil terhubung ke perangkat Arduino.' : 'Koneksi ke Arduino terputus.';
        addLog('info', logTitle, logDesc);
      });
      return unsubscribe;
    } catch (error) {
      console.error("Bluetooth Service Error:", error);
    }
  }, []);

  const sendBluetoothCommand = async (command: string, description: string) => {
    if (!bluetoothConnected) {
      addLog('danger', 'Gagal Mengirim Perintah', 'Bluetooth tidak terhubung ke Arduino.');
      setToast({ message: 'Bluetooth tidak terhubung!', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    addLog('command', `Perintah Bluetooth: ${description}`, `Mengirim kode '${command}' ke modul HC-05`);
    const success = await bluetoothService.sendCommand(command);
    setBraceletData(prev => ({
      ...prev,
      lastCommandSent: success ? `Terkirim: "${command}"` : 'Gagal Terkirim',
      isBuzzerOn: command === 'A' ? true : command === 'B' ? false : prev.isBuzzerOn,
      isLedOn: command === 'L' ? true : command === 'M' ? false : prev.isLedOn,
      lastUpdate: new Date()
    }));
  };

  const sendPhoneCommand = async (action: 'VIBRATE' | 'LOCATE') => {
    if (!currentUser) return;

    if (action === 'LOCATE') {
      setIsLocating(true);
      addLog('command', 'Mencari Lokasi', 'Mengirim sinyal permintaan lokasi ke HP Anak...');
      await requestChildLocation(currentUser.familyId);
    } else if (action === 'VIBRATE') {
      addLog('command', 'Perintah Getar', 'Mengirim sinyal getar berkelanjutan ke HP Anak');

      // Update UI parent side immediately
      setPhoneData(prev => ({ ...prev, isVibrating: true }));
      startVibration(1000); // Parent phone vibrates once as feedback

      // Send actual command to Firebase
      await sendCommandToChild(currentUser.familyId, 'VIBRATE');
    }
  };

  const stopPhoneVibration = async () => {
    if (!currentUser) return;
    setPhoneData(prev => ({ ...prev, isVibrating: false }));
    addLog('command', 'Berhenti Getar', 'Mengirim perintah berhenti getar...');
    await sendCommandToChild(currentUser.familyId, 'STOP_VIBRATE');
  };

  const handleSmartTrack = async () => {
    setActiveTab('map');
    setTrackingMode('gps');
    setIsLocating(true);
    addLog('command', 'SMART TRACK', 'Memulai pelacakan cepat & membuka peta...');

    // Kirim perintah request lokasi
    if (currentUser) {
      await requestChildLocation(currentUser.familyId);
    }
  };

  const triggerSOS = () => {
    if (!currentUser) return;
    const newSosState = !isChildSos;
    setIsChildSos(newSosState);
    updateChildSos(currentUser.familyId, newSosState);

    if (newSosState) {
      startVibration(5000); // Immediate feedback for child
      addLog('danger', 'SOS DARURAT DITERIMA!', 'Anak menekan tombol darurat.');
      setBraceletData(prev => ({ ...prev, isBuzzerOn: true }));

      // Use Capacitor Geolocation
      Geolocation.getCurrentPosition({ enableHighAccuracy: true }).then((pos) => {
        updateDeviceLocation(currentUser.familyId, pos.coords.latitude, pos.coords.longitude);
      });
    } else {
      addLog('info', 'SOS Dibatalkan', 'Anak membatalkan status darurat.');
    }
  };

  const handleRunAnalysis = useCallback(async () => {
    if (aiUsage >= 30) {
      setToast({ message: 'Batas pemakaian AI (30) sudah tercapai!', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setLoadingAi(true);
    try {
      const result = await analyzeSafetyStatus(braceletData, phoneData);
      setAiAnalysis(result);
      setAiUsage(getAiUsageCount());
      addLog('info', 'AI SCAN', 'Analisis keamanan AI telah diperbarui.');
    } catch (error) {
      console.error("AI Analysis Error (400/500):", error);
      setToast({ message: 'Gagal menjalankan AI Scan. Mencoba simulasi...', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingAi(false);
    }
  }, [braceletData, phoneData, aiUsage]);

  const handleNormalScan = useCallback(async () => {
    setLoadingAi(true);
    try {
      const result = await simulateAnalysis(braceletData, phoneData);
      setAiAnalysis(result);
      addLog('info', 'NORMAL SCAN', 'Scan dasar (tanpa AI) selesai.');
    } catch (error) {
      console.error("Normal Scan Error:", error);
    } finally {
      setLoadingAi(false);
    }
  }, [braceletData, phoneData]);

  // Removed automatic AI analysis from useEffect for better control and quota saving
  /*
  useEffect(() => {
    if (currentUser?.role === 'parent') handleRunAnalysis();
  }, [currentUser, handleRunAnalysis]);
  */

  // --- RENDER ---

  const handleAuthSuccess = async (user: UserProfile) => {
    setSessionError(false);
    setCurrentUser(user);
    addLog('login', `Login ${user.role === 'parent' ? 'Orang Tua' : 'Anak'}`, `User ${user.username} berhasil masuk.`);
    localStorage.setItem('currentUser', JSON.stringify(user));

    if (user.role === 'parent') {
      getChildCredentials(user.familyId).then(creds => {
        if (creds) setChildCredentials(creds);
      });
    }

    // Meminta Izin Lokasi & Sistem saat Login
    try {
      // Permission Handling for Web & Hybrid
      if (Capacitor.getPlatform() !== 'web') {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') {
          await Geolocation.requestPermissions();
        }
      } else {
        // Web Browser Permission Request
        navigator.permissions.query({ name: 'geolocation' }).then((result) => {
          if (result.state === 'prompt') {
            navigator.geolocation.getCurrentPosition(() => { }, () => { });
          }
        });
      }
    } catch (e) {
      console.error("Gagal meminta izin lokasi:", e);
    }
  };

  const renderBatteryWarningModal = () => {
    if (!showBatteryWarning) return null;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-[2rem] p-6 text-center shadow-2xl border border-white/20 animate-scale-up">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Izin Latar Belakang</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Agar pelacakan berjalan akurat, mohon matikan "Penghemat Baterai" dan izinkan lokasi "Selalu Aktif".
          </p>
          <button onClick={() => setShowBatteryWarning(false)} className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-yellow-500/30">
            MENGERTI
          </button>
        </div>
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="h-full w-full bg-[#0B1120] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
          <div className="absolute top-[-50%] left-[-20%] w-[1000px] h-[1000px] bg-cyan-900/10 rounded-full blur-[100px] animate-blob" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[800px] h-[800px] bg-indigo-900/20 rounded-full blur-[120px] animate-blob animation-delay-2000" />
        </div>

        {/* Session Error Modal */}
        {sessionError && (
          <div className="absolute top-10 z-50 animate-pulse">
            <div className="bg-red-500/90 backdrop-blur text-white px-6 py-3 rounded-2xl shadow-xl font-bold flex items-center gap-2 border border-red-400/50">
              <AlertTriangle size={20} />
              <span>Akun telah login di perangkat lain!</span>
            </div>
          </div>
        )}

        <div className="w-full max-w-md relative z-10 flex flex-col items-center">
          <div className="mb-12 text-center">
            <div className="relative inline-block">
              <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-t from-slate-500 to-white mb-2 tracking-tighter drop-shadow-2xl">
                GUARDIAN
              </h1>
              <div className="absolute -top-6 -right-6 w-12 h-12 bg-cyan-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500/50"></div>
              <p className="text-cyan-400/90 text-[10px] font-bold tracking-[0.6em] uppercase">Security System</p>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500/50"></div>
            </div>
          </div>

          <Auth onLoginSuccess={handleAuthSuccess} />

          <div className="mt-16 text-slate-500 text-[10px] font-mono tracking-widest opacity-60">
            SECURE CONNECTION ESTABLISHED
          </div>
        </div>
      </div>
    );
  }

  // Child View (Simplified - White Clean)
  if (currentUser.role === 'child') {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-4">
        {renderBatteryWarningModal()}
        <div className="w-full max-w-lg h-full sm:h-[90vh] bg-white rounded-[3rem] border-8 border-white shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-slate-200">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>

          {showChildMap ? (
            <div className="relative w-full h-full">
              <iframe width="100%" height="100%" src={`https://maps.google.com/maps?q=${parentLocation?.lat || -6.175392},${parentLocation?.lng || 106.827153}&z=16&output=embed`} style={{ border: 0 }} allowFullScreen loading="lazy" title="Lokasi Ortu"></iframe>
              <button onClick={() => setShowChildMap(false)} className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white text-slate-800 px-6 py-3 rounded-full font-bold shadow-xl border border-slate-100 z-10 hover:bg-slate-50">TUTUP PETA</button>
              <div className="absolute top-4 left-4 right-4 bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-slate-100 text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">LOKASI ORANG TUA</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Updated: {parentLocation ? new Date(parentLocation.updatedAt).toLocaleTimeString() : 'Menunggu...'}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full px-6">
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-black text-slate-800 tracking-widest">GUARDIAN<span className="text-blue-500">KIDS</span></h1>
                  <p className="text-xs text-slate-400 font-mono tracking-[0.4em] uppercase mt-2">{currentUser.username}</p>
                </div>

                <div onClick={triggerSOS} className={`w-56 h-56 rounded-full border-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-500 group relative ${isChildSos ? 'border-red-500 bg-red-50 shadow-[0_0_60px_rgba(239,68,68,0.4)]' : 'border-blue-100 bg-blue-50 hover:border-blue-200 hover:shadow-xl hover:scale-105'}`}>
                  <div className={`absolute inset-0 rounded-full border border-white/50 ${isChildSos ? 'animate-ping' : ''}`}></div>
                  <AlertTriangle size={64} className={`mb-2 transition-colors ${isChildSos ? 'text-red-500 animate-pulse' : 'text-blue-400 group-hover:text-blue-500'}`} />
                  <h2 className={`text-2xl font-black tracking-widest ${isChildSos ? 'text-red-500' : 'text-slate-700'}`}>{isChildSos ? 'SOS SENT' : 'SOS'}</h2>
                  <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1">{isChildSos ? 'DARURAT!' : 'TEKAN DULU'}</p>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-4 w-full">
                  <button onClick={() => setShowChildMap(true)} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-md hover:shadow-lg hover:-translate-y-1 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 group">
                    <MapPinned size={28} className="text-purple-500 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lacak Ortu</span>
                  </button>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center justify-center gap-2 opacity-60 cursor-not-allowed">
                    <Bluetooth size={28} className="text-blue-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Connected</span>
                  </div>
                </div>
              </div>

              <div className="p-6 z-10 w-full">
                <button onClick={() => { setCurrentUser(null); localStorage.removeItem('currentUser'); }} className="w-full py-4 border border-slate-200 bg-slate-50 text-slate-400 rounded-2xl font-bold text-xs hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all flex items-center justify-center gap-2"><LogOut size={16} /> KELUAR AKSES</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Parent View Content
  const renderParentContent = () => {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          {(() => {
            switch (activeTab) {
              case 'home':
                return (
                  <div className="space-y-6 pb-24">
                    {/* Main Status Hero with Hover Animation */}
                    <div className={`p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl transition-all duration-500 hover:scale-[1.02] ${((braceletData.isBuzzerOn && bluetoothConnected) || isChildSos) ? 'bg-red-600' : 'bg-indigo-600'}`}>
                      <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-2xl"></div>
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                          <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl">
                            <ShieldCheck size={32} className="text-white" />
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Sinyal Gelang</span>
                            <div className="flex items-center gap-1">
                              <Bluetooth size={14} className="text-white" />
                              <span className="text-xl font-black text-white">{bluetoothConnected ? braceletData.signalStrength : 0}%</span>
                            </div>
                          </div>
                        </div>
                        <h2 className="text-3xl font-black text-white leading-none mb-1">
                          {((braceletData.isBuzzerOn && bluetoothConnected) || isChildSos) ? 'BAHAYA TERDETEKSI' : 'AMAN TERKENDALI'}
                        </h2>
                        <p className="text-white/70 text-sm font-medium">
                          {((braceletData.isBuzzerOn && bluetoothConnected) || isChildSos) ? 'Segera periksa kondisi anak!' : 'Sistem berjalan normal. Tidak ada anomali.'}
                        </p>
                      </div>
                    </div>

                    {/* Arduino Controls - Highlighted */}
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2 px-1">
                        <Zap size={18} className="text-yellow-500 fill-yellow-500" /> KONTROL ARDUINO
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          disabled={!bluetoothConnected}
                          onClick={() => sendBluetoothCommand(braceletData.isBuzzerOn ? 'B' : 'A', 'Buzzer')}
                          className={`relative group overflow-hidden p-6 rounded-[2rem] border-2 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 active:scale-95 ${!bluetoothConnected ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${braceletData.isBuzzerOn && bluetoothConnected ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-red-200 dark:text-white'}`}
                        >
                          <div className={`absolute inset-0 bg-red-500/10 translate-y-full group-hover:translate-y-0 transition-transform ${braceletData.isBuzzerOn ? 'hidden' : ''}`}></div>
                          <Volume2 size={32} className={`mb-3 ${braceletData.isBuzzerOn && bluetoothConnected ? 'animate-pulse' : 'text-slate-400'}`} />
                          <p className="font-black text-lg">{braceletData.isBuzzerOn && bluetoothConnected ? 'MATIKAN' : 'BUNYIKAN'}</p>
                          <p className={`text-xs font-bold ${braceletData.isBuzzerOn && bluetoothConnected ? 'text-red-200' : 'text-slate-400'}`}>BUZZER ALARM</p>
                        </button>

                        <button
                          disabled={!bluetoothConnected}
                          onClick={() => sendBluetoothCommand(braceletData.isLedOn ? 'M' : 'L', 'LED')}
                          className={`relative group overflow-hidden p-6 rounded-[2rem] border-2 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 active:scale-95 ${!bluetoothConnected ? 'opacity-50 grayscale cursor-not-allowed' : ''} ${braceletData.isLedOn && bluetoothConnected ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-cyan-200 dark:text-white'}`}
                        >
                          <div className={`absolute inset-0 bg-cyan-500/10 translate-y-full group-hover:translate-y-0 transition-transform ${braceletData.isLedOn ? 'hidden' : ''}`}></div>
                          <Lightbulb size={32} className={`mb-3 ${braceletData.isLedOn && bluetoothConnected ? 'animate-pulse text-yellow-300 fill-yellow-300' : 'text-slate-400'}`} />
                          <p className="font-black text-lg">{braceletData.isLedOn && bluetoothConnected ? 'MATIKAN' : 'NYALAKAN'}</p>
                          <p className={`text-xs font-bold ${braceletData.isLedOn && bluetoothConnected ? 'text-cyan-100' : 'text-slate-400'}`}>LAMPU DARURAT</p>
                        </button>
                      </div>
                    </div>

                    {/* Vibration Control - Add Stop Button */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 px-1">
                          <Vibrate size={18} className="text-indigo-500" /> KONTROL GETAR HP ANAK
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phoneData.isVibrating ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                          {phoneData.isVibrating ? 'STATUS: BERGETAR' : 'STATUS: DIAM'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => sendPhoneCommand('VIBRATE')}
                          className="py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <Vibrate size={18} /> MULAI GETAR
                        </button>
                        <button
                          disabled={!phoneData.isVibrating}
                          onClick={stopPhoneVibration}
                          className="py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-2xl font-bold text-sm hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <ShieldAlert size={18} /> STOP GETAR
                        </button>
                      </div>
                    </div>

                    {/* AI Security Card */}
                    <div className="bg-slate-900 rounded-[2rem] p-6 shadow-xl relative overflow-hidden group transition-all duration-500 hover:shadow-2xl hover:scale-[1.01]">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900"></div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500 rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"></div>

                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <h3 className="font-bold text-white text-sm tracking-widest">AI GUARDIAN ANALYTICS</h3>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleNormalScan} disabled={loadingAi} className="text-[10px] bg-slate-700 text-slate-300 px-3 py-1 rounded-full font-bold hover:bg-slate-600 transition-all active:scale-90">
                              NORMAL SCAN
                            </button>
                            <button onClick={handleRunAnalysis} disabled={loadingAi || aiUsage >= 10} className={`text-[10px] px-3 py-1 rounded-full font-bold transition-all active:scale-90 ${aiUsage >= 10 ? 'bg-red-900/40 text-red-400 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                              {loadingAi ? 'SCANNING...' : `SCAN WITH AI (${10 - aiUsage}/10)`}
                            </button>
                          </div>
                        </div>

                        {aiAnalysis ? (
                          <div className="space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <p className="text-cyan-100 font-medium leading-relaxed text-sm">"{aiAnalysis.message}"</p>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${aiAnalysis.riskLevel === 'Bahaya' ? 'bg-red-500 text-white' : aiAnalysis.riskLevel === 'Waspada' ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
                                {aiAnalysis.riskLevel.toUpperCase()}
                              </span>
                            </div>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                              <p className="text-[10px] text-slate-400 mb-1">REKOMENDASI SISTEM</p>
                              <p className="text-xs text-white font-bold">{aiAnalysis.recommendation}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-slate-500 text-xs font-mono">Pilih tombol scan untuk memulai analisis...</div>
                        )}
                      </div>
                    </div>

                    {/* Batteries */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="transition-transform hover:scale-105 duration-300">
                        <StatusCard icon={<Battery className={braceletData.batteryLevel > 20 ? "text-green-500" : "text-red-500"} />} label="Baterai Gelang" value={braceletData.batteryLevel > 0 ? braceletData.batteryLevel.toFixed(0) : '--'} unit="%" color="bg-white dark:bg-slate-800 shadow-sm hover:shadow-md dark:text-white" />
                      </div>
                      <div className="transition-transform hover:scale-105 duration-300">
                        <StatusCard
                          icon={<Smartphone className={phoneData.isOnline ? "text-purple-500" : "text-gray-400"} />}
                          label={phoneData.isOnline ? "HP Anak (Online)" : "HP Anak (Offline)"}
                          value={phoneData.isOnline ? phoneData.batteryLevel.toFixed(0) : 'OFF'}
                          unit={phoneData.isOnline ? "%" : ""}
                          color={`bg-white dark:bg-slate-800 shadow-sm hover:shadow-md dark:text-white ${!phoneData.isOnline && 'opacity-70 grayscale'}`}
                          textColor={phoneData.isOnline ? "text-purple-600" : "text-gray-400"}
                        />
                      </div>
                    </div>
                  </div>
                );
              case 'controls': return (
                <div className="space-y-6 pb-24">
                  <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-[3rem] shadow-2xl text-white text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                    <h2 className="text-2xl font-black relative z-10">PUSAT KONTROL</h2>
                    <p className="text-white/60 text-xs font-bold tracking-widest relative z-10 mt-2">REMOTE ACCESS PROTOCOL</p>
                  </div>


                  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-4 uppercase tracking-wider text-center">Fungsi Darurat</h3>
                    <div className="space-y-3">
                      {/* SMART TRACK BUTTON */}
                      <button onClick={handleSmartTrack} className="w-full py-6 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-lg flex items-center justify-between shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="bg-white/20 p-2 rounded-full"><Navigation size={24} className="animate-pulse" /></div>
                          <div className="text-left leading-tight">
                            <span className="block text-[10px] text-blue-100 font-medium tracking-widest">REALTIME GPS</span>
                            LACAK SEKARANG
                          </div>
                        </div>
                        <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                      </button>

                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-2"></div>

                      <button onClick={() => sendPhoneCommand('VIBRATE')} disabled={phoneData.isVibrating} className="w-full py-5 px-6 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-white rounded-2xl font-bold text-sm flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors active:scale-95">
                        <div className="flex items-center gap-3"><Vibrate size={20} /><span>Getarkan HP Anak</span></div>
                        {phoneData.isVibrating && <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded">SENDING...</span>}
                      </button>
                      <button onClick={() => sendPhoneCommand('LOCATE')} disabled={isLocating} className="w-full py-5 px-6 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-2xl font-bold text-sm flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors active:scale-95">
                        <div className="flex items-center gap-3"><Radio size={20} /><span>Ping Lokasi Terkini</span></div>
                        <span className={`text-[10px] bg-white dark:bg-slate-800 px-2 py-1 rounded-md text-blue-500 shadow-sm border border-blue-100 dark:border-slate-600 ${isLocating ? 'animate-pulse' : ''}`}>{isLocating ? 'Mencari...' : 'READY'}</span>
                      </button>
                    </div>
                  </div >
                </div >
              );
              case 'map':
                const lat = phoneData.location?.lat || -6.175392;
                const lng = phoneData.location?.lng || 106.827153;
                return (
                  <div className="h-full flex flex-col">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex gap-2 mb-4 shrink-0 transition-colors">
                      <button onClick={() => setTrackingMode('gps')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${trackingMode === 'gps' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><MapPin size={16} /> GPS MAP</button>
                      <button onClick={() => setTrackingMode('bluetooth')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${trackingMode === 'bluetooth' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-gray-400'}`}><Bluetooth size={16} /> RADAR</button>
                    </div>
                    <div className="flex-1 bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-inner border border-gray-200 dark:border-slate-700 relative transition-colors">
                      {trackingMode === 'gps' ? (
                        <div className="w-full h-full relative group">
                          <iframe width="100%" height="100%" src={`https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`} style={{ border: 0 }} allowFullScreen loading="lazy" title="Lokasi Anak"></iframe>
                        </div>
                      ) : (
                        <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center relative overflow-hidden p-6 text-center">
                          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                          {!bluetoothConnected ? (
                            <div className="relative z-10 flex flex-col items-center animate-pulse">
                              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                                <Bluetooth size={40} className="text-red-500" />
                              </div>
                              <h3 className="text-white font-bold text-lg">Bluetooth Tidak Terhubung</h3>
                              <p className="text-slate-400 text-xs mt-2 max-w-[200px]">Silakan hubungkan ke gelang Arduino di menu Setelan untuk menggunakan fitur Radar.</p>
                              <button onClick={() => setActiveTab('settings')} className="mt-6 px-6 py-2 bg-red-600 text-white rounded-full text-xs font-bold hover:bg-red-700 transition-colors">BUKA SETELAN</button>
                            </div>
                          ) : (
                            <>
                              <div className="relative flex items-center justify-center w-64 h-64">
                                <div className="absolute inset-0 border-2 border-blue-500/30 rounded-full animate-ping-slow"></div>
                                <div className="absolute inset-12 border border-blue-500/50 rounded-full"></div>
                                <div className="absolute inset-24 border border-blue-500/80 rounded-full bg-blue-500/10"></div>
                                <Bluetooth size={40} className="text-blue-400 relative z-10 animate-pulse" />
                              </div>
                              <div className="mt-6 bg-slate-800/50 backdrop-blur border border-slate-700 p-4 rounded-xl">
                                <p className="text-blue-400 text-sm font-bold flex items-center justify-center gap-2"><Signal size={16} /> {braceletData.signalStrength > 60 ? 'JARAK DEKAT' : 'JARAK JAUH'}</p>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              case 'settings':
                return (
                  <div className="space-y-4 pb-24">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800 dark:text-white"><ShieldCheck size={20} /> PANDUAN PERIZINAN</h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                          <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">PENTING BAGI ANAK & ORANG TUA:</p>
                          <ul className="text-[11px] space-y-2 text-blue-700 dark:text-blue-400 list-disc pl-4">
                            <li><b>Bluetooth:</b> Harus SELALU aktif untuk kontrol gelang Arduino.</li>
                            <li><b>Lokasi (GPS):</b> Set ke "Izinkan sepanjang waktu" agar pelacakan tetap jalan di background.</li>
                            <li><b>Optimasi Baterai:</b> Matikan pembatasan baterai untuk aplikasi ini agar sistem tidak mati otomatis.</li>
                          </ul>
                        </div>
                        <button
                          onClick={() => {
                            setToast({ message: 'Buka Pengaturan HP > Aplikasi > Guardian > Izin', type: 'success' });
                            setTimeout(() => setToast(null), 5000);
                          }}
                          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Settings size={18} /> PENGATURAN APLIKASI
                        </button>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800 dark:text-white"><Radio size={20} /> DIAGNOSTIK PERANGKAT</h3>
                      <button onClick={() => startVibration(3000)} className="w-full py-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/30 flex items-center justify-center gap-2 transition-colors">
                        <Vibrate size={18} /> TEST GETAR (3 DETIK)
                      </button>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800 dark:text-white"><Lock size={20} /> AKUN & SESI</h3>
                      <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl mb-4 border border-slate-200 dark:border-slate-700 text-center transition-colors">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3 shadow-lg">{currentUser.name.charAt(0).toUpperCase()}</div>
                        <p className="font-black text-gray-800 dark:text-white text-lg">{currentUser.username}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{currentUser.role === 'parent' ? 'Administrator' : 'Unit Anak'}</p>
                      </div>
                      <button onClick={() => { setCurrentUser(null); localStorage.removeItem('currentUser'); }} className="w-full py-4 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-2xl font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/30 flex items-center justify-center gap-2 transition-colors"><LogOut size={18} /> LOGOUT SYSTEM</button>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800 dark:text-white"><Bluetooth size={20} /> KONEKSI ARDUINO</h3>
                      {/* Komponen Bluetooth asli diintegrasikan di sini */}
                      <BluetoothConnect onConnected={setBluetoothConnected} />
                    </div>
                  </div>
                );
              default: return null;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    );
  };

  const renderNotificationModal = () => {
    if (!showNotifications) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
        <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col max-h-[80vh] animate-scale-up">
          <div className="p-6 pb-4 border-b border-gray-100 flex justify-between items-center">
            <div><h2 className="text-xl font-bold text-gray-800">SYSTEM LOGS</h2><p className="text-xs text-gray-500">Riwayat aktivitas perangkat</p></div>
            <button onClick={() => setShowNotifications(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X size={20} className="text-gray-600" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center"><History size={48} className="mb-2 opacity-50" /><p>Belum ada aktivitas tercatat.</p></div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`p-4 rounded-xl border-l-4 ${log.type === 'danger' ? 'border-red-500 bg-red-50' : log.type === 'info' ? 'border-blue-500 bg-blue-50' : log.type === 'command' ? 'border-purple-500 bg-purple-50' : 'border-green-500 bg-green-50'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${log.type === 'danger' ? 'bg-red-200 text-red-700' : log.type === 'info' ? 'bg-blue-200 text-blue-700' : log.type === 'command' ? 'bg-purple-200 text-purple-700' : 'bg-green-200 text-green-700'}`}>{log.type}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <h4 className="font-bold text-gray-800 text-sm">{log.title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{log.description}</p>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-[2rem]"><button onClick={() => setLogs([])} className="w-full py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-dashed border-red-200">BERSIHKAN LOG</button></div>
        </div>
      </div>
    );
  };

  const notificationCount = logs.filter(l => l.type === 'danger').length;

  const renderToast = () => {
    return (
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`absolute top-24 left-1/2 z-50 px-6 py-3 rounded-full shadow-xl font-bold text-white text-sm flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
          >
            {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="h-full w-full bg-indigo-50/50 dark:bg-slate-900 font-sans text-gray-900 dark:text-gray-100 flex items-center justify-center p-0 sm:p-4 lg:p-8 transition-colors duration-300 relative overflow-hidden">
      {/* Dashboard Background Blobs (Dark Mode Only) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-0 dark:opacity-100 transition-opacity duration-500">
        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] animate-blob" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] animate-blob animation-delay-2000" />
      </div>
      <div className="w-full max-w-lg lg:max-w-4xl h-full sm:h-[90vh] bg-white dark:bg-slate-800 sm:rounded-[3rem] shadow-2xl relative flex flex-col sm:border-8 border-white dark:border-slate-700 ring-1 ring-gray-200 dark:ring-slate-700 overflow-hidden transition-colors duration-300 z-10">
        <Header
          title={activeTab === 'home' ? 'Dashboard' : activeTab === 'map' ? 'Pelacakan' : activeTab === 'controls' ? 'Kontrol' : 'Profil'}
          notificationCount={notificationCount}
          onNotificationClick={() => setShowNotifications(true)}
          darkMode={darkMode}
          toggleDarkMode={() => setDarkMode(!darkMode)}
        />
        {renderToast()}
        <div className={`flex-1 overflow-y-auto ${activeTab === 'map' ? 'p-0' : 'p-4 sm:p-6'} scrollbar-hide relative bg-slate-50 dark:bg-slate-900 transition-colors duration-300`}>
          {renderParentContent()}
        </div>
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} bluetoothConnected={bluetoothConnected} />
        {renderNotificationModal()}
        {renderBatteryWarningModal()}

        {/* Onboarding Modal */}
        {showOnboarding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-slate-900/80">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[3rem] p-8 shadow-2xl overflow-hidden relative"
            >
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <div className="relative z-10 text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl rotate-3">
                  <ShieldCheck size={40} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">SELAMAT DATANG!</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                  Aplikasi <b>Guardian</b> siap menjaga buah hati Anda. Pastikan Bluetooth & GPS selalu aktif agar fitur pelacakan dan SOS berfungsi maksimal.
                </p>

                <div className="space-y-4 mb-8 text-left bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center text-[10px] font-bold">1</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Sambungkan gelang ke Bluetooth via Dashboard.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">2</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Klik <b>SMART TRACK</b> untuk melihat lokasi real-time.</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-full flex items-center justify-center text-[10px] font-bold">3</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Gunakan <b>AI SCAN</b> untuk analisis keamanan canggih.</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowOnboarding(false);
                    localStorage.setItem('hasSeenOnboarding', 'true');
                  }}
                  className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold tracking-widest shadow-xl hover:shadow-indigo-500/30 transition-all active:scale-95"
                >
                  MENGERTI & MULAI
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

// Export default component
export default App;
