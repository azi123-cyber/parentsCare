
import React, { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, Smartphone, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { registerTemporaryAccount, verifyOtpAndCreateAccount, loginUser } from '../services/firebase';
import { UserProfile } from '../types';

interface AuthProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'OTP'>('LOGIN');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form Data
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [childName, setChildName] = useState('');
  const [childPhone, setChildPhone] = useState('');

  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);

  // Admin Phone
  const ADMIN_WA = "6287744100119";

  useEffect(() => {
    let timer: any;
    if (mode === 'OTP' && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && mode === 'OTP') {
      setError("Waktu habis (1 Menit). Data Anda telah dihapus. Silakan daftar ulang.");
      setTimeout(() => {
          setMode('REGISTER');
          setOtp('');
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [mode, timeLeft]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!childPhone.startsWith('08')) {
        setError("Nomor HP Anak harus format Indonesia (08...)");
        return;
    }

    setIsLoading(true);
    setError('');
    try {
      // 1. Simpan ke Firebase (Generate OTP di backend/logic tapi user harus minta)
      await registerTemporaryAccount(username, password, childName, childPhone);
      
      // 2. Arahkan ke WA untuk minta OTP manual
      const message = `Halo Admin Guardian, saya pengguna baru.\nUsername: *${username}*\nNama Anak: *${childName}*\n\nMohon dicek di Firebase dan kirimkan kode OTP untuk aktivasi.`;
      const waLink = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`;
      
      // Buka WA di tab baru
      window.open(waLink, '_blank');

      setMode('OTP');
      setTimeLeft(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const user = await verifyOtpAndCreateAccount(username, otp);
      if (user) onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("Batas 1 Menit") || err.message.includes("habis")) {
          setTimeout(() => setMode('REGISTER'), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const user = await loginUser(username, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        
        <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                {mode === 'OTP' ? 'Verifikasi Akun' : mode === 'REGISTER' ? 'Buat Akun Baru' : 'Masuk Sistem'}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
                {mode === 'OTP' ? 'Masukkan kode yang diberikan Admin via WhatsApp' : mode === 'REGISTER' ? 'Lengkapi data untuk memulai riset' : 'Pantau aktivitas gelang anak Anda'}
            </p>
        </div>

        {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-start gap-3">
                <div className="mt-0.5 w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                <p className="text-red-600 text-xs font-medium leading-relaxed">{error}</p>
            </div>
        )}

        {mode === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 ml-1">Username</label>
                    <div className="relative">
                        <User className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Contoh: user123" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium text-slate-800"
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1">
                     <label className="text-xs font-semibold text-slate-600 ml-1">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                        <input 
                            type="password" 
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium text-slate-800"
                            required
                        />
                    </div>
                </div>
                
                <div className="pt-2">
                    <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Masuk'} 
                        {!isLoading && <ArrowRight size={18} />}
                    </button>
                </div>

                <div className="text-center mt-4">
                    <p className="text-xs text-slate-500">
                        Belum punya akun? <button type="button" onClick={() => setMode('REGISTER')} className="text-blue-600 font-bold hover:underline">Daftar Sekarang</button>
                    </p>
                </div>
            </form>
        )}

        {mode === 'REGISTER' && (
            <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 ml-1 block mb-1">Username</label>
                        <input 
                            type="text" 
                            placeholder="Buat username unik" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 ml-1 block mb-1">Password</label>
                        <input 
                            type="password" 
                            placeholder="Minimal 6 karakter"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                            required
                        />
                    </div>
                    
                    <div className="border-t border-slate-100 my-1"></div>
                    
                    <div>
                        <label className="text-xs font-semibold text-slate-600 ml-1 block mb-1">Nama Anak</label>
                        <input 
                            type="text" 
                            placeholder="Nama panggilan"
                            value={childName}
                            onChange={e => setChildName(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 ml-1 block mb-1">No. HP Anak (Wajib)</label>
                        <div className="relative">
                            <Smartphone className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                            <input 
                                type="tel" 
                                placeholder="08..."
                                value={childPhone}
                                onChange={e => setChildPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm font-medium"
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <button type="submit" disabled={isLoading} className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Minta OTP via WhatsApp'} 
                        {!isLoading && <Send size={16} />}
                    </button>
                    <p className="text-[10px] text-slate-400 text-center mt-2 leading-tight">
                        Klik tombol di atas akan membuka WhatsApp Admin untuk validasi manual.
                    </p>
                </div>
                <div className="text-center">
                    <button type="button" onClick={() => setMode('LOGIN')} className="text-xs text-slate-400 hover:text-slate-600 font-medium">
                        Batal
                    </button>
                </div>
            </form>
        )}

        {mode === 'OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm leading-relaxed border border-blue-100">
                    <strong>Langkah Validasi:</strong><br/>
                    1. Anda telah diarahkan ke WhatsApp Admin.<br/>
                    2. Kirim pesan yang sudah terisi.<br/>
                    3. Tunggu balasan kode dari Admin.<br/>
                    4. Masukkan kode di bawah ini.
                </div>

                <div className="text-center">
                    <input 
                        type="text" 
                        placeholder="000000"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                        className="w-full text-center text-3xl font-bold tracking-[0.5em] py-4 border-b-2 border-slate-200 focus:border-blue-500 outline-none transition-colors text-slate-800 placeholder:text-slate-200"
                        required
                        autoFocus
                    />
                    <label className="text-xs text-slate-400 mt-2 block">Masukkan 6 digit kode</label>
                </div>

                <div className="flex justify-between items-center text-xs font-medium border-t border-slate-100 pt-4">
                    <span className="text-slate-500">Sisa Waktu:</span>
                    <span className={`${timeLeft < 10 ? 'text-red-600 font-bold' : 'text-blue-600 font-mono'}`}>
                        00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                    </span>
                </div>

                <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-semibold shadow-sm transition-all flex items-center justify-center gap-2">
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Verifikasi'} 
                </button>
            </form>
        )}
      </div>
    </div>
  );
};
