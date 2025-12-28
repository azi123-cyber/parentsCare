
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, get, update, child, onDisconnect } from "firebase/database";
import { GPSCoordinates, UserProfile, ChildCredentials } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyAu9qFznOcpMgndeGPzvwK1wV2ZGePNsVU",
  authDomain: "parrets-care.firebaseapp.com",
  databaseURL: "https://parrets-care-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "parrets-care",
  storageBucket: "parrets-care.firebasestorage.app",
  messagingSenderId: "727157167910",
  appId: "1:727157167910:android:74aafff540892a64a6d3e7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- AUTHENTICATION ---

export const registerTemporaryAccount = async (
  username: string,
  password: string,
  childName: string,
  childPhone: string
) => {
  const sanitizedUser = username.toLowerCase().replace(/\s/g, '');
  // Check if user already exists
  const userCheck = await get(ref(db, `users/${sanitizedUser}`));
  if (userCheck.exists()) throw new Error("Username sudah terpakai.");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await set(ref(db, `temp_registrations/${sanitizedUser}`), {
    username: sanitizedUser,
    password,
    childName,
    childPhone,
    otp,
    createdAt: Date.now()
  });
  return otp;
};

export const verifyOtpAndCreateAccount = async (username: string, inputOtp: string): Promise<UserProfile | null> => {
  const sanitizedUser = username.toLowerCase().replace(/\s/g, '');
  const tempRef = ref(db, `temp_registrations/${sanitizedUser}`);
  const snapshot = await get(tempRef);

  if (!snapshot.exists()) throw new Error("Data pendaftaran tidak ditemukan. Silakan daftar ulang.");

  const data = snapshot.val();
  if (String(data.otp) !== String(inputOtp)) throw new Error("Kode OTP salah.");

  const familyId = `fam_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Use child's actual name for username (sanitized)
  const childUsername = data.childName.toLowerCase().replace(/\s/g, '');

  // Generate stronger password (alphanumeric, 8 chars)
  const childPassword = Math.random().toString(36).slice(-8);
  const sessionId = Date.now().toString();

  const parentData = {
    password: data.password,
    role: 'parent',
    familyId,
    name: 'Orang Tua',
    sessionId
  };

  const childData = {
    password: childPassword,
    role: 'child',
    familyId,
    name: data.childName,
    phoneNumber: data.childPhone,
    sessionId
  };

  // Atomic update to ensure all data exists
  const updates: any = {};
  updates[`users/${sanitizedUser}`] = parentData;
  updates[`users/${childUsername}`] = childData;
  updates[`families/${familyId}`] = {
    parentUsername: sanitizedUser,
    childUsername: childUsername,
    createdAt: Date.now(),
    childCredentials: { username: childUsername, pin: childPassword } // Keeping key as 'pin' for compatibility but storing password
  };

  await update(ref(db), updates);
  await remove(tempRef);

  return { username: sanitizedUser, ...parentData } as UserProfile;
};

export const loginUser = async (username: string, password: string): Promise<UserProfile> => {
  const sanitizedUser = username.toLowerCase().replace(/\s/g, '');
  const userRef = ref(db, `users/${sanitizedUser}`);
  const snapshot = await get(userRef);

  if (!snapshot.exists()) throw new Error("Username tidak ditemukan.");

  const userData = snapshot.val();
  if (userData.password !== password) throw new Error("Password salah.");

  const newSessionId = Date.now().toString();
  await update(userRef, { sessionId: newSessionId });

  return {
    username: sanitizedUser,
    role: userData.role,
    familyId: userData.familyId,
    name: userData.name,
    phoneNumber: userData.phoneNumber,
    sessionId: newSessionId
  };
};

export const listenToSessionChanges = (username: string, currentSessionId: string, onSessionExpired: () => void) => {
  return onValue(ref(db, `users/${username}/sessionId`), (snapshot) => {
    const serverId = snapshot.val();
    if (serverId && String(serverId) !== String(currentSessionId)) {
      onSessionExpired();
    }
  });
};

export const getChildCredentials = async (familyId: string): Promise<ChildCredentials | null> => {
  const s = await get(ref(db, `families/${familyId}/childCredentials`));
  return s.exists() ? s.val() : null;
};

// --- REALTIME LOCATION (BIDIRECTIONAL) ---

// Update own location (Generic for Parent or Child)
export const updateMyLocation = async (familyId: string, role: 'parent' | 'child', coords: GPSCoordinates) => {
  const path = role === 'child' ? 'childLocation' : 'parentLocation';
  await set(ref(db, `families/${familyId}/${path}`), coords);
};

// Parent listens to Child's location
export const listenToChildLocation = (familyId: string, callback: (coords: GPSCoordinates | null) => void) => {
  return onValue(ref(db, `families/${familyId}/childLocation`), (s) => callback(s.exists() ? s.val() : null));
};

// Alias agar sesuai dengan import di App.tsx
export const listenToLocationUpdates = listenToChildLocation;

export const updateDeviceLocation = async (familyId: string, lat: number, lng: number) => {
  await updateMyLocation(familyId, 'child', { lat, lng, updatedAt: Date.now(), accuracy: 0, provider: 'network' });
};

// Child listens to Parent's location
export const listenToParentLocation = (familyId: string, callback: (coords: GPSCoordinates | null) => void) => {
  return onValue(ref(db, `families/${familyId}/parentLocation`), (s) => callback(s.exists() ? s.val() : null));
};

// --- COMMANDS ---

export const sendCommandToChild = async (familyId: string, commandType: 'VIBRATE' | 'STOP_VIBRATE' | 'BUZZER_ON' | 'BUZZER_OFF' | 'REQUEST_LOCATION') => {
  const timestamp = Date.now();
  await set(ref(db, `families/${familyId}/commands`), {
    type: commandType,
    status: 'pending',
    timestamp: timestamp
  });
  await logSystemActivity(familyId, `Parent sent command: ${commandType}`);
};

export const requestChildLocation = async (familyId: string) => {
  await sendCommandToChild(familyId, 'REQUEST_LOCATION');
};

export const listenForCommands = (familyId: string, onCommand: (cmd: { type: string, status: string, timestamp: number }) => void) => {
  return onValue(ref(db, `families/${familyId}/commands`), (snapshot) => {
    if (snapshot.exists()) {
      onCommand(snapshot.val());
    }
  });
};

export const markCommandExecuted = async (familyId: string, type: string) => {
  await update(ref(db, `families/${familyId}/commands`), { status: 'executed', executedAt: Date.now() });
  await logSystemActivity(familyId, `Child executed command: ${type}`);
};

export const clearCommand = async (familyId: string) => {
  await remove(ref(db, `families/${familyId}/commands`));
};

// --- SYSTEM LOGS & ACTIVITY ---

export const logSystemActivity = async (familyId: string, message: string) => {
  const logRef = ref(db, `families/${familyId}/logs/${Date.now()}`);
  await set(logRef, {
    message,
    timestamp: Date.now()
  });

  // Optional: Limit logs to last 20 entries
  get(ref(db, `families/${familyId}/logs`)).then((snapshot) => {
    if (snapshot.exists()) {
      const logs = snapshot.val();
      const keys = Object.keys(logs).sort();
      if (keys.length > 20) {
        remove(ref(db, `families/${familyId}/logs/${keys[0]}`));
      }
    }
  });
};

// --- PRESENCE & STATUS SYSTEM ---

export const setupChildPresence = (familyId: string) => {
  const statusRef = ref(db, `families/${familyId}/childStatus`);
  const connectedRef = ref(db, '.info/connected');

  return onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(statusRef).update({ online: false, lastSeen: Date.now() });
      update(statusRef, { online: true, lastSeen: Date.now() });
      logSystemActivity(familyId, "Child device connected");
    }
  });
};

export const listenToChildStatus = (familyId: string, callback: (status: { online: boolean, lastSeen: number, battery?: number, sos?: boolean } | null) => void) => {
  return onValue(ref(db, `families/${familyId}/childStatus`), (s) => callback(s.exists() ? s.val() : null));
};

export const updateChildBattery = async (familyId: string, level: number) => {
  await update(ref(db, `families/${familyId}/childStatus`), { battery: level });
};

export const updateChildSos = async (familyId: string, isSos: boolean) => {
  await update(ref(db, `families/${familyId}/childStatus`), { sos: isSos, lastSeen: Date.now() });
  await logSystemActivity(familyId, `SOS status changed: ${isSos}`);
};
