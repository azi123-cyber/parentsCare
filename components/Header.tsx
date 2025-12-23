
import React from 'react';
import { Bell, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  notificationCount?: number;
  onNotificationClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, notificationCount = 0, onNotificationClick }) => {
  return (
    <div className="bg-white px-6 py-6 border-b border-gray-100 sticky top-0 z-20">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100">
             <User size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Selamat Datang</p>
            <h2 className="font-bold text-gray-800 text-sm">Parent Admin</h2>
          </div>
        </div>
        <button 
          onClick={onNotificationClick}
          className="p-2.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors relative border border-gray-100"
        >
          <Bell size={20} className="text-gray-600" />
          {notificationCount > 0 && (
            <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
          )}
        </button>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
    </div>
  );
};
