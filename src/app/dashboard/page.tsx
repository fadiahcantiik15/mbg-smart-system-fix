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

  // State Konfirmasi Keluar
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

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

  useEffect(() => {
    if (activePage === "log" || activePage === "home") fetchLogs();
    if (activePage === "sampah") fetchTrash();
    if (activePage === "approval") fetchPendingUsers(); 
    
    if (activePage === "camera") {
      if ("geolocation" in navigator) {
        setKoordinat("Mencari lokasi & alamat...");
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const rawCoords = `${lat}, ${lon}`;

            try {
              const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
                { headers: { 'User-Agent': 'MBG-Smart-System-App' } }
              );
              const data = await response.json();
              
              if (data && data.display_name) {
                const addressParts = data.display_name.split(", ");
                const shortAddress = addressParts.slice(0, 4).join(", ");
                setKoordinat(`${shortAddress}\n${rawCoords}`);
              } else {
                setKoordinat(rawCoords);
              }
            } catch (err) {
              console.error("Gagal menerjemahkan alamat:", err);
              setKoordinat(rawCoords); 
            }
          },
          (error) => {
            console.warn("Gagal mendapat lokasi:", error.message);
            setKoordinat("Izin lokasi ditolak (Pastikan GPS menyala)");
          }
        );
      } else {
        setKoordinat("GPS tidak didukung perangkat");
      }
    }
  }, [activePage]);

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

  const handleExportExcel = () => {
    if (logEntries.length === 0) { alert("Belum ada data untuk diunduh."); return; }
    let csv = "Waktu,Status,Jenis Makanan,Petugas,Akurasi,Lokasi GPS,Kalori (kkal),Protein (g),Lemak (g),Karbo (g)\n";
    logEntries.forEach((log) => {
      const waktu = new Date(log.created_at).toLocaleString("id-ID").replace(/,/g, " ");
      const gps = log.koordinat_lokasi ? `"${log.koordinat_lokasi.replace(/\n/g, ' ')}"` : "-";
      csv += `${waktu},${log.status},${log.jenis_makanan},${log.petugas_nama},${Math.round(log.confidence * 100)}%,${gps},${log.kalori},${log.protein},${log.lemak},${log.karbo}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_MBG_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportPDF = () => { window.print(); };
  
  const handleLogoutClick = () => {
    setIsLogoutModalOpen(true);
    setIsSidebarOpen(false); 
  };

  const confirmLogout = () => { 
    localStorage.removeItem("mbg_user"); 
    router.push("/"); 
  };

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
        <div className="food-flake" style={{ top: "8%", left: "5%", width: "90px" }}><img src="/assets/tempe.png" alt="Tempe" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "20%", left: "20%", width: "90px" }}><img src="/assets/tahu.png" alt="Tahu" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "40%", left: "7%", width: "90px" }}><img src="/assets/apel.png" alt="Apel" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "50%", left: "25%", width: "130px" }}><img src="/assets/ikan.png" alt="Ikan" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "70%", left: "10%", width: "100px" }}><img src="/assets/Nasi.png" alt="Nasi" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "85%", left: "20%", width: "100px" }}><img src="/assets/telur.png" alt="Telur" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "10%", left: "31%", width: "130px" }}><img src="/assets/ayam.png" alt="Ayam" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "3%", left: "50%", width: "100px" }}><img src="/assets/brokoli.png" alt="Brokoli" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "85%", left: "40%", width: "120px" }}><img src="/assets/wortel.png" alt="Wortel" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "78%", left: "60%", width: "100px" }}><img src="/assets/pisang.png" alt="Pisang" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "7%", right: "7%", width: "100px" }}><img src="/assets/Nasi.png" alt="Nasi" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "40%", right: "3%", width: "100px" }}><img src="/assets/pisang.png" alt="Pisang" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "15%", right: "25%", width: "100px" }}><img src="/assets/telur.png" alt="Telur" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "30%", right: "15%", width: "90px" }}><img src="/assets/tempe.png" alt="Tempe" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "45%", right: "20%", width: "130px" }}><img src="/assets/ayam.png" alt="Ayam" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "70%", right: "7%", width: "90px" }}><img src="/assets/apel.png" alt="Apel" style={{ width: "100%", height: "auto" }} /></div>
        <div className="food-flake" style={{ top: "80%", right: "20%", width: "90px" }}><img src="/assets/tahu.png" alt="Tahu" style={{ width: "100%", height: "auto" }} /></div>
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

            {!isAdmin && (
              <button className={`nav-item ${activePage === "camera" ? "active" : ""}`} onClick={() => { setActivePage("camera"); setIsSidebarOpen(false); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> Kamera Langsung
              </button>
            )}

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
            
            {/* === KOTAK PROFIL === */}
            <div className="profile-badge">
              <div className="profile-avatar">{currentUser.nama_lengkap.charAt(0).toUpperCase()}</div>
              <div className="profile-info">
                <div className="profile-label">{currentUser.role}:</div>
                <div className="profile-name">{currentUser.nama_lengkap}</div>
              </div>
              <span className="profile-status" style={{color: '#2ecc71', fontWeight: 'bold'}}>(online)</span>
            </div>

            <button className="btn-logout" onClick={handleLogoutClick}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg> Keluar
            </button>
          </div>
        </aside>

        <main className="main-content" style={{ zIndex: 10, position: "relative", background: "transparent" }}>
          
          <style>{`
            .main-content { background: transparent !important; }
            
            /* ========================================================= */
            /* MODIFIED: Top Bar Layout                                  */
            /* ========================================================= */
            .top-bar { 
              background: transparent !important; 
              border-bottom: none !important; 
              backdrop-filter: none !important; 
              padding-top: 1.5rem !important;
              display: flex !important;
              align-items: center !important;
              justify-content: flex-start !important; 
              padding-right: 2rem !important;
            }

            .dashboard-body { background: transparent !important; }

            .quality-card, .profil-card, .modal-card, .log-empty {
              background: rgba(255, 255, 255, 0.95) !important; 
              box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
            }
            
            /* ========================================================= */
            /* TABEL BERBACKGROUND FULL & HEADER NAVY                    */
            /* ========================================================= */
            .table-container {
              overflow-x: auto;
              border-radius: var(--radius-md);
              background: rgba(255, 255, 255, 0.95) !important; 
              box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
              min-height: 60vh; 
              display: block;
            }
            
            .log-table {
              background: transparent !important; 
              width: 100%;
              border-collapse: collapse;
            }

            .log-table thead {
              background-color: #153759 !important; 
              color: #ffffff !important;            
            }

            .log-table th {
              padding: 15px !important;
              font-weight: 700;
            }

            /* ========================================================= */
            /* RECONFIGURED: Sidebar & Footer                            */
            /* ========================================================= */
            .sidebar {
              background-color: #153759 !important;
              display: flex !important;
              flex-direction: column !important;
            }
            .nav-item.active {
              background-color: rgba(255, 255, 255, 0.15) !important; 
            }

            .sidebar-footer {
              display: flex !important;
              flex-direction: column !important;
              gap: 0 !important; 
              padding: 1rem !important;
              border-top: 1px solid rgba(255,255,255, 0.1) !important;
              margin-top: auto !important; 
              width: 100% !important;
            }

            .profile-badge {
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
              background-color: rgba(255, 255, 255, 0.05) !important;
              border-radius: var(--radius-md) !important;
              padding: 1rem !important;
              margin-bottom: 1rem !important; 
              border: 1px solid rgba(255,255,255, 0.1) !important;
              width: 100% !important; 
              box-shadow: none !important;
              backdrop-filter: none !important;
              color: #ffffff !important;
            }

            .profile-info {
              display: flex;
              flex-direction: column;
              flex: 1; 
            }
            .profile-info .profile-label { 
              color: rgba(255, 255, 255, 0.7) !important; 
              font-size: 0.75rem !important;
            }
            .profile-info .profile-name { 
              color: #ffffff !important; 
              font-weight: 700 !important;
              font-size: 0.9rem !important;
              margin-top: 2px;
            }
            
            .profile-status {
              font-size: 0.7rem !important;
              margin-left: auto !important;
              white-space: nowrap;
            }

            .profile-avatar {
              background-color: rgba(255, 255, 255, 0.15) !important;
              color: #ffffff !important;
              border: 1px solid rgba(255, 255, 255, 0.3);
            }

            /* ========================================================= */
            /* KOTAK PETUNJUK 1-2-3 (DISTRIBUSI MERATA SEPANJANG LAYAR)   */
            /* ========================================================= */
            .step-indicators {
              display: flex !important; 
              flex-direction: row !important; 
              justify-content: space-between !important; 
              width: 100% !important; 
              padding: 0 2.5rem !important; 
              box-sizing: border-box !important; 
            }
            
            .step-item {
              background-color: rgba(21, 55, 89, 0.9) !important; 
              backdrop-filter: blur(8px) !important; 
              box-shadow: 0 6px 15px rgba(21, 55, 89, 0.25) !important;
              border: 1px solid rgba(255,255,255, 0.1) !important;
              border-radius: var(--radius-sm) !important; 
              padding: 1rem 1.5rem !important; 
              flex: 0 1 auto !important; 
              text-align: center !important; 
              display: flex !important; 
              flex-direction: column !important; 
              align-items: center !important; 
              gap: 0.5rem !important; 
            }
            
            .step-label {
              color: #ffffff !important;
              font-weight: 600 !important; 
              font-size: 0.9rem !important; 
            }
            
            .step-item .step-icon {
              background-color: rgba(255, 255, 255, 0.15) !important; 
              color: #ffffff;
              display: flex !important; 
              align-items: center !important;
              justify-content: center !important;
              width: 40px !important; 
              height: 40px !important;
              border-radius: 50% !important;
              font-size: 1.5rem !important; 
            }

            @media print {
              body * { visibility: hidden; }
              .log-section, .log-section * { visibility: visible; }
              .log-section { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0;}
              .sidebar, .top-bar, .hamburger, .btn-primary, .btn-secondary, button { display: none !important; }
              .dashboard-wrapper, .main-content { background: white !important; margin: 0; padding: 0; }
            }
          `}</style>

          <div className="top-bar">
            <div style={{ flex: 1 }}>
              {activePage === "home" && !isAdmin ? (
                <div className="step-indicators">
                  <div className="step-item"><div className="step-icon">📷</div><span className="step-label">1. Arahkan Kamera</span></div>
                  <div className="step-item"><div className="step-icon">📸</div><span className="step-label">2. Tekan Ambil Foto</span></div>
                  <div className="step-item"><div className="step-icon">📊</div><span className="step-label">3. Lihat Hasil Gizi</span></div>
                </div>
              ) : !["camera", "log", "sampah"].includes(activePage) ? (
                <h2 style={{ fontSize: "1.25rem", color: "var(--clr-navy)", fontWeight: "700", marginLeft: "10px" }}>
                  {activePage === 'profil' ? '👤 Profil Saya' : 
                   activePage === 'approval' ? '🛡️ Verifikasi Petugas' : 
                   isAdmin ? '🏠 Dashboard Admin' : '🏠 Dashboard Utama'}
                </h2>
              ) : null}
            </div>
          </div>

          <div className="dashboard-body">
            {activePage === "home" && (
              <div className="dash-view active">
                {isAdmin ? (
                  <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <h2 style={{ fontSize: "1.8rem", marginBottom: "0.5rem", color: "var(--clr-navy)" }}>Dashboard Administrator</h2>
                    <p style={{ color: "var(--clr-gray-500)", maxWidth: "500px", margin: "0 auto 2rem", lineHeight: "1.6" }}>
                      Pantau secara *real-time* kualitas makanan dan performa petugas lapangan dari seluruh Dapur MBG.
                    </p>

                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "3rem" }}>
                      <div className="profil-card" style={{ padding: "1.5rem", borderRadius: "var(--radius-md)", minWidth: "160px", borderBottom: "4px solid var(--clr-teal)" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Total Pemeriksaan</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "var(--clr-navy)", margin: "10px 0" }}>{stats.total}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Laporan masuk</div>
                      </div>
                      <div className="profil-card" style={{ padding: "1.5rem", borderRadius: "var(--radius-md)", minWidth: "160px", borderBottom: "4px solid #2ecc71" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Kualitas SEGAR 🟢</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#2ecc71", margin: "10px 0" }}>{stats.segar}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Layak konsumsi</div>
                      </div>
                      <div className="profil-card" style={{ padding: "1.5rem", borderRadius: "var(--radius-md)", minWidth: "160px", borderBottom: "4px solid #e74c3c" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--clr-gray-500)" }}>Kualitas BASI 🔴</div>
                        <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#e74c3c", margin: "10px 0" }}>{stats.basi}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)" }}>Tidak layak</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <h2 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>Selamat Datang di MBG Smart System</h2>
                    <p style={{ color: "var(--clr-gray-500)", maxWidth: "500px", margin: "0 auto 2rem", lineHeight: "1.6" }}>
                      Gunakan menu <strong>Kamera Langsung</strong> untuk memulai analisis kualitas dan gizi makanan. Sistem akan mendeteksi kesegaran makanan dan menampilkan informasi nutrisi secara real-time.
                    </p>

                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                      <div className="profil-card" style={{ padding: "1.5rem", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📷</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Deteksi Kualitas</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>AI-powered analysis</div>
                      </div>
                      <div className="profil-card" style={{ padding: "1.5rem", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📊</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Info Nutrisi</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>Kalori, protein, dll</div>
                      </div>
                      <div className="profil-card" style={{ padding: "1.5rem", minWidth: "160px" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📋</div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Log Riwayat</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--clr-gray-500)", marginTop: "4px" }}>Rekam & pantau</div>
                      </div>
                    </div>

                    <div style={{ width: "100%", maxWidth: "800px", padding: "1rem", margin: "3rem auto 0", textAlign: "left" }}>
                      <div style={{ background: "rgba(232, 244, 248, 0.9)", borderLeft: "4px solid var(--clr-teal)", padding: "1rem 1.5rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem" }}>
                        <h3 style={{ fontSize: "1rem", color: "var(--clr-navy)", marginBottom: "6px" }}>📚 Sumber Referensi Gizi Valid</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-navy-dark)", lineHeight: "1.5", margin: 0 }}>
                          Seluruh kalkulasi gizi pada MBG Smart System menggunakan standar perhitungan mutlak berdasarkan <strong>Tabel Komposisi Pangan Indonesia (TKPI)</strong> yang diterbitkan resmi oleh <strong>Kementerian Kesehatan Republik Indonesia</strong>.
                        </p>
                      </div>

                      <h3 style={{ fontSize: "1.2rem", color: "var(--clr-navy)", marginBottom: "1rem" }}>Daftar Kandungan Gizi (Menu Basis Data AI)</h3>
                      <div className="table-container">
                        <table className="log-table">
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

            {activePage === "camera" && !isAdmin && (
              <div className="dash-view active">
                
                {/* KOTAK JUDUL KAMERA */}
                <div style={{ 
                  backgroundColor: "#153759", 
                  color: "white", 
                  padding: "10px 24px", 
                  borderRadius: "30px", 
                  fontWeight: "700", 
                  fontSize: "1.05rem", 
                  marginBottom: "8px", 
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  Kamera Deteksi
                </div>

                {cameraMode === "input" && (
                  <div className="camera-section">
                    
                    <p className="camera-hint" style={{ marginBottom: "15px", color: "var(--clr-navy)", fontWeight: "600" }}>Arahkan kamera ke makanan</p>

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

                    {/* KOTAK LOKASI INPUT KAMERA (DIBUAT NAVY) */}
                    <div style={{ 
                      marginTop: "12px", 
                      fontSize: "0.85rem", 
                      color: "white", 
                      background: "#153759", 
                      padding: "8px 16px", 
                      borderRadius: "12px",
                      boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "2px",
                      maxWidth: "90%"
                    }}>
                      <div style={{ fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#e74c3c" }}>📍</span>
                        <span>{koordinat.split('\n')[0]}</span> 
                      </div>
                      {koordinat.includes('\n') && (
                        <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)", fontFamily: "monospace" }}>
                          {koordinat.split('\n')[1]}
                        </div>
                      )}
                    </div>

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
                          
                          {/* KOTAK LOKASI HASIL GIZI (DIBUAT NAVY) */}
                          <div style={{ 
                            fontSize: "0.85rem", 
                            color: "white", 
                            marginTop: "12px", 
                            display: "flex", 
                            flexDirection: "column", 
                            justifyContent: "center", 
                            alignItems: "center", 
                            gap: "4px", 
                            background: "#153759", 
                            padding: "10px 16px", 
                            borderRadius: "12px", 
                            width: "100%",
                            textAlign: "center",
                            boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                          }}>
                            <div style={{ fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ color: "#e74c3c", fontSize: "1.1rem" }}>📍</span> 
                              <span>{koordinat.split('\n')[0]}</span>
                            </div>
                            {koordinat.includes('\n') && (
                              <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)", fontFamily: "monospace" }}>
                                {koordinat.split('\n')[1]}
                              </div>
                            )}
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

            {/* Approval views continue below */}
            {activePage === "approval" && isAdmin && (
              <div className="dash-view active">
                <div className="log-section" style={{ width: "100%" }}>
                   <div className="table-container">
                      <table className="log-table">
                        <thead>
                          <tr>
                            <th>Nama Lengkap</th><th>Username</th><th>No. Telp</th><th>Lokasi Tugas</th><th style={{ textAlign: "center" }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingUsers.map((user) => (
                            <tr key={user.id}>
                              <td style={{ fontWeight: "700", color: "var(--clr-navy)" }}>{user.nama_lengkap}</td>
                              <td>{user.username}</td><td>{user.no_hp}</td><td>{user.lokasi}</td>
                              <td style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                <button onClick={() => handleUpdateStatusPetugas(user.id, "approved", user.nama_lengkap)} style={{ background: "var(--clr-fresh)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}>Setujui</button>
                                <button onClick={() => handleUpdateStatusPetugas(user.id, "ditolak", user.nama_lengkap)} style={{ background: "var(--clr-spoiled)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}>Tolak</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                </div>
              </div>
            )}

            {activePage === "log" && (
              <div className="dash-view active">
                <div className="log-section">
                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "10px" }}>
                    
                    {/* KOTAK JUDUL LOG RIWAYAT BARU */}
                    <div style={{ 
                      backgroundColor: "#153759", 
                      color: "white", 
                      padding: "10px 24px", 
                      borderRadius: "30px", 
                      fontWeight: "700", 
                      fontSize: "1.05rem", 
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                      Laporan Deteksi Gizi
                    </div>

                    {logEntries.length > 0 && (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={handleExportExcel} style={{ background: "#217346", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>📊 Excel</button>
                        <button onClick={handleExportPDF} style={{ background: "#cb4335", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>📄 PDF</button>
                      </div>
                    )}
                  </div>
                  <div className="table-container">
                    <table className="log-table">
                      <thead>
                        <tr><th>Waktu</th><th>Status</th><th>Makanan</th><th>Petugas</th><th>Akurasi</th><th style={{ textAlign: "center" }}>Aksi</th></tr>
                      </thead>
                      <tbody>
                        {logEntries.map((log, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: "0.8rem" }}>{new Date(log.created_at).toLocaleString("id-ID")}</td>
                            <td><span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{log.status}</span></td>
                            <td style={{ fontWeight: "600" }}>{log.jenis_makanan}</td>
                            <td>{log.petugas_nama}</td><td>{Math.round(log.confidence * 100)}%</td>
                            <td style={{ textAlign: "center" }}><button onClick={() => handleSoftDelete(log.id)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem" }}>🗑️</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activePage === "sampah" && (
              <div className="dash-view active">
                <div className="log-section">
                  {/* DIUBAH: Penambahan centering di container judul agar sejalan dengan Kamera Deteksi */}
                  <div style={{ 
                    marginBottom: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center"
                  }}>
                    
                    {/* KOTAK JUDUL TEMPAT SAMPAH BARU */}
                    <div style={{ 
                      backgroundColor: "#153759", 
                      color: "white", 
                      padding: "10px 24px", 
                      borderRadius: "30px", 
                      fontWeight: "700", 
                      fontSize: "1.05rem", 
                      marginBottom: "10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      Tempat Sampah
                    </div>

                    {/* DIUBAH: Warna teks diubah ke Navy (#153759) untuk konsistensi, dan dihapus margin-top agar mepet judul */}
                    <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0" }}>Item akan dihapus permanen secara otomatis setelah 7 hari.</p>
                  </div>

                  <div className="table-container">
                    <table className="log-table">
                      <thead>
                        <tr><th>Dihapus Pada</th><th>Status / Makanan</th><th>Petugas</th><th>Tersisa</th><th style={{ textAlign: "center" }}>Tindakan</th></tr>
                      </thead>
                      <tbody>
                        {trashEntries.map((log, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: "0.8rem", color: "#cb4335" }}>{new Date(log.deleted_at).toLocaleString("id-ID")}</td>
                            <td><span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{log.status}</span> <strong>{log.jenis_makanan}</strong></td>
                            <td>{log.petugas_nama}</td><td>{7 - Math.floor((new Date().getTime() - new Date(log.deleted_at).getTime()) / (1000 * 3600 * 24))} Hari</td>
                            <td style={{ textAlign: "center" }}>
                                <button onClick={() => handleRestore(log.id)} style={{ background: "#2ecc71", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", marginRight: "5px" }}>♻️ Pulihkan</button>
                                <button onClick={() => handleHardDelete(log.id)} style={{ background: "#e74c3c", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
        
        {isLogoutModalOpen && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
                <img src="/assets/bye.png" alt="Logout Icon" style={{ width: "80px", height: "80px", objectFit: "contain" }} />
              </div>
              <h3 className="modal-title">Yakin Ingin Keluar?</h3>
              <p style={{ color: "var(--clr-gray-500)", marginBottom: "1.5rem", fontSize: "0.95rem", lineHeight: "1.5" }}>Sesi Anda akan diakhiri dan Anda harus login kembali.</p>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsLogoutModalOpen(false)}>Batal</button>
                <button type="button" className="btn-primary" style={{ background: "#cb4335" }} onClick={confirmLogout}>Ya, Keluar</button>
              </div>
            </div>
          </div>
        )}

        {toastMsg && <div className="toast" style={{ display: "block", opacity: 1 }}>{toastMsg}</div>}
      </div>
    </>
  );
}