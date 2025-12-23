import React from 'react';
import { Home, Map, Gamepad2, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'home', icon: <Home size={24} />, label: 'Beranda' },
    { id: 'map', icon: <Map size={24} />, label: 'Lokasi' },
    { id: 'controls', icon: <Gamepad2 size={24} />, label: 'Kontrol' },
    { id: 'settings', icon: <Settings size={24} />, label: 'Setelan' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe pt-2 px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 p-2 transition-all duration-300 ${
              activeTab === tab.id ? 'text-indigo-600 -translate-y-2' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className={`p-2 rounded-full ${activeTab === tab.id ? 'bg-indigo-50 shadow-sm' : ''}`}>
              {tab.icon}
            </div>
            <span className={`text-[10px] font-medium ${activeTab === tab.id ? 'opacity-100' : 'opacity-0 hidden'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
