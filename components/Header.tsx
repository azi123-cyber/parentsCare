
import React from 'react';
import { Bell, User, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  title: string;
  notificationCount?: number;
  onNotificationClick: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, notificationCount = 0, onNotificationClick, darkMode, toggleDarkMode }) => {
  return (
    <div className="bg-white dark:bg-slate-800 px-6 py-6 border-b border-gray-100 dark:border-slate-700 sticky top-0 z-20 transition-colors duration-300">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-slate-700 rounded-full flex items-center justify-center border border-blue-100 dark:border-slate-600 transition-colors">
            <User size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 dark:text-slate-400 font-bold uppercase tracking-wider">Selamat Datang</p>
            <h2 className="font-bold text-gray-800 dark:text-white text-sm">Parent Admin</h2>
          </div>
        </div>
        <div className="flex items-center">
          <button
            onClick={toggleDarkMode}
            className="p-2.5 mr-2 bg-gray-50 dark:bg-slate-700 rounded-full hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors relative border border-gray-100 dark:border-slate-600"
          >
            {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-600" />}
          </button>
          <button
            onClick={onNotificationClick}
            className="p-2.5 bg-gray-50 dark:bg-slate-700 rounded-full hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors relative border border-gray-100 dark:border-slate-600"
          >
            <Bell size={20} className="text-gray-600 dark:text-gray-300" />
            {notificationCount > 0 && (
              <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </button>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight transition-colors">{title}</h1>
    </div>
  );
};
