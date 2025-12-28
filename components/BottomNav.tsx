
import React from 'react';
import { Home, Map, Gamepad2, Settings, AlertCircle } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  bluetoothConnected?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab, bluetoothConnected = false }) => {
  const tabs = [
    { id: 'home', icon: <Home size={24} />, label: 'Beranda' },
    { id: 'map', icon: <Map size={24} />, label: 'Lokasi' },
    { id: 'controls', icon: <Gamepad2 size={24} />, label: 'Kontrol' },
    { id: 'settings', icon: <Settings size={24} />, label: 'Setelan' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 pb-safe pt-2 px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50 transition-colors duration-300">
      {!bluetoothConnected && (
        <div className="mb-2 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-900/30 p-2 rounded transition-colors">
          <AlertCircle size={14} />
          <span>Bluetooth belum terhubung ke Arduino</span>
        </div>
      )}
      <div className="flex justify-between items-center max-w-md mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={false}
            className={`flex flex-col items-center gap-1 p-2 transition-all duration-300 ${activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400 -translate-y-2' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            <div className={`p-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-indigo-50 dark:bg-slate-700 shadow-sm' : ''}`}>
              {tab.icon}
            </div>
            <span className={`text-[10px] font-medium transition-opacity ${activeTab === tab.id ? 'opacity-100' : 'opacity-0 hidden'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
