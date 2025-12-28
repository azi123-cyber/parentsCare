
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
  isVibrating?: boolean;
  gpsActive?: boolean;
  lastPing?: Date;
  isCharging?: boolean; // Made optional
  location?: Partial<GPSCoordinates> & { lat: number, lng: number, updatedAt: number }; // Allow partial for compatibility
}

export interface BraceletData {
  id: string;
  childName?: string; // Added
  status: 'terhubung' | 'terputus';
  lastUpdate: Date;
  rawValue?: string; // Made optional
  batteryLevel: number;
  isBuzzerOn: boolean;
  isLedOn: boolean;
  lastCommandSent?: string; // Added
  signalStrength: number; // Added
  locationName?: string; // Added
}

export interface AnalysisResult {
  message: string;
  recommendation: string;
  riskLevel: string;
}
