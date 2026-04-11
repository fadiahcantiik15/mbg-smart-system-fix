"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

// DATABASE GIZI
const DATABASE_GIZI: Record<string, any> = {
  nasi_putih: { nama: "Nasi Putih", kalori: 180, protein: 3.0, lemak: 0.3, karbo: 39.8, bdd: 100 },
  tahu: { nama: "Tahu", kalori: 80, protein: 10.9, lemak: 4.7, karbo: 0.8, bdd: 100 },
  tempe: { nama: "Tempe", kalori: 201, protein: 20.8, lemak: 8.8, karbo: 13.5, bdd: 100 },
  ayam_goreng: { nama: "Ayam Goreng", kalori: 260, protein: 26.6, lemak: 15.3, karbo: 0.0, bdd: 58 },
  ikan_goreng: { nama: "Ikan Goreng", kalori: 200, protein: 20.0, lemak: 12.0, karbo: 0.0, bdd: 80 },
  apel: { nama: "Apel", kalori: 58, protein: 0.3, lemak: 0.4, karbo: 14.9, bdd: 88 },
  pisang: { nama: "Pisang", kalori: 99, protein: 1.2, lemak: 0.2, karbo: 25.8, bdd: 75 },
  wortel: { nama: "Wortel", kalori: 36, protein: 1.0, lemak: 0.6, karbo: 7.9, bdd: 88 },
  brokoli: { nama: "Brokoli", kalori: 34, protein: 2.8, lemak: 0.4, karbo: 6.6, bdd: 77 },
  telur: { nama: "Telur Ayam", kalori: 154, protein: 12.4, lemak: 10.8, karbo: 0.7, bdd: 89 },
};

