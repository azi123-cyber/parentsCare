import React from 'react';

interface StatusCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  textColor?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ icon, label, value, unit, color, textColor }) => {
  return (
    <div className={`p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 ${color} transition-transform hover:scale-105`}>
      <div className="p-2 bg-white/60 rounded-full backdrop-blur-sm">
        {icon}
      </div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      <div className={`text-2xl font-bold ${textColor || 'text-gray-800'}`}>
        {value}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </div>
    </div>
  );
};
