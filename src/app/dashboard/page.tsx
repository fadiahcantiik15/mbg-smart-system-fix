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

  // === STATE UNTUK PENCARIAN ===
  const [searchQueryLog, setSearchQueryLog] = useState("");
  const [searchQueryPending, setSearchQueryPending] = useState("");
  const [searchQueryTrash, setSearchQueryTrash] = useState("");

  // States untuk Approval Admin
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);

  // Profil (DITAMBAHKAN jenis_kelamin)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nama_lengkap: "", lokasi: "", no_hp: "", jenis_kelamin: "" });
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
      showToast("Hasil & Lokasi berhasil disimpan!");
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
      showToast(`Status ${nama} diubah menjadi ${newStatus.toUpperCase()}`);
      setPendingUsers(pendingUsers.filter(user => user.id !== id));
    } catch (err: any) { alert("Gagal mengubah status: " + err.message); }
  };

  // === FUNGSI FILTER PENCARIAN ===
  const filteredLogs = logEntries.filter((log) => {
    if (!searchQueryLog) return true;
    const query = searchQueryLog.toLowerCase();
    return (
      (log.jenis_makanan?.toLowerCase().includes(query)) ||
      (log.petugas_nama?.toLowerCase().includes(query)) ||
      (log.status?.toLowerCase().includes(query))
    );
  });

  const filteredPendingUsers = pendingUsers.filter((user) => {
    if (!searchQueryPending) return true;
    const query = searchQueryPending.toLowerCase();
    return (
      (user.nama_lengkap?.toLowerCase().includes(query)) ||
      (user.username?.toLowerCase().includes(query)) ||
      (user.lokasi?.toLowerCase().includes(query))
    );
  });

  const filteredTrashEntries = trashEntries.filter((log) => {
    if (!searchQueryTrash) return true;
    const query = searchQueryTrash.toLowerCase();
    return (
      (log.jenis_makanan?.toLowerCase().includes(query)) ||
      (log.petugas_nama?.toLowerCase().includes(query)) ||
      (log.status?.toLowerCase().includes(query))
    );
  });

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) { alert("Belum ada data untuk diunduh."); return; }
    let csv = "Waktu,Status,Jenis Makanan,Petugas,Akurasi,Lokasi GPS,Kalori (kkal),Protein (g),Lemak (g),Karbo (g)\n";
    filteredLogs.forEach((log) => {
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
  
  const openEditModal = () => { 
    setEditForm({ 
      nama_lengkap: currentUser.nama_lengkap || "", 
      lokasi: currentUser.lokasi || "", 
      no_hp: currentUser.no_hp || "",
      jenis_kelamin: currentUser.jenis_kelamin || ""
    }); 
    setIsEditModalOpen(true); 
  };
  
  const handleSaveProfil = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSavingProfile(true);
    try {
      const { data, error } = await supabase.from("users").update({ 
        nama_lengkap: editForm.nama_lengkap, 
        lokasi: editForm.lokasi, 
        no_hp: editForm.no_hp,
        jenis_kelamin: editForm.jenis_kelamin 
      }).eq("username", currentUser.username).select().single();
      if (error) throw error;
      localStorage.setItem("mbg_user", JSON.stringify(data)); setCurrentUser(data); setIsEditModalOpen(false); showToast("Profil berhasil diperbarui!");
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
              <img src="/assets/icon-home.png" alt="Home" style={{ width: "30px", height: "30px", objectFit: "contain", marginRight: "8px" }} /> Halaman Utama
            </button>

            {!isAdmin && (
              <button className={`nav-item ${activePage === "camera" ? "active" : ""}`} onClick={() => { setActivePage("camera"); setIsSidebarOpen(false); }}>
                <img src="/assets/icon-camera-utama.png" alt="Kamera" style={{ width: "30px", height: "30px", objectFit: "contain", marginRight: "8px" }} /> Kamera Deteksi
              </button>
            )}

           {isAdmin && (
              <button className={`nav-item ${activePage === "approval" ? "active" : ""}`} onClick={() => { setActivePage("approval"); setIsSidebarOpen(false); }}>
                <img src="/assets/icon-verifikasi.png" alt="Verifikasi" style={{ width: "35px", height: "35px", objectFit: "contain", marginRight: "8px" }} /> Verifikasi Petugas
              </button>
            )}

            <button className={`nav-item ${activePage === "log" ? "active" : ""}`} onClick={() => { setActivePage("log"); setIsSidebarOpen(false); }}>
              <img src="/assets/icon-logriwayat.png" alt="Log" style={{ width: "30px", height: "30px", objectFit: "contain", marginRight: "8px" }} /> Log Riwayat
            </button>

            <button className={`nav-item ${activePage === "sampah" ? "active" : ""}`} onClick={() => { setActivePage("sampah"); setIsSidebarOpen(false); }}>
              <img src="/assets/icon-trashutama.png" alt="Sampah" style={{ width: "28px", height: "28px", objectFit: "contain", marginRight: "8px" }} /> Data Terhapus
            </button>

            <button className={`nav-item ${activePage === "profil" ? "active" : ""}`} onClick={() => { setActivePage("profil"); setIsSidebarOpen(false); }}>
              <img src="/assets/icon-profile.png" alt="Profil" style={{ width: "28px", height: "28px", objectFit: "contain", marginRight: "8px" }} /> Akun Saya
            </button>
          </nav>

          <div className="sidebar-footer">
            
            {/* === KOTAK PROFIL BARU === */}
            <div className="profile-badge">
            {/* Munculkan avatar HANYA jika jenis kelamin sudah diatur */}
              {currentUser.jenis_kelamin && (
                <div className="profile-avatar-wrapper">
                  <div className="profile-avatar" style={{ overflow: "hidden", border: "none" }}>
                    {currentUser.jenis_kelamin === "Laki-laki" ? (
                      <img src="/assets/icon-cowo.png" alt="Cowo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <img src="/assets/icon-cewe.png" alt="Cewe" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  <div className="status-dot" title="Online"></div>
                </div>
              )}
              <div className="profile-info">
                <div className="profile-name">{currentUser.nama_lengkap}</div>
                <div className="profile-label">{currentUser.role}</div>
              </div>
            </div>

            <button className="btn-logout" onClick={handleLogoutClick}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg> Keluar
            </button>
          </div>
        </aside>

        <main className="main-content" style={{ zIndex: 10, position: "relative", background: "transparent" }}>
          
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

            * {
              font-family: 'Plus Jakarta Sans', sans-serif !important;
            }

            .main-content { background: transparent !important; }
            
            /* ========================================================= */
            /* PENGATURAN OPACITY (TRANSPARANSI) GAMBAR LATAR BELAKANG   */
            /* ========================================================= */
            .food-flake img {
              opacity: 0.7 !important; /* <--- UBAH ANGKA INI (0.1 = sangat pudar, 1 = tajam) */
              /* filter: blur(2px) !important; <-- Aktifkan kalau tetap mau tambah sedikit blur */
            }

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

            .quality-card, .profil-card, .log-empty {
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

            /* ========================================================= */
            /* DESAIN KOTAK PROFIL BARU (MODERN)                         */
            /* ========================================================= */
            .profile-badge {
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
              background: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%) !important;
              border-radius: var(--radius-md) !important;
              padding: 12px 16px !important;
              margin-bottom: 1rem !important; 
              border: 1px solid rgba(255,255,255, 0.1) !important;
              width: 100% !important; 
              box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important;
            }

            .profile-avatar-wrapper {
              position: relative;
              display: flex;
            }

            .profile-avatar {
              background-color: rgba(255, 255, 255, 0.15) !important;
              color: #ffffff !important;
              border: 1px solid rgba(255, 255, 255, 0.3);
              width: 42px !important;
              height: 42px !important;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              font-weight: bold;
              font-size: 1.2rem;
            }

            .status-dot {
              position: absolute;
              bottom: 0;
              right: 0;
              width: 13px;
              height: 13px;
              background-color: #2ecc71;
              border: 2px solid #153759;
              border-radius: 50%;
              box-shadow: 0 0 5px rgba(46, 204, 113, 0.5);
            }

            .profile-info {
              display: flex;
              flex-direction: column;
              flex: 1; 
              overflow: hidden;
            }
            
            .profile-info .profile-name { 
              color: #ffffff !important; 
              font-weight: 700 !important;
              font-size: 0.95rem !important;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .profile-info .profile-label { 
              color: rgba(255, 255, 255, 0.6) !important; 
              font-size: 0.75rem !important;
              margin-top: 2px;
            }

            /* ========================================================= */
            /* KOTAK PETUNJUK 1-2-3 (KUMPUL DI TENGAH DENGAN GAP)        */
            /* ========================================================= */
            .step-indicators {
              display: flex !important; 
              flex-direction: row !important; 
              justify-content: center !important; 
              gap: 200px !important; 
              width: 100% !important; 
              padding: 0 !important; 
              box-sizing: border-box !important; 
            }
            
            .step-item {
              background-color: rgba(21, 55, 89, 0.9) !important; 
              backdrop-filter: blur(8px) !important; 
              box-shadow: 0 6px 15px rgba(21, 55, 89, 0.25) !important;
              border: 1px solid rgba(255,255,255, 0.1) !important;
              border-radius: var(--radius-sm) !important; 
              padding: 0.3rem 2.5rem !important; /* <-- UBAH DI SINI: 2.5rem bikin kiri-kanannya lebih panjang */
              min-width: 200px !important; /* <-- TAMBAHKAN INI: Memaksa kotak punya lebar minimal 240px */
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
              width: 50px !important; 
              height: 50px !important;
              border-radius: 50% !important;
              font-size: 1.8rem !important; 
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
                  
                  {/* KOLOM 1: Deteksi Kualitas */}
                  <div className="step-item">
                    <div className="step-icon">
                      <img src="/assets/icon-camera-utama.png" alt="Deteksi Kualitas" style={{ width: "35px", height: "35px", objectFit: "contain" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                      <span className="step-label">Deteksi Kualitas</span>
                      <span style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)", fontWeight: "normal" }}>Analisis Kelayakan Konsumsi</span>
                    </div>
                  </div>
                  
                  {/* KOLOM 2: Info Nutrisi */}
                  <div className="step-item">
                    <div className="step-icon">
                      <img src="/assets/icon-nutrisi.png" alt="Info Nutrisi" style={{ width: "35px", height: "35px", objectFit: "contain" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                      <span className="step-label">Info Nutrisi</span>
                      <span style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)", fontWeight: "normal" }}>Kalori, protein, dll</span>
                    </div>
                  </div>
                  
                  {/* KOLOM 3: Log Riwayat */}
                  <div className="step-item">
                    <div className="step-icon">
                      <img src="/assets/icon-logriwayat.png" alt="Log Riwayat" style={{ width: "35px", height: "35px", objectFit: "contain" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                      <span className="step-label">Log Riwayat</span>
                      <span style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)", fontWeight: "normal" }}>Daftar Hasil Pengecekan</span>
                    </div>
                  </div>

                </div>
              ) : !["camera", "log", "sampah", "profil"].includes(activePage) ? (
                <></>
              ) : null}
            </div>
          </div>

          <div className="dashboard-body">
            {activePage === "home" && (
              <div className="dash-view active">
               {isAdmin ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                
                {/* === AREA JUDUL TERPUSAT === */}
                <div style={{ 
                  marginBottom: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center"
                }}>
                  
                  {/* KOTAK JUDUL BIRU NAVY */}
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
                    gap: "12px",
                    boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                  }}>
                    <img 
                      src="/assets/icon-admin-dashboard.png" 
                      alt="Icon Dashboard" 
                      style={{ width: "45px", height: "45px", objectFit: "contain" }} 
                    />
                    Dashboard Administrator
                  </div>

                  {/* TEKS DESKRIPTIF TERPUSAT */}
                  <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0 0 20px 0", maxWidth: "600px",   lineHeight: "2" }}>
                    Pusat kendali utama untuk memantau kualitas gizi, aktivitas petugas, dan operasional <br />
                    Dapur MBG secara menyeluruh.
                  </p>
                </div>

                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "2rem", flexWrap: "wrap" }}>
                      
                      {/* CONTAINER UTAMA (Memastikan box melebar ke samping) */}
                    <div style={{ 
                      display: "flex", 
                      gap: "1.5rem", 
                      width: "100%", 
                      justifyContent: "center", 
                      flexWrap: "wrap", 
                      marginBottom: "2rem" 
                    }}>

                      {/* --- KOTAK 1: KUALITAS SEGAR --- */}
                      <div className="profil-card" style={{ 
                        flex: 1, 
                        minWidth: "250px", 
                        padding: "1.5rem", 
                        borderRadius: "12px", 
                        borderBottom: "4px solid #2ecc71",
                        textAlign: "center" 
                      }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-gray-500)", fontWeight: "700", marginBottom: "0.5rem" }}>KUALITAS SEGAR</p>
                        <h3 style={{ fontSize: "2.5rem", color: "#4cbb17", margin: "0.5rem 0", fontWeight: "bold" }}>
                          {logEntries.filter((log) => log.status === "Segar").length}
                        </h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--clr-gray-400)" }}>Layak konsumsi</p>
                      </div>

                      {/* --- KOTAK 2: KUALITAS BASI --- */}
                      <div className="profil-card" style={{ 
                        flex: 1, 
                        minWidth: "250px", 
                        padding: "1.5rem", 
                        borderRadius: "12px", 
                        borderBottom: "4px solid #e74c3c",
                        textAlign: "center" 
                      }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-gray-500)", fontWeight: "700", marginBottom: "0.5rem" }}>KUALITAS BASI</p>
                        <h3 style={{ fontSize: "2.5rem", color: "#e74c3c", margin: "0.5rem 0", fontWeight: "bold" }}>
                          {logEntries.filter((log) => log.status === "Basi").length}
                        </h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--clr-gray-400)" }}>Tidak layak</p>
                      </div>

                      {/* --- KOTAK 3: TOTAL PEMERIKSAAN --- */}
                      <div className="profil-card" style={{ 
                        flex: 1,           /* Membuat box mengisi ruang kosong */
                        minWidth: "250px", /* Batas minimal agar tetap bagus di layar kecil */
                        padding: "1.5rem", 
                        borderRadius: "12px", 
                        borderBottom: "4px solid #7ea69f",
                        textAlign: "center" 
                      }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-gray-500)", fontWeight: "700", marginBottom: "0.5rem" }}>TOTAL PEMERIKSAAN</p>
                        <h3 style={{ fontSize: "2.5rem", color: "#153759", margin: "0.5rem 0", fontWeight: "bold" }}>
                          {logEntries.length}
                        </h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--clr-gray-400)" }}>Laporan masuk</p>
                      </div>

                    </div>

                    </div>
                  </div>
               ) : (
                  <div style={{ textAlign: "center", padding: "2rem 1rem", marginTop: "0.rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <h2 style={{ fontSize: "1.8rem", marginBottom: "1rem", color: "var(--clr-navy)", fontWeight: "800" }}>Selamat Datang di MBG Smart System</h2>
                    <p style={{ color: "#334155", maxWidth: "600px", lineHeight: "1.8", fontSize: "1rem", marginBottom: "3rem" }}>
                      Gunakan menu <strong>Kamera Deteksi</strong> untuk memulai analisis kualitas dan gizi makanan. Sistem akan mendeteksi kesegaran makanan dan menampilkan informasi nutrisi secara real-time.
                    </p>
                 <div style={{ width: "100%", maxWidth: "800px", padding: "0", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      
                      {/* KOTAK SUMBER REFERENSI */}
                      <div style={{ 
                        background: "rgba(232, 244, 248, 0.9)", 
                        borderLeft: "4px solid var(--clr-teal)", 
                        padding: "1rem 1.5rem", 
                        borderRadius: "8px", 
                        width: "100%", /* <--- Bikin lebarnya sejajar dengan tabel */
                        marginBottom: "1.5rem", /* <--- UBAH ANGKA INI untuk mengatur jarak dari kotak ke tabel (misal: "2rem" atau "10px") */
                        marginTop: "0" /* <--- UBAH ANGKA INI kalau mau menambah jarak dari teks atasnya ke kotak ini */
                      }}>
                        <h3 style={{ fontSize: "1rem", color: "var(--clr-navy)", marginBottom: "6px" }}>
                          Sumber Referensi Gizi Valid
                        </h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--clr-navy-dark)", lineHeight: "1.5", margin: 0 }}>
                          Seluruh kalkulasi gizi pada MBG Smart System menggunakan standar perhitungan mutlak berdasarkan <strong>Tabel Komposisi Pangan Indonesia (TKPI)</strong> yang diterbitkan resmi oleh <strong>Kementerian Kesehatan Republik Indonesia</strong>.
                        </p>
                      </div>
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
                  <img 
                    src="/assets/icon-camera.png" 
                    alt="Ikon Kamera" 
                    style={{ width: "30px", height: "35px", objectFit: "contain" }} 
                  />
                  Kamera Deteksi
                </div>

                {cameraMode === "input" && (
                  <div className="camera-section">
                    
                    <p className="camera-hint" style={{ marginBottom: "15px", color: "var(--clr-navy)", fontWeight: "600" }}>Arahkan kamera ke makanan</p>

                    <div className="camera-viewport">
                      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }}></video>
                      {!cameraStream && (
                        <div className="viewport-overlay">
                          <div className="overlay-icon">
                          <img 
                            src="/assets/icon-camera-shutter.png" 
                            alt="Ikon Kamera Overlay" 
                            style={{ width: "120px", height: "120px", objectFit: "contain", marginBottom: "15px" }} 
                          />
                        </div>
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
                  {/* === AREA JUDUL TERPUSAT SERUPA DENGAN "DATA TERHAPUS" === */}
                  <div style={{ 
                    marginBottom: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center"
                  }}>
                    
                    {/* KOTAK JUDUL BIRU NAVY DENGAN GAMBAR ASET */}
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
                      gap: "12px",
                      boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                    }}>
                      <img 
                      src="/assets/admin-verification.png" 
                      alt="Icon Verifikasi" 
                      style={{ width: "45px", height: "45px", objectFit: "contain" }} 
                    />
                      Verifikasi Petugas
                    </div>

                    {/* TEKS DESKRIPTIF TERPUSAT */}
                    <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0 0 10px 0", maxWidth: "600px", lineHeight: "2" }}>
                      Berikut adalah daftar petugas yang sedang menunggu verifikasi akun. <br />
                      Harap tinjau dan berikan persetujuan akses.
                    </p>

                    {/* === FITUR PENCARIAN VERIFIKASI === */}
                    {pendingUsers.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "center", width: "100%", maxWidth: "800px", marginTop: "10px" }}>
                        <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
                          <img 
                            src="/assets/icon-search.png" /* <--- GANTI NAMA FILE INI */
                            alt="Search Icon"
                            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", objectFit: "contain" }}
                          />
                          <input
                            type="text"
                            placeholder="Cari nama, username, atau lokasi..."
                            value={searchQueryPending}
                            onChange={(e) => setSearchQueryPending(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px 10px 10px 38px",
                              borderRadius: "8px",
                              border: "1px solid rgba(21, 55, 89, 0.2)",
                              outline: "none",
                              fontSize: "0.9rem",
                              color: "#153759",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                   <div className="table-container">
                      <table className="log-table">
                        <thead>
                          <tr>
                            <th>Nama Lengkap</th><th>Username</th><th>No. Telp</th><th>Lokasi Tugas</th><th style={{ textAlign: "center" }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPendingUsers.length > 0 ? (
                            filteredPendingUsers.map((user) => (
                              <tr key={user.id}>
                                <td style={{ fontWeight: "700", color: "var(--clr-navy)" }}>{user.nama_lengkap}</td>
                                <td>{user.username}</td><td>{user.no_hp}</td><td>{user.lokasi}</td>
                                <td style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                  <button onClick={() => handleUpdateStatusPetugas(user.id, "approved", user.nama_lengkap)} style={{ background: "var(--clr-fresh)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}>Setujui</button>
                                  <button onClick={() => handleUpdateStatusPetugas(user.id, "ditolak", user.nama_lengkap)} style={{ background: "var(--clr-spoiled)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700" }}>Tolak</button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "var(--clr-gray-500)", fontWeight: "500" }}>
                                {searchQueryPending ? "Tidak ada hasil pencarian yang cocok." : "Belum ada petugas yang menunggu verifikasi."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                </div>
              </div>
            )}

            {activePage === "log" && (
              <div className="dash-view active">
                <div className="log-section">
                   <div style={{ 
                    marginBottom: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center"
                  }}>
                    
                    {/* KOTAK JUDUL LOG RIWAYAT BARU (DENGAN IKON ASET) */}
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
                      gap: "12px", /* Jarak sedikit dilebarin biar pas */
                      boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                    }}>
                      <img 
                        src="/assets/icon-paper.png" 
                        alt="Icon Log" 
                        style={{ width: "30px", height: "30px", objectFit: "contain" }} 
                      />
                      Laporan Deteksi Gizi
                    </div>

                    <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0 0 10px 0" }}>
                      Seluruh hasil pemindaian kualitas dan gizi makanan tersimpan secara otomatis di sini.
                    </p>

                    {/* === AREA FITUR PENCARIAN & TOMBOL EXPORT (HANYA UNTUK ADMIN) === */}
                    {isAdmin && logEntries.length > 0 && (
                      <div style={{ 
                        display: "flex", 
                        flexWrap: "wrap", 
                        gap: "15px", 
                        marginTop: "10px", 
                        justifyContent: "center", 
                        alignItems: "center", 
                        width: "100%", 
                        maxWidth: "800px" 
                      }}>
                        
                        {/* KOTAK PENCARIAN (Search Bar) */}
                        <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
                          <img 
                            src="/assets/icon-search.png" /* <--- GANTI NAMA FILE INI */
                            alt="Search Icon"
                            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", objectFit: "contain" }}
                          />
                          <input
                            type="text"
                            placeholder="Cari makanan, petugas, atau status..."
                            value={searchQueryLog}
                            onChange={(e) => setSearchQueryLog(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px 10px 10px 38px",
                              borderRadius: "8px",
                              border: "1px solid rgba(21, 55, 89, 0.2)",
                              outline: "none",
                              fontSize: "0.9rem",
                              color: "#153759",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                            }}
                          />
                        </div>

                        {/* TOMBOL EXCEL & PDF */}
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button onClick={handleExportExcel} style={{ background: "#217346", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
                            <img src="/assets/icon-excel.png" alt="Excel" style={{ width: "25px", height: "25px", objectFit: "contain" }} />
                            Excel
                          </button>
                          
                          <button onClick={handleExportPDF} style={{ background: "#cb4335", color: "white", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
                            <img src="/assets/icon-pdf.png" alt="PDF" style={{ width: "25px", height: "25px", objectFit: "contain" }} />
                            PDF
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                  <div className="table-container">
                    <table className="log-table">
                      <thead>
                        <tr><th>Waktu</th><th>Status</th><th>Makanan</th><th>Petugas</th><th>Akurasi</th><th style={{ textAlign: "center" }}>Aksi</th></tr>
                      </thead>
                      <tbody>
                        {/* MENGGUNAKAN filteredLogs BUKAN logEntries AGAR BISA DICARI */}
                        {filteredLogs.length > 0 ? (
                          filteredLogs.map((log, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: "0.8rem" }}>{new Date(log.created_at).toLocaleString("id-ID")}</td>
                              <td><span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{log.status}</span></td>
                              <td style={{ fontWeight: "600" }}>{log.jenis_makanan}</td>
                              <td>{log.petugas_nama}</td><td>{Math.round(log.confidence * 100)}%</td>
                              <td style={{ textAlign: "center" }}>
                                <button 
                                  onClick={() => handleSoftDelete(log.id)} 
                                  style={{ 
                                    background: "transparent", 
                                    border: "none", 
                                    cursor: "pointer", 
                                    padding: "0",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                  }}
                                >
                                  <img 
                                    src="/assets/icon-trashutama.png" 
                                    alt="Hapus" 
                                    style={{ width: "22px", height: "22px", objectFit: "contain" }} 
                                  />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "20px", color: "var(--clr-gray-500)", fontWeight: "500" }}>
                              {searchQueryLog ? "Tidak ada hasil pencarian yang cocok." : "Belum ada riwayat laporan."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activePage === "sampah" && (
              <div className="dash-view active">
                <div className="log-section">
                  <div style={{ 
                    marginBottom: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center"
                  }}>
                    
                  {/* KOTAK JUDUL DATA TERHAPUS DENGAN ICON ASET */}
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
                      <img 
                        src="/assets/icon-trash.png" 
                        alt="Ikon Data Terhapus" 
                        style={{ width: "35px", height: "35px", objectFit: "contain" }} 
                      />
                      Data Terhapus
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0" }}>Item akan dihapus permanen secara otomatis setelah 7 hari.</p>
                    
                    {/* === FITUR PENCARIAN DATA TERHAPUS === */}
                    {trashEntries.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "center", width: "100%", maxWidth: "800px", marginTop: "10px" }}>
                        <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
                          <img 
                            src="/assets/icon-search.png" /* <--- GANTI NAMA FILE INI */
                            alt="Search Icon"
                            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", objectFit: "contain" }}
                          />
                          <input
                            type="text"
                            placeholder="Cari makanan, petugas, atau status..."
                            value={searchQueryTrash}
                            onChange={(e) => setSearchQueryTrash(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px 10px 10px 38px",
                              borderRadius: "8px",
                              border: "1px solid rgba(21, 55, 89, 0.2)",
                              outline: "none",
                              fontSize: "0.9rem",
                              color: "#153759",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="table-container">
                    <table className="log-table">
                      <thead>
                        <tr><th>Dihapus Pada</th><th>Status / Makanan</th><th>Petugas</th><th>Tersisa</th><th style={{ textAlign: "center" }}>Tindakan</th></tr>
                      </thead>
                      <tbody>
                        {filteredTrashEntries.length > 0 ? (
                          filteredTrashEntries.map((log, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: "0.8rem", color: "#cb4335" }}>{new Date(log.deleted_at).toLocaleString("id-ID")}</td>
                              <td><span className={`badge ${log.status === "SEGAR" ? "badge-fresh" : "badge-spoiled"}`}>{log.status}</span> <strong>{log.jenis_makanan}</strong></td>
                              <td>{log.petugas_nama}</td><td>{7 - Math.floor((new Date().getTime() - new Date(log.deleted_at).getTime()) / (1000 * 3600 * 24))} Hari</td>
                              <td style={{ textAlign: "center" }}>
                                <button onClick={() => handleRestore(log.id)} style={{ background: "#2ecc71", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", marginRight: "5px" }}>Pulihkan</button>
                                <button onClick={() => handleHardDelete(log.id)} style={{ background: "#e74c3c", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Hapus</button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "var(--clr-gray-500)", fontWeight: "500" }}>
                              {searchQueryTrash ? "Tidak ada hasil pencarian yang cocok." : "Belum ada data yang terhapus."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */
            /* DESAIN HALAMAN PROFIL BARU (KOTAK PUTIH + JUDUL NAVY)     */
            /* ========================================================= */}
           {activePage === "profil" && (
              <div className="dash-view active">
                {/* === AREA JUDUL TERPUSAT === */}
                <div style={{ 
                  marginBottom: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center"
                }}>
                  
                  {/* KOTAK JUDUL BIRU NAVY */}
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
                    gap: "12px",
                    boxShadow: "0 6px 15px rgba(21, 55, 89, 0.25)"
                  }}>
                    {/* Pastikan nama file iconnya sesuai dengan asetmu */}
                    <img 
                      src="/assets/icon-user.png" 
                      alt="Icon Akun" 
                      style={{ width: "40px", height: "40px", objectFit: "contain" }} 
                    />
                    Akun Saya
                  </div>

                  {/* TEKS DESKRIPTIF TERPUSAT (Pilih salah satu kata-kata di atas) */}
                  <p style={{ fontSize: "0.85rem", color: "#153759", margin: "0 0 10px 0", maxWidth: "600px", lineHeight: "2" }}>
                    Lihat detail profilmu dan kelola akses keamanan akun anda  <br />
                    sebagai petugas terdaftar.
                  </p>
                </div>

                {/* === KOTAK DATA PROFIL (DIPAKSA PUTIH AGAR TEKS TERBACA) === */}
                <div className="profil-section" style={{ width: "100%", maxWidth: "600px" }}>
                  <div className="profil-card" style={{ backgroundColor: "#ffffff", padding: "2rem", borderRadius: "16px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
                    
                    {/* Avatar Profil */}
                    <div className="profil-avatar-big" style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: "#153759", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "2rem", fontWeight: "bold", overflow: "hidden", margin: "0 auto 2rem", boxShadow: "0 4px 10px rgba(21, 55, 89, 0.2)" }}>
                      {currentUser.jenis_kelamin === "Laki-laki" ? (
                        <img src="/assets/icon-cowo.png" alt="Cowo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : currentUser.jenis_kelamin === "Perempuan" ? (
                        <img src="/assets/icon-cewe.png" alt="Cewe" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        currentUser.nama_lengkap.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Data List */}
                    {[
                      { label: "Nama Lengkap", value: currentUser.nama_lengkap },
                      { label: "Username", value: currentUser.username },
                      { label: "Jenis Kelamin", value: currentUser.jenis_kelamin || "Belum diatur" },
                      { label: "Role", value: currentUser.role },
                      { label: "Lokasi", value: currentUser.lokasi },
                      { label: "No. HP", value: currentUser.no_hp },
                    ].map((row, index) => (
                      <div key={index} className="profil-row" style={{ display: "flex", justifyContent: "space-between", padding: "1rem 0", borderBottom: "1px solid #f1f5f9" }}>
                        <span className="row-label" style={{ color: "#64748b", fontWeight: "600", fontSize: "0.9rem" }}>{row.label}</span>
                        <span className="row-value" style={{ color: "#0f172a", fontWeight: "700", fontSize: "0.9rem" }}>{row.value}</span>
                      </div>
                    ))}

                    <div className="profil-row" style={{ justifyContent: "center", marginTop: "1.5rem", borderBottom: "none" }}>
                      <button className="btn-primary" style={{ backgroundColor: "#153759", color: "white", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", width: "100%", border: "none", cursor: "pointer", fontSize: "1rem" }} onClick={openEditModal}>
                        Edit Akun
                      </button>
                    </div>
                  </div>
                </div>
                
              </div>
            )}
          </div>
        </main>

        {/* === MODAL EDIT PROFIL BARU (NAVY THEME) === */}
        {isEditModalOpen && (
          <div className="modal-overlay">
            <div style={{
                backgroundColor: "#153759", color: "#ffffff", borderRadius: "16px", padding: "2rem",
                width: "90%", maxWidth: "500px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255, 0.1)", display: "flex", flexDirection: "column", alignItems: "center"
            }}>
              
              <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontWeight: "700", fontSize: "1.2rem", marginBottom: "2rem", color: "#ffffff" }}>
                <img 
                  src="/assets/icon-user.png" // <--- GANTI INI DENGAN NAMA FILE ASET KAMU
                  alt="Ikon Edit Profil" 
                  style={{ width: "35px", height: "35px", objectFit: "contain" }} 
                />
                <span>Edit Profil Saya</span>
              </div>

              <form onSubmit={handleSaveProfil} style={{ width: "100%" }}>
                <div style={{ width: "100%", marginBottom: "1.2rem", textAlign: "left" }}>
                  <label style={{ color: "rgba(255,255,255, 0.8)", fontWeight: "600", marginBottom: "6px", display: "block" }}>Nama Lengkap</label>
                  <input type="text" value={editForm.nama_lengkap} onChange={(e) => setEditForm({ ...editForm, nama_lengkap: e.target.value })} required style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "rgba(255,255,255, 0.05)", color: "#ffffff", border: "1px solid rgba(255,255,255, 0.2)", outline: "none" }} onFocus={(e) => e.target.style.borderColor = "#2ecc71"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255, 0.2)"} />
                </div>
                
                {/* DITAMBAHKAN: Input Tombol Toggle untuk Jenis Kelamin */}
                <div style={{ width: "100%", marginBottom: "1.2rem", textAlign: "left" }}>
                  <label style={{ color: "rgba(255,255,255, 0.8)", fontWeight: "600", marginBottom: "6px", display: "block" }}>Jenis Kelamin</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    
                    {/* Tombol Laki-laki */}
                    <button 
                      type="button" 
                      onClick={() => setEditForm({ ...editForm, jenis_kelamin: "Laki-laki" })} 
                      style={{ 
                        flex: 1, padding: "10px", borderRadius: "6px", 
                        background: editForm.jenis_kelamin === "Laki-laki" ? "#2ecc71" : "rgba(255,255,255, 0.05)", 
                        color: "#ffffff", 
                        border: editForm.jenis_kelamin === "Laki-laki" ? "none" : "1px solid rgba(255,255,255, 0.2)", 
                        outline: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" /* Tambahan biar icon & teks rapi sejajar */
                      }}
                    >
                      <img src="/assets/icon-cowo.png" alt="Icon Cowo" style={{ width: "23px", height: "23px", objectFit: "contain" }} />
                      Laki-laki
                    </button>

                    {/* Tombol Perempuan */}
                    <button 
                      type="button" 
                      onClick={() => setEditForm({ ...editForm, jenis_kelamin: "Perempuan" })} 
                      style={{ 
                        flex: 1, padding: "10px", borderRadius: "6px", 
                        background: editForm.jenis_kelamin === "Perempuan" ? "#2ecc71" : "rgba(255,255,255, 0.05)", 
                        color: "#ffffff", 
                        border: editForm.jenis_kelamin === "Perempuan" ? "none" : "1px solid rgba(255,255,255, 0.2)", 
                        outline: "none", cursor: "pointer", fontWeight: "bold", transition: "0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                      }}
                    >
                      <img src="/assets/icon-cewe.png" alt="Icon Cewe" style={{ width: "25px", height: "25px", objectFit: "contain" }} />
                      Perempuan
                    </button>

                  </div>
                </div>

                <div style={{ width: "100%", marginBottom: "1.2rem", textAlign: "left" }}>
                  <label style={{ color: "rgba(255,255,255, 0.8)", fontWeight: "600", marginBottom: "6px", display: "block" }}>Lokasi Dapur MBG</label>
                  <input type="text" value={editForm.lokasi} onChange={(e) => setEditForm({ ...editForm, lokasi: e.target.value })} required style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "rgba(255,255,255, 0.05)", color: "#ffffff", border: "1px solid rgba(255,255,255, 0.2)", outline: "none" }} onFocus={(e) => e.target.style.borderColor = "#2ecc71"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255, 0.2)"} />
                </div>
                <div style={{ width: "100%", marginBottom: "1.2rem", textAlign: "left" }}>
                  <label style={{ color: "rgba(255,255,255, 0.8)", fontWeight: "600", marginBottom: "6px", display: "block" }}>Nomor Telp / HP</label>
                  <input type="text" value={editForm.no_hp} onChange={(e) => setEditForm({ ...editForm, no_hp: e.target.value })} required style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "rgba(255,255,255, 0.05)", color: "#ffffff", border: "1px solid rgba(255,255,255, 0.2)", outline: "none" }} onFocus={(e) => e.target.style.borderColor = "#2ecc71"} onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255, 0.2)"} />
                </div>
                
                <div style={{ display: "flex", justifyContent: "center", marginTop: "2rem", gap: "15px" }}>
                  <button type="button" onClick={() => setIsEditModalOpen(false)} style={{ background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.4)", padding: "10px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Batal</button>
                  <button type="submit" disabled={isSavingProfile} style={{ background: "#2ecc71", color: "white", border: "none", padding: "10px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>{isSavingProfile ? "Menyimpan..." : "Simpan Perubahan"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* === MODAL LOGOUT BARU (NAVY THEME) === */}
       {/* === MODAL LOGOUT (FIX WARNA TEKS) === */}
        {isLogoutModalOpen && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ textAlign: "center", backgroundColor: "#153759", padding: "2rem", borderRadius: "16px", maxWidth: "400px", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
                <img src="/assets/bye.png" alt="Logout Icon" style={{ width: "80px", height: "80px", objectFit: "contain" }} />
              </div>
              
              {/* Teks dikunci jadi warna Putih */}
              <h3 className="modal-title" style={{ color: "#ffffff", fontSize: "1.4rem", marginBottom: "10px", fontWeight: "bold" }}>
                Yakin Ingin Keluar?
              </h3>
              <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "2rem", fontSize: "0.95rem", lineHeight: "1.5" }}>
                Sesi anda akan diakhiri dan anda harus login kembali.
              </p>
              
              <div className="modal-actions" style={{ display: "flex", justifyContent: "center", gap: "15px", width: "100%" }}>
                <button 
                  type="button" 
                  onClick={() => setIsLogoutModalOpen(false)}
                  style={{
                    background: "transparent",
                    color: "#ffffff", /* Teks Batal warna Putih */
                    border: "1px solid rgba(255,255,255,0.5)", /* Garis pinggir warna Putih */
                    padding: "10px 24px",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Batal
                </button>
                <button 
                  type="button" 
                  onClick={confirmLogout}
                  style={{
                    background: "#cb4335",
                    color: "white",
                    border: "none",
                    padding: "10px 24px",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    boxShadow: "0 4px 10px rgba(203, 67, 53, 0.3)"
                  }}
                >
                  Ya, Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {toastMsg && <div className="toast" style={{ display: "block", opacity: 1 }}>{toastMsg}</div>}
      </div>
    </>
  );
}