export default function DashboardPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activePage, setActivePage] = useState("home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Camera & Upload States
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraMode, setCameraMode] = useState("input");
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  
  // === STATE GPS ===
  const [koordinat, setKoordinat] = useState<string>("Mencari lokasi...");
  
  // States untuk Log, Sampah & Statistik
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [trashEntries, setTrashEntries] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, segar: 0, basi: 0 });

  // States untuk Approval Admin
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);

  // Profil
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nama_lengkap: "", lokasi: "", no_hp: "" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("mbg_user");
    if (!userStr) {
      router.push("/");
    } else {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      if (user.role === "Admin") {
        setActivePage("home");
      } else {
        setActivePage("camera");
      }
    }
  }, [router]);

  // ==========================================
  // FUNGSI FETCH DATA DARI SUPABASE
  // ==========================================
  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("riwayat")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) {
        setLogEntries(data);
        let segarCount = 0;
        let basiCount = 0;
        data.forEach(log => {
            if(log.status === "SEGAR") segarCount++;
            if(log.status === "BASI") basiCount++;
        });
        setStats({ total: data.length, segar: segarCount, basi: basiCount });
      }
    } catch (err: any) {
      console.error("Gagal mengambil riwayat:", err.message);
    }
  };

  const fetchTrash = async () => {
    try {
      const { data, error } = await supabase
        .from("riwayat")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const now = new Date().getTime();
        const validTrash = [];

        for (const item of data) {
          const deleteDate = new Date(item.deleted_at).getTime();
          const diffDays = (now - deleteDate) / (1000 * 3600 * 24);

          if (diffDays >= 7) {
            await supabase.from("riwayat").delete().eq("id", item.id);
          } else {
            validTrash.push(item);
          }
        }
        setTrashEntries(validTrash);
      }
    } catch (err: any) {
      console.error("Gagal memuat keranjang sampah:", err.message);
    }
  };

  const fetchPendingUsers = async () => {
    setIsLoadingPending(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setPendingUsers(data);
    } catch (err: any) {
      console.error("Gagal memuat data pending:", err.message);
    } finally {
      setIsLoadingPending(false);
    }
  };

  useEffect(() => {
    if (activePage === "camera" && cameraMode === "input") startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [activePage, cameraMode]);

  // === MINTA IZIN LOKASI & FETCH DATA ===
  useEffect(() => {
    if (activePage === "log" || activePage === "home") fetchLogs();
    if (activePage === "sampah") fetchTrash();
    if (activePage === "approval") fetchPendingUsers(); // Fetch data approval jika menu aktif
    
    if (activePage === "camera") {
      if ("geolocation" in navigator) {
        setKoordinat("Mencari lokasi...");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setKoordinat(`${position.coords.latitude}, ${position.coords.longitude}`);
          },
          (error) => {
            console.warn("Gagal mendapat lokasi:", error.message);
            setKoordinat("Izin lokasi ditolak");
          }
        );
      } else {
        setKoordinat("GPS tidak didukung perangkat");
      }
    }
  }, [activePage]);

  // ==========================================
  // FUNGSI KAMERA & AI MOCKUP
  // ==========================================
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Kamera ditolak:", err);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    processAI(canvas.toDataURL("image/jpeg", 0.8));
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => processAI(event.target?.result as string);
      reader.readAsDataURL(file);
      e.target.value = "";
    }
  };

  const processAI = (imageSrc: string) => {
    stopCamera();
    setCameraMode("result");
    setIsProcessing(true);
    setDetectionResult({ image: imageSrc });

    setTimeout(() => {
      const is_fresh = Math.random() > 0.3;
      const confidence_score = Math.random() * (0.99 - 0.85) + 0.85;
      const keys = Object.keys(DATABASE_GIZI);
      const jenis_terdeteksi = keys[Math.floor(Math.random() * keys.length)];
      const info_gizi = DATABASE_GIZI[jenis_terdeteksi];

      const bdd_persen = info_gizi.bdd;
      const faktor = (100.0 / 100.0) * (bdd_persen / 100.0);

      setDetectionResult({
        image: imageSrc,
        status: is_fresh ? "SEGAR" : "BASI",
        confidence: confidence_score,
        jenis_makanan: info_gizi.nama,
        kalori: is_fresh ? (info_gizi.kalori * faktor).toFixed(1) : 0,
        protein: is_fresh ? (info_gizi.protein * faktor).toFixed(1) : 0,
        lemak: is_fresh ? (info_gizi.lemak * faktor).toFixed(1) : 0,
        karbo: is_fresh ? (info_gizi.karbo * faktor).toFixed(1) : 0,
      });
      setIsProcessing(false);
    }, 1500);
  };

  // ==========================================
  // FUNGSI SIMPAN, HAPUS, RESTORE, APPROVAL
  // ==========================================
  const handleSaveResult = async () => {
    if (!detectionResult || !currentUser) return;

    const btn = document.getElementById("btn-simpan-hasil") as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.innerText = "Menyimpan..."; }

    try {
      const { error } = await supabase.from("riwayat").insert([{
        petugas_nama: currentUser.nama_lengkap,
        status: detectionResult.status,
        jenis_makanan: detectionResult.jenis_makanan,
        confidence: parseFloat(detectionResult.confidence),
        kalori: parseFloat(detectionResult.kalori),
        protein: parseFloat(detectionResult.protein),
        lemak: parseFloat(detectionResult.lemak),
        karbo: parseFloat(detectionResult.karbo),
        koordinat_lokasi: koordinat
      }]);

      if (error) throw error;
      showToast("✅ Hasil & Lokasi berhasil disimpan!");
      setCameraMode("input");
      fetchLogs(); 
    } catch (err: any) {
      alert("Gagal menyimpan ke database: " + err.message);
      if (btn) { btn.disabled = false; btn.innerText = "💾 Simpan Hasil"; }
    }
  };

  const handleSoftDelete = async (id: number) => {
    const isConfirm = window.confirm("Pindahkan riwayat ini ke Tempat Sampah? Data bisa dikembalikan dalam 7 hari.");
    if (!isConfirm) return;
    try {
      const { error } = await supabase.from("riwayat").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      showToast("🗑️ Data dipindahkan ke Tempat Sampah.");
      fetchLogs();
    } catch (err: any) { alert("Gagal memindahkan data: " + err.message); }
  };

  const handleRestore = async (id: number) => {
    try {
      const { error } = await supabase.from("riwayat").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      showToast("✅ Data berhasil dikembalikan!");
      fetchTrash();
    } catch (err: any) { alert("Gagal mengembalikan data: " + err.message); }
  };

  const handleHardDelete = async (id: number) => {
    const isConfirm = window.confirm("Peringatan: Data akan dihapus PERMANEN dan tidak dapat dikembalikan. Lanjutkan?");
    if (!isConfirm) return;
    try {
      const { error } = await supabase.from("riwayat").delete().eq("id", id);
      if (error) throw error;
      showToast("💥 Data dihapus permanen.");
      fetchTrash();
    } catch (err: any) { alert("Gagal menghapus permanen: " + err.message); }
  };

  const handleUpdateStatusPetugas = async (id: string, newStatus: "approved" | "ditolak", nama: string) => {
    const confirmMsg = newStatus === "approved" 
      ? `Yakin ingin MENYETUJUI akses untuk ${nama}?` 
      : `Yakin ingin MENOLAK akses untuk ${nama}?`;
      
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase.from("users").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      showToast(`✅ Status ${nama} diubah menjadi ${newStatus.toUpperCase()}`);
      setPendingUsers(pendingUsers.filter(user => user.id !== id));
    } catch (err: any) { alert("Gagal mengubah status: " + err.message); }
  };

  // ==========================================
  // FUNGSI LAINNYA
  // ==========================================
  const handleExportExcel = () => {
    if (logEntries.length === 0) { alert("Belum ada data untuk diunduh."); return; }
    let csv = "Waktu,Status,Jenis Makanan,Petugas,Akurasi,Lokasi GPS,Kalori (kkal),Protein (g),Lemak (g),Karbo (g)\n";
    logEntries.forEach((log) => {
      const waktu = new Date(log.created_at).toLocaleString("id-ID").replace(/,/g, " ");
      const gps = log.koordinat_lokasi ? `"${log.koordinat_lokasi}"` : "-";
      csv += `${waktu},${log.status},${log.jenis_makanan},${log.petugas_nama},${Math.round(log.confidence * 100)}%,${gps},${log.kalori},${log.protein},${log.lemak},${log.karbo}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_MBG_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportPDF = () => { window.print(); };
  const handleLogout = () => { localStorage.removeItem("mbg_user"); router.push("/"); };
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); };
  const openEditModal = () => { setEditForm({ nama_lengkap: currentUser.nama_lengkap || "", lokasi: currentUser.lokasi || "", no_hp: currentUser.no_hp || "" }); setIsEditModalOpen(true); };
  const handleSaveProfil = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSavingProfile(true);
    try {
      const { data, error } = await supabase.from("users").update({ nama_lengkap: editForm.nama_lengkap, lokasi: editForm.lokasi, no_hp: editForm.no_hp }).eq("username", currentUser.username).select().single();
      if (error) throw error;
      localStorage.setItem("mbg_user", JSON.stringify(data)); setCurrentUser(data); setIsEditModalOpen(false); showToast("✅ Profil berhasil diperbarui!");
    } catch (err: any) { alert("Gagal menyimpan: " + err.message); } finally { setIsSavingProfile(false); }
  };

  if (!currentUser) return null;

  const isAdmin = currentUser.role === "Admin";

  return (
    <>
      <div className="food-layer" id="food-bg">
        <div className="food-flake" style={{ top: "4%", left: "6%", fontSize: "3.8rem" }}>🍎</div>
        <div className="food-flake" style={{ top: "12%", left: "22%", fontSize: "2.8rem" }}>🌾</div>
        <div className="food-flake" style={{ top: "6%", left: "42%", fontSize: "3.2rem" }}>🐟</div>
        <div className="food-flake" style={{ top: "3%", right: "28%", fontSize: "3.5rem" }}>🍗</div>
        <div className="food-flake" style={{ top: "14%", right: "8%", fontSize: "3rem" }}>🍌</div>
        <div className="food-flake" style={{ top: "35%", left: "4%", fontSize: "3.5rem" }}>🥦</div>
        <div className="food-flake" style={{ top: "50%", left: "15%", fontSize: "3rem" }}>🧅</div>
        <div className="food-flake" style={{ top: "60%", right: "6%", fontSize: "3.6rem" }}>🧅</div>
        <div className="food-flake" style={{ top: "42%", right: "18%", fontSize: "3.2rem" }}>🥛</div>
        <div className="food-flake" style={{ bottom: "18%", left: "10%", fontSize: "3rem" }}>🥕</div>
        <div className="food-flake" style={{ bottom: "8%", left: "35%", fontSize: "2.5rem" }}>⭐</div>
        <div className="food-flake" style={{ bottom: "5%", right: "25%", fontSize: "3.4rem" }}>🍱</div>
        <div className="food-flake" style={{ bottom: "15%", right: "5%", fontSize: "3rem" }}>🥚</div>
        <div className="food-flake" style={{ top: "28%", left: "38%", fontSize: "2.8rem" }}>🫑</div>
      </div>

      <div className="dashboard-wrapper">
        <button className="hamburger" onClick={() => setIsSidebarOpen(true)}>☰</button>
        <div className={`sidebar-overlay ${isSidebarOpen ? "open" : ""}`} onClick={() => setIsSidebarOpen(false)}></div>

        <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
          <div className="sidebar-brand">
            <h2 style={{ fontSize: "1.05rem", whiteSpace: "nowrap", marginBottom: "4px" }}>Makan Bergizi Gratis</h2>
            <p>Smart System</p>
          </div>

          <nav className="sidebar-nav">
            <button className={`nav-item ${activePage === "home" ? "active" : ""}`} onClick={() => { setActivePage("home"); setIsSidebarOpen(false); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> Halaman Utama
            </button>

            {/* Menu Kamera disembunyikan jika yang login adalah Admin */}
            {!isAdmin && (
              <button className={`nav-item ${activePage === "camera" ? "active" : ""}`} onClick={() => { setActivePage("camera"); setIsSidebarOpen(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> Kamera Langsung
              </button>
            )}

            {/* === MENU KHUSUS ADMIN === */}
            {isAdmin && (
              <button className={`nav-item ${activePage === "approval" ? "active" : ""}`} onClick={() => { setActivePage("approval"); setIsSidebarOpen(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg> Verifikasi Petugas
              </button>
            )}

            <button className={`nav-item ${activePage === "log" ? "active" : ""}`} onClick={() => { setActivePage("log"); setIsSidebarOpen(false); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> Log Riwayat
            </button>
            <button className={`nav-item ${activePage === "sampah" ? "active" : ""}`} onClick={() => { setActivePage("sampah"); setIsSidebarOpen(false); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Tempat Sampah
            </button>
            <button className={`nav-item ${activePage === "profil" ? "active" : ""}`} onClick={() => { setActivePage("profil"); setIsSidebarOpen(false); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Profil Saya
            </button>
          </nav>

          <div className="sidebar-footer">
            <button className="btn-logout" onClick={handleLogout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg> Keluar
            </button>
          </div>
        </aside>

        <main className="main-content" style={{ zIndex: 10, position: "relative" }}>
          
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .log-section, .log-section * { visibility: visible; }
              .log-section { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0;}
              .sidebar, .top-bar, .hamburger, .btn-primary, .btn-secondary, button { display: none !important; }
              .dashboard-wrapper, .main-content { background: white; margin: 0; padding: 0; }
            }
          `}</style>

          <div className="top-bar">
            {/* Sembunyikan Step 1-2-3 jika yang login adalah Admin */}
            {!isAdmin ? (
              <div className="step-indicators">
                <div className="step-item"><div className="step-icon">📷</div><span className="step-label">1. Arahkan Kamera</span></div>
                <div className="step-item"><div className="step-icon">📸</div><span className="step-label">2. Tekan Ambil Foto</span></div>
                <div className="step-item"><div className="step-icon">📊</div><span className="step-label">3. Lihat Hasil Gizi</span></div>
              </div>
            ) : (
              /* === TAMPILAN HEADER KHUSUS ADMIN === */
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#e8f4f8", padding: "8px 16px", borderRadius: "30px", border: "1px solid #bde0eb" }}>
                <span style={{ fontSize: "1.2rem" }}>📅</span>
                <span style={{ color: "var(--clr-navy)", fontWeight: "600", fontSize: "0.9rem" }}>
                  {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span style={{ color: "var(--clr-gray-400)", margin: "0 5px" }}>|</span>
                <span style={{ color: "var(--clr-teal)", fontWeight: "bold", fontSize: "0.85rem" }}>
                  🟢 Sistem Aktif
                </span>
              </div>
            )}

            <div className="profile-badge">
              <div className="profile-avatar">{currentUser.nama_lengkap.charAt(0).toUpperCase()}</div>
              <div className="profile-info">
                <div className="profile-label">{currentUser.role}:</div>
                <div className="profile-name">{currentUser.nama_lengkap}</div>
              </div>
              <span className="profile-status">(online)</span>
            </div>
          </div>

          <div className="dashboard-body">
            {activePage === "home" && (
              <div className="dash-view active">
                {/* ========================================================= */}
                {/* TAMPILAN KHUSUS ADMIN (STATISTIK) */}
                {/* ========================================================= */}
                {isAdmin ? (
                  <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <h2 style={{ fontSize: "1.8rem", marginBottom: "0.5rem", color: "var(--clr-navy)" }}>Dashboard Administrator</h2>
                    <p style={{ color: "var(--clr-gray-500)", maxWidth: "500px", margin: "0 auto 2rem", lineHeight: "1.6" }}>
                      Pantau secara *real-time* kualitas makanan dan performa petugas lapangan dari seluruh Dapur MBG.
                    </p>

                    {/* KARTU STATISTIK */}
                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "3rem" }}>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px", borderBottom: "4px solid var(--clr-teal)" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Total Pemeriksaan</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "var(--clr-navy)", margin: "10px 0" }}>{stats.total}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Laporan masuk</div>
                      </div>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px", borderBottom: "4px solid #2ecc71" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Kualitas SEGAR 🟢</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#2ecc71", margin: "10px 0" }}>{stats.segar}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Layak konsumsi</div>
                      </div>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px", borderBottom: "4px solid #e74c3c" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Kualitas BASI 🔴</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#e74c3c", margin: "10px 0" }}>{stats.basi}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Tidak layak</div>
                      </div>
                    </div>

                  </div>
                ) : (
                  /* ========================================================= */
                  /* TAMPILAN UNTUK PETUGAS LAPANGAN */
                  /* ========================================================= */
                  <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <h2 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>Selamat Datang di MBG Smart System</h2>
                    <p style={{ color: "var(--clr-gray-500)", maxWidth: "500px", margin: "0 auto 2rem", lineHeight: "1.6" }}>
                      Gunakan menu <strong>Kamera Langsung</strong> untuk memulai analisis kualitas dan gizi makanan. Sistem akan mendeteksi kesegaran makanan dan menampilkan informasi nutrisi secara real-time.
                    </p>

                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📷</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Deteksi Kualitas</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>AI-powered analysis</div>
                      </div>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📊</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Info Nutrisi</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>Kalori, protein, dll</div>
                      </div>
                      <div style={{ background: "var(--clr-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📋</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Log Riwayat</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>Rekam & pantau</div>
                      </div>
                    </div>

                    <div style={{ width: "100%", maxWidth: "800px", padding: "1rem", margin: "3rem auto 0", textAlign: "left" }}>
                      <div style={{ background: "#e8f4f8", borderLeft: "4px solid var(--clr-teal)", padding: "1rem 1.5rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem" }}>
                        <h3 style={{ fontSize: "1rem", color: "var(--clr-navy)", marginBottom: "6px" }}>📚 Sumber Referensi Gizi Valid</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-navy-dark)", lineHeight: "1.5", margin: 0 }}>
                          Seluruh kalkulasi gizi pada MBG Smart System menggunakan standar perhitungan mutlak berdasarkan <strong>Tabel Komposisi Pangan Indonesia (TKPI)</strong> yang diterbitkan resmi oleh <strong>Kementerian Kesehatan Republik Indonesia</strong>. Data dihitung per 100 gram BDD (Berat Dapat Dimakan).
                        </p>
                      </div>

                      <h3 style={{ fontSize: "1.2rem", color: "var(--clr-navy)", marginBottom: "1rem" }}>Daftar Kandungan Gizi (Menu Basis Data AI)</h3>
                      <div style={{ overflowX: "auto", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius-md)" }}>
                        <table className="log-table" style={{ width: "100%", minWidth: "600px", textAlign: "left" }}>
                          <thead>
                            <tr><th>Jenis Makanan</th><th>Kalori (kkal)</th><th>Protein (g)</th><th>Lemak (g)</th><th>Karbo (g)</th><th>BDD (%)</th></tr>
                          </thead>
                          <tbody>
                            {Object.values(DATABASE_GIZI).map((item: any, i) => (
                              <tr key={i}><td>{item.nama}</td><td>{item.kalori}</td><td>{item.protein}</td><td>{item.lemak}</td><td>{item.karbo}</td><td>{item.bdd}%</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HALAMAN KAMERA HANYA MUNCUL UNTUK PETUGAS */}
            {activePage === "camera" && !isAdmin && (
              <div className="dash-view active">
                {cameraMode === "input" && (
                  <div className="camera-section">
                    <div className="camera-viewport">
                      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
                      {!cameraStream && (
                        <div className="viewport-overlay">
                          <div className="overlay-icon">📷</div>
                          <div className="overlay-title">Menunggu Akses Kamera...</div>
                          <div className="overlay-subtitle">Harap izinkan akses kamera pada browser Anda</div>
                        </div>
                      )}
                    </div>
                    <p className="camera-hint">Arahkan kamera ke makanan</p>

                    <div className="action-cluster">
                      <button className="shutter-btn" title="Ambil Foto" onClick={handleCapture}><span className="shutter-inner"></span></button>
                      <button className="btn-upload" title="Unggah dari Galeri" onClick={handleUploadClick}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        &nbsp;Unggah Galeri
                      </button>
                    </div>
                    <input type="file" ref={fileInputRef} accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
                  </div>
                )}

                {cameraMode === "result" && (
                  <div className="result-section">
                    <div className="result-image-container">
                      <img src={detectionResult?.image} alt="Hasil" style={{ width: "100%", borderRadius: "12px" }} />
                      {isProcessing && (
                        <div className="processing-overlay">
                          <div className="processing-spinner"></div>
                          <div className="processing-text">Menganalisis kualitas...</div>
                        </div>
                      )}
                    </div>

                    {!isProcessing && detectionResult && (
                      <>
                        <div className="quality-card">
                          <div className="quality-header">
                            <span className={`badge ${detectionResult.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{detectionResult.status}</span>
                            <span className="quality-indicator">{detectionResult.status === "SEGAR" ? "🟢 Indikator Hijau" : "🔴 Indikator Merah"}</span>
                          </div>
                          <div style={{ fontSize: "1.05rem", fontWeight: "bold", color: "var(--clr-navy)", marginBottom: "4px" }}>{detectionResult.jenis_makanan}</div>
                          <div className="confidence-text">Kepercayaan: {Math.round(detectionResult.confidence * 100)}%</div>
                          
                          <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "8px", display: "flex", justifyContent: "center", alignItems: "center", gap: "4px", background: "#f8f9fa", padding: "6px 10px", borderRadius: "20px", display: "inline-flex" }}>
                            <span>📍</span> <span>{koordinat}</span>
                          </div>

                          <div className="nutrition-grid">
                            <div className="nutrition-item"><div className="nut-value">{detectionResult.kalori}</div><div className="nut-label">Kalori (kkal)</div></div>
                            <div className="nutrition-item"><div className="nut-value">{detectionResult.protein}</div><div className="nut-label">Protein (g)</div></div>
                            <div className="nutrition-item"><div className="nut-value">{detectionResult.lemak}</div><div className="nut-label">Lemak (g)</div></div>
                            <div className="nutrition-item"><div className="nut-value">{detectionResult.karbo}</div><div className="nut-label">Karbo (g)</div></div>
                          </div>
                        </div>

                        <div className="result-actions">
                          <button className="btn-back" onClick={() => setCameraMode("input")}>⬅ Kembali ke Kamera</button>
                          <button id="btn-simpan-hasil" className="btn-save" onClick={handleSaveResult}>💾 Simpan Hasil</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === HALAMAN PERSETUJUAN (KHUSUS ADMIN) === */}
            {activePage === "approval" && isAdmin && (
              <div className="dash-view active">
                <div className="log-section" style={{ width: "100%" }}>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0, color: "var(--clr-navy)", fontSize: "1.5rem" }}>🛡️ Verifikasi Petugas Baru</h2>
                    <p style={{ fontSize: "0.85rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>
                      Daftar petugas yang menunggu persetujuan Anda untuk bisa login.
                    </p>
                  </div>
                  
                  {isLoadingPending ? (
                    <p style={{ textAlign: "center", color: "var(--clr-gray-500)", padding: "2rem 0" }}>Memuat antrean pendaftar...</p>
                  ) : pendingUsers.length === 0 ? (
                    <div className="log-empty">
                      <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "10px" }}>🎉</span>
                      Tidak ada antrean petugas baru saat ini.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius-md)" }}>
                      <table className="log-table" style={{ width: "100%", minWidth: "700px" }}>
                        <thead>
                          <tr>
                            <th>Nama Lengkap</th>
                            <th>Username</th>
                            <th>No. Telp</th>
                            <th>Lokasi Tugas</th>
                            <th style={{ textAlign: "center" }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingUsers.map((user) => (
                            <tr key={user.id}>
                              <td style={{ fontWeight: "700", color: "var(--clr-navy)" }}>{user.nama_lengkap}</td>
                              <td>{user.username}</td>
                              <td>{user.no_hp}</td>
                              <td>{user.lokasi}</td>
                              <td style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                <button 
                                  onClick={() => handleUpdateStatusPetugas(user.id, "approved", user.nama_lengkap)}
                                  style={{ background: "var(--clr-fresh)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}
                                >
                                  Setujui
                                </button>
                                <button 
                                  onClick={() => handleUpdateStatusPetugas(user.id, "ditolak", user.nama_lengkap)}
                                  style={{ background: "var(--clr-spoiled)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}
                                >
                                  Tolak
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePage === "log" && (
              <div className="dash-view active">
                <div className="log-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "10px" }}>
                    <h2 style={{ margin: 0 }}>📋 Laporan Deteksi Gizi</h2>
                    {logEntries.length > 0 && (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={handleExportExcel} style={{ background: "#217346", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>📊 Excel (CSV)</button>
                        <button onClick={handleExportPDF} style={{ background: "#cb4335", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>📄 Cetak PDF</button>
                      </div>
                    )}
                  </div>

                  {logEntries.length === 0 ? (
                    <p style={{ color: "var(--clr-gray-500)", textAlign: "center", padding: "2rem 0" }}>Belum ada riwayat deteksi.</p>
                  ) : (
                    <div style={{ overflowX: "auto", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius-md)" }}>
                      <table className="log-table" style={{ width: "100%", minWidth: "700px" }}>
                        <thead>
                          <tr>
                            <th>Waktu</th><th>Status</th><th>Makanan</th><th>Petugas</th><th>Akurasi</th><th style={{ textAlign: "center" }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logEntries.map((log, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: "0.8rem" }}>{new Date(log.created_at).toLocaleString("id-ID")}</td>
                              <td><span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{log.status}</span></td>
                              <td style={{ fontWeight: "600" }}>{log.jenis_makanan}</td>
                              <td>{log.petugas_nama}</td>
                              <td>{Math.round(log.confidence * 100)}%</td>
                              <td style={{ textAlign: "center" }}>
                                <button onClick={() => handleSoftDelete(log.id)} title="Pindah ke Sampah" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", opacity: "0.7", transition: "0.3s" }} onMouseOver={(e) => e.currentTarget.style.opacity = "1"} onMouseOut={(e) => e.currentTarget.style.opacity = "0.7"}>
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePage === "sampah" && (
              <div className="dash-view active">
                <div className="log-section">
                  <div style={{ marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0, color: "#cb4335" }}>🗑️ Tempat Sampah</h2>
                    <p style={{ fontSize: "0.85rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>Item akan dihapus permanen secara otomatis setelah 7 hari.</p>
                  </div>

                  {trashEntries.length === 0 ? (
                    <p style={{ color: "var(--clr-gray-500)", textAlign: "center", padding: "2rem 0" }}>Tidak ada data di tempat sampah.</p>
                  ) : (
                    <div style={{ overflowX: "auto", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius-md)" }}>
                      <table className="log-table" style={{ width: "100%", minWidth: "800px" }}>
                        <thead>
                          <tr><th>Dihapus Pada</th><th>Status / Makanan</th><th>Petugas</th><th>Waktu Tersisa</th><th style={{ textAlign: "center" }}>Tindakan</th></tr>
                        </thead>
                        <tbody>
                          {trashEntries.map((log, i) => {
                            const deleteDate = new Date(log.deleted_at).getTime();
                            const now = new Date().getTime();
                            const diffDays = Math.floor((now - deleteDate) / (1000 * 3600 * 24));
                            const daysLeft = 7 - diffDays;

                            return (
                              <tr key={i}>
                                <td style={{ fontSize: "0.8rem", color: "#cb4335" }}>{new Date(log.deleted_at).toLocaleString("id-ID")}</td>
                                <td>
                                  <span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`} style={{marginRight: '8px'}}>{log.status}</span>
                                  <strong>{log.jenis_makanan}</strong>
                                </td>
                                <td>{log.petugas_nama}</td>
                                <td style={{ fontWeight: "bold", color: daysLeft <= 2 ? "#cb4335" : "var(--clr-gray-500)" }}>{daysLeft} Hari Lagi</td>
                                <td style={{ textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                                  <button onClick={() => handleRestore(log.id)} style={{ background: "#2ecc71", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}>♻️ Pulihkan</button>
                                  <button onClick={() => handleHardDelete(log.id)} style={{ background: "#e74c3c", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}>Hapus Permanen</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePage === "profil" && (
              <div className="dash-view active">
                <div className="profil-section">
                  <div className="profil-card">
                    <div className="profil-avatar-big">{currentUser.nama_lengkap.charAt(0).toUpperCase()}</div>
                    <div className="profil-row"><span className="row-label">Nama Lengkap</span><span className="row-value">{currentUser.nama_lengkap}</span></div>
                    <div className="profil-row"><span className="row-label">Username</span><span className="row-value">{currentUser.username}</span></div>
                    <div className="profil-row"><span className="row-label">Role</span><span className="row-value">{currentUser.role}</span></div>
                    <div className="profil-row"><span className="row-label">Lokasi</span><span className="row-value">{currentUser.lokasi}</span></div>
                    <div className="profil-row"><span className="row-label">No. HP</span><span className="row-value">{currentUser.no_hp}</span></div>
                    <div className="profil-row" style={{ justifyContent: "center", marginTop: "1.5rem", borderBottom: "none" }}>
                      <button className="btn-primary" style={{ padding: "10px 24px" }} onClick={openEditModal}>Edit Profil</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {isEditModalOpen && (
          <div className="modal-overlay">
            <div className="modal-card">
              <h3 className="modal-title">Edit Profil</h3>
              <form onSubmit={handleSaveProfil}>
                <div className="form-field"><label className="form-label">Nama Lengkap</label><input type="text" value={editForm.nama_lengkap} onChange={(e) => setEditForm({ ...editForm, nama_lengkap: e.target.value })} required style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} /></div>
                <div className="form-field"><label className="form-label">Lokasi Dapur MBG</label><input type="text" value={editForm.lokasi} onChange={(e) => setEditForm({ ...editForm, lokasi: e.target.value })} required style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} /></div>
                <div className="form-field"><label className="form-label">Nomor Telp / HP</label><input type="text" value={editForm.no_hp} onChange={(e) => setEditForm({ ...editForm, no_hp: e.target.value })} required style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "6px" }} /></div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Batal</button>
                  <button type="submit" className="btn-primary" disabled={isSavingProfile}>{isSavingProfile ? "Menyimpan..." : "Simpan"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {toastMsg && <div className="toast" style={{ display: "block", opacity: 1 }}>{toastMsg}</div>}
      </div>
    </>
  );
}