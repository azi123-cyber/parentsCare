
import React, { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, Smartphone, Loader2, Send, ShieldCheck, KeyRound } from 'lucide-react';
import { registerTemporaryAccount, verifyOtpAndCreateAccount, loginUser } from '../services/firebase';
import { UserProfile } from '../types';
// user profile
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
        if (!childPhone.startsWith('08')) {
            setError("Nomor HP Anak harus format Indonesia (08...)");
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            await registerTemporaryAccount(username, password, childName, childPhone);

            const message = `Halo Admin Guardian, saya pengguna baru.\nUsername: *${username}*\nNama Anak: *${childName}*\n\nMohon dicek di Firebase dan kirimkan kode OTP untuk aktivasi.`;
            const waLink = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`;

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
        <div className="w-full relative px-4">
            {/* Background Elements - Optional subtle blobs for white theme */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-50 -z-10 transform translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50 -z-10 transform -translate-x-1/2 translate-y-1/2"></div>

            <div className="bg-white/80 backdrop-blur-xl border border-white/40 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">

                <div className="text-center mb-8 relative">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/20 mb-4 text-white">
                        {mode === 'LOGIN' ? <ShieldCheck size={32} /> : mode === 'REGISTER' ? <User size={32} /> : <KeyRound size={32} />}
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-wider">
                        {mode === 'OTP' ? 'Verifikasi OTP' : mode === 'REGISTER' ? 'Pendaftaran' : 'Selamat Datang'}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold tracking-widest mt-2 uppercase">
                        {mode === 'OTP' ? 'Validasi Keamanan' : mode === 'REGISTER' ? 'Buat Akun Baru' : 'Sistem Keamanan Keluarga'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                        <p className="text-red-600 text-xs font-medium leading-relaxed">{error}</p>
                    </div>
                )}

                {mode === 'LOGIN' && (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase tracking-wider">Username</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Masukkan Username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-sm font-medium text-slate-700 placeholder:text-slate-400"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase tracking-wider">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all text-sm font-medium text-slate-700 placeholder:text-slate-400"
                                    required
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 group">
                                {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'MASUK SEKARANG'}
                                {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                            </button>
                            <div className="text-center mt-5">
                                <button type="button" onClick={() => setMode('REGISTER')} className="text-xs text-slate-500 hover:text-blue-600 hover:underline transition-all">Belum punya akun? Daftar disini</button>
                            </div>
                        </div>
                    </form>
                )}

                {mode === 'REGISTER' && (
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase tracking-wider">Data Orang Tua</label>
                                <input
                                    type="text"
                                    placeholder="Username Orang Tua (Cth: bapakbudi)"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:ring-2 focus:ring-blue-500/10"
                                    required
                                />
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:ring-2 focus:ring-blue-500/10 mt-2"
                                    required
                                />
                            </div>

                            <div className="h-px bg-slate-100 my-1"></div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase tracking-wider">Data Anak</label>
                                <input
                                    type="text"
                                    placeholder="Nama Anak (Cth: Budi)"
                                    value={childName}
                                    onChange={e => setChildName(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:ring-2 focus:ring-blue-500/10"
                                    required
                                />
                                <div className="relative mt-2">
                                    <Smartphone className="absolute left-4 top-3.5 text-slate-400" size={18} />
                                    <input
                                        type="tel"
                                        placeholder="Nomor HP Anak (08...)"
                                        value={childPhone}
                                        onChange={e => setChildPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:ring-2 focus:ring-blue-500/10"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button type="submit" disabled={isLoading} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-2xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                                {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Minta Kode OTP'}
                                {!isLoading && <Send size={16} />}
                            </button>
                            <button type="button" onClick={() => setMode('LOGIN')} className="w-full py-3 text-xs text-slate-400 hover:text-slate-600 transition-colors mt-2">
                                Batal & Kembali Login
                            </button>
                        </div>
                    </form>
                )}

                {mode === 'OTP' && (
                    <form onSubmit={handleVerifyOtp} className="space-y-6">
                        <div className="text-center">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 inline-block">
                                <input
                                    type="text"
                                    placeholder="000000"
                                    value={otp}
                                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-48 text-center text-3xl font-black tracking-[0.3em] bg-transparent border-b-2 border-slate-300 focus:border-blue-500 outline-none transition-colors text-slate-800 placeholder:text-slate-200 font-mono"
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-bold">Masukkan 6 Digit Kode OTP dari WhatsApp</p>
                        </div>

                        <div className="flex justify-between items-center text-xs font-medium border-t border-slate-100 pt-4">
                            <span className="text-slate-400">Berlaku selama:</span>
                            <span className={`${timeLeft < 10 ? 'text-red-500' : 'text-blue-600'} font-mono text-lg font-bold`}>
                                00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                            </span>
                        </div>

                        <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
                            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'VERIFIKASI & BUAT AKUN'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
