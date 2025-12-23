
export type UserRole = 'parent' | 'child' | null;

export type LogType = 'danger' | 'info' | 'login' | 'command';

export interface UserProfile {
  username: string;
  role: UserRole;
  familyId: string;
  name: string;
  phoneNumber?: string;
  sessionId?: string;
}

export interface ChildCredentials {
  username: string;
  pin: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: LogType;
  title: string;
  description: string;
}

export interface GPSCoordinates {
  lat: number;
  lng: number;
  accuracy: number;
  updatedAt: number;
  provider: 'gps' | 'network' | 'manual';
}

export interface PhoneData {
  isOnline: boolean;
  batteryLevel: number; // Real API
  isCharging: boolean;
  location?: GPSCoordinates;
}

export interface BraceletData {
  id: string;
  status: 'terhubung' | 'terputus';
  lastUpdate: Date;
  rawValue: string; // Raw data string from Arduino
  batteryLevel: number; // Parsed from Arduino
  isBuzzerOn: boolean;
  isLedOn: boolean;
}

export interface AnalysisResult {
  message: string;
  recommendation: string;
  riskLevel: string;
}
