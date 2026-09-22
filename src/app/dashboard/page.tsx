'use client';

import { 
  ArrowLeft, ArrowRight, FileText, User, 
  BarChart2, Briefcase, LogOut, AlertTriangle, RefreshCw, 
  BarChart3
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; 

export default function DashboardPage() {
  const router = useRouter();

  const [absensiStatus, setAbsensiStatus] = useState<'Belum Absen' | 'Masuk' | 'Pulang' | 'Terlambat'>('Belum Absen');
  const [currentShift, setCurrentShift] = useState<'pagi' | 'malam' | null>(null);
  const [hasCompletedLogbook, setHasCompletedLogbook] = useState(false);
  const [userData, setUserData] = useState({ fullName: "Loading...", email: "loading@kppn.go.id" });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
//untuk rapor kinerja
  const [showRaporModal, setShowRaporModal] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const defaultSemester = currentMonth <= 6 ? 1 : 2;
  const [tahun, setTahun] = useState(currentYear);
  const [semester, setSemester] = useState(defaultSemester);
  
  // Tanggal hari ini hanya untuk referensi visual/history, bukan filter utama
  const [todayDate, setTodayDate] = useState(new Date().toISOString().split('T')[0]);
  const usePhotoAttendance = process.env.NEXT_PUBLIC_FOTO;
  // --- Fetch status hari ini ---
  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      // 1. Profil user
      const profileRes = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      setUserData({ 
        fullName: profileRes.data?.full_name || user.email?.split('@')[0] || 'Pengguna KPPN', 
        email: user.email || 'N/A' 
      });

      // ------------------------------------------------------------------
      // LOGIC BARU: PRIORITASKAN CARI YANG "BELUM PULANG"
      // ------------------------------------------------------------------
      
      // A. Cari absen aktif (belum checkout) kapanpun tanggalnya
      const { data: activeSession } = await supabase
        .from('attendances')
        .select('id, check_in, check_out, status, shift')
        .eq('user_id', user.id)
        .is('check_out', null) // Cari yang belum checkout
        .order('check_in', { ascending: false }) // Ambil yang paling baru
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        // --- JIKA ADA YANG BELUM PULANG (CONTOH: SHIFT MALAM KEMARIN) ---
        setCurrentShift(activeSession.shift as 'pagi' | 'malam');
        setAbsensiStatus(activeSession.status === 'Terlambat' ? 'Terlambat' : 'Masuk');
        
        // Cek logbook untuk sesi aktif ini
        const { data: log } = await supabase
            .from('logbooks')
            .select('status')
            .eq('attendance_id', activeSession.id)
            .maybeSingle();
            
        setHasCompletedLogbook(log?.status === 'COMPLETED');
      
      } else {
        // --- JIKA TIDAK ADA YANG AKTIF, BARU CEK HISTORY HARI INI ---
        const { data: todaysHistory } = await supabase
            .from('attendances')
            .select('id, shift, check_out')
            .eq('user_id', user.id)
            .eq('attendance_date', todayDate); // Cek tanggal hari ini

        // Cek apakah hari ini sudah ada yang selesai?
        if (todaysHistory && todaysHistory.length > 0) {
            // Misal pagi sudah selesai, sekarang malam?
            // Logic sederhana: Jika ada record hari ini dan tidak aktif, berarti 'Pulang' / Selesai
            setAbsensiStatus('Pulang');
            setCurrentShift(null);
            setHasCompletedLogbook(false);
        } else {
            // Benar-benar kosong hari ini
            setAbsensiStatus('Belum Absen');
            setCurrentShift(null);
            setHasCompletedLogbook(false);
        }
      }

    } catch (err) {
      console.error(err);
      setCurrentShift(null);
      setAbsensiStatus('Belum Absen');
      setHasCompletedLogbook(false);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Reset otomatis tiap tanggal baru ---
  useEffect(() => {
    const interval = setInterval(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (todayStr !== todayDate) setTodayDate(todayStr);
    }, 60_000);
    return () => clearInterval(interval);
  }, [todayDate]);

  useEffect(() => {
    fetchStatus();
    const handleFocus = () => fetchStatus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [todayDate]);

  // --- Tombol handler ---
  const handleAbsenMasuk = () => {
    // console.log('Absen Masuk clicked, usePhotoAttendance:', usePhotoAttendance);
    router.push(
    usePhotoAttendance==='true' ? '/presensi' : '/checkinpage'
  );
};
  const handleAbsenPulang = () => { 
    // Izinkan ke halaman checkout jika status Masuk/Terlambat
    // Validasi logbook juga dilakukan di halaman checkout sebagai pengaman ganda
    if (currentShift) router.push(
        usePhotoAttendance==='true' ? '/presensiout' : '/checkoutform'
    ); 

  };
  const handleLogout = async () => { 
    setIsLoggingOut(true); 
    await supabase.auth.signOut(); 
    router.replace('/login'); 
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      "Masuk": {
        label: "Sedang Bekerja",
        icon: "●",
        classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
      },
      "Pulang": {
        label: "Selesai Hari Ini",
        icon: "✓",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-500",
      },
      "Terlambat": {
        label: "Absen Terlambat",
        icon: "!",
        classes: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
      },
      "Belum Absen": {
        label: "Belum Absen",
        icon: "○",
        classes: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-500",
      },
    }[status] || {
      label: status,
      icon: "•",
      classes: "bg-slate-50 text-slate-700 border-slate-200",
      dot: "bg-slate-500",
    };

    return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header / Hero */}
      <header className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -left-24 bottom-[-120px] h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-7 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur">
                <User size={21} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                  KPPN Lhokseumawe
                </p>
                <p className="mt-0.5 text-sm text-slate-300">Employee Dashboard</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-rose-500/20 hover:text-white"
              aria-label="Logout"
            >
              <LogOut size={19} />
            </button>
          </div>

          <div className="mt-10 max-w-2xl">
            <p className="text-sm font-medium text-blue-300">Selamat datang kembali 👋</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {userData.fullName}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{userData.email}</p>
          </div>
        </div>
      </header>

      <main className="relative mx-auto -mt-20 max-w-6xl px-5 pb-12 sm:px-8">
        {/* Attendance summary */}
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  Status aktivitas
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <StatusBadge status={absensiStatus} />
                  {currentShift && (
                    <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                      Shift {currentShift.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 px-5 py-4 sm:min-w-[180px]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Hari ini</p>
                <p className="mt-1 font-bold text-slate-800">
                  {new Date(`${todayDate}T00:00:00`).toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-900 p-6 text-white shadow-xl shadow-blue-900/20">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">Presensi</p>
            <h2 className="mt-2 text-xl font-black">Kelola kehadiran</h2>
            <p className="mt-1 text-sm leading-5 text-blue-100/80">
              Lakukan presensi masuk dan pulang sesuai aktivitas kerja Anda.
            </p>
          </div>
        </section>

        {/* Check in/out */}
        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleAbsenMasuk}
            disabled={isMasukDisabled}
            className={`group flex items-center justify-between rounded-2xl p-5 text-left transition-all duration-300 ${
              isMasukDisabled
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white shadow-lg shadow-slate-900/10 hover:-translate-y-0.5 hover:bg-blue-700"
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-60">Presensi</p>
              <p className="mt-1 text-lg font-black">Absen Masuk</p>
              <p className="mt-1 text-xs opacity-70">Mulai aktivitas kerja</p>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isMasukDisabled ? "bg-slate-200" : "bg-white/10 group-hover:bg-white/20"}`}>
              <ArrowRight size={22} />
            </div>
          </button>

          <button
            onClick={handleAbsenPulang}
            disabled={isPulangDisabled}
            className={`group flex items-center justify-between rounded-2xl p-5 text-left transition-all duration-300 ${
              isPulangDisabled
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "bg-emerald-600 text-white shadow-lg shadow-emerald-900/10 hover:-translate-y-0.5 hover:bg-emerald-700"
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70">Presensi</p>
              <p className="mt-1 text-lg font-black">Absen Pulang</p>
              <p className="mt-1 text-xs opacity-80">
                {hasCompletedLogbook ? "Siap menyelesaikan hari kerja" : "Isi logbook terlebih dahulu"}
              </p>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isPulangDisabled ? "bg-slate-200" : "bg-white/10 group-hover:bg-white/20"}`}>
              <ArrowLeft size={22} />
            </div>
          </button>
        </section>

        {/* Logbook notice */}
        {(absensiStatus === "Masuk" || absensiStatus === "Terlambat") && (
          <div className={`mt-4 flex items-center gap-3 rounded-2xl border p-4 ${
            hasCompletedLogbook
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              hasCompletedLogbook ? "bg-emerald-100" : "bg-amber-100"
            }`}>
              {hasCompletedLogbook ? "✓" : <AlertTriangle size={18} />}
            </div>
            <div>
              <p className="text-sm font-bold">
                {hasCompletedLogbook ? "Logbook sudah diisi" : "Logbook belum selesai"}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {hasCompletedLogbook
                  ? "Anda sudah dapat melanjutkan ke proses Absen Pulang."
                  : "Isi logbook aktivitas sebelum melakukan Absen Pulang."}
              </p>
            </div>
          </div>
        )}

        {/* Application menu */}
        <section className="mt-9">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Workspace</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Menu Aplikasi</h2>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 sm:block">
              {9} layanan
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={FileText} title="Logbook" description="Catat aktivitas dan pekerjaan harian." href="/logbook" />
            <FeatureCard icon={FileText} title="Absen Lembur" description="Kelola dan catat aktivitas lembur." href="/lembur" />
            <FeatureCard icon={Briefcase} title="Perjalanan Dinas" description="Presensi pada setiap tahap perjalanan dinas." href="/perjalanandinas" />
            <FeatureCard icon={Briefcase} title="Pengajuan Cuti" description="Ajukan dan pantau permohonan cuti." href="/pengajuancutipage" />
            <FeatureCard icon={AlertTriangle} title="Pengajuan Izin" description="Ajukan izin tidak hadir atau keperluan mendadak." href="/pengajuanizin" />
            <FeatureCard icon={BarChart2} title="Rekap Absensi" description="Lihat riwayat dan rekap kehadiran." href="/rekapabsensi" />
            <FeatureCard icon={BarChart2} title="Rekap Lembur" description="Lihat riwayat dan rekap lembur." href="/rekaplembur" />
            <FeatureCard icon={BarChart2} title="Perilaku Kerja" description="Pantau penilaian perilaku kerja." href="/penilaianperilaku" />
            <FeatureCard icon={BarChart3} title="Rapor Kinerja" description="Lihat rapor kinerja berdasarkan periode." onClick={handleOpenModal} />
          </div>
        </section>

        {/* Period modal */}
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Rapor Kinerja</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Pilih Periode</h2>
                  <p className="mt-1 text-sm text-slate-500">Tentukan tahun dan bulan laporan.</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  ×
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Tahun
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  >
                    {[2024, 2025, 2026].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Bulan
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  >
                    {Array.from({ length: 12 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
                >
                  Lihat Rapor
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
