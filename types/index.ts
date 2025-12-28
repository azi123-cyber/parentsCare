export interface GPSCoordinates {
  latitude: number;
  longitude: number;
}

export interface UserProfile {
  username: string;
  role: 'parent' | 'child';
  familyId: string;
  name: string;
  phoneNumber?: string;
  sessionId: string;
}

export interface ChildCredentials {
  username: string;
  pin: string;
}

export interface BluetoothStatus {
  isConnected: boolean;
  deviceName?: string;
  error?: string;
}