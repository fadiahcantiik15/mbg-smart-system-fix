"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import bcrypt from "bcryptjs";
import emailjs from "@emailjs/browser";

export default function LoginPage() {
  const router = useRouter();

  const FONNTE_TOKEN = "Jio7p1wbK3hMVV5db8xe"; 
  const EMAILJS_SERVICE_ID = "service_4g8z0w9";
  const EMAILJS_TEMPLATE_ID = "template_saj3aar";
  const EMAILJS_PUBLIC_KEY = "iH9Qe-hTBurk2KwH3";

  const [view, setView] = useState<"login" | "register" | "reset">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // --- States untuk Fitur Mata (Show/Hide Password) ---
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [showPasswordRegister, setShowPasswordRegister] = useState(false);
  const [showConfirmPassRegister, setShowConfirmPassRegister] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [noHp, setNoHp] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [resetStep, setResetStep] = useState(1);
  const [resetPhone, setResetPhone] = useState("");
  const [resetMethod, setResetMethod] = useState<"whatsapp" | "email">("whatsapp");
  const [otpInput, setOtpInput] = useState(["", "", "", "", "", ""]);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  // ==========================================
  // KOMPONEN TOMBOL MATA (Toggle Password)
  // ==========================================
  const PasswordToggle = ({ isVisible, setIsVisible }: { isVisible: boolean, setIsVisible: (val: boolean) => void }) => (
    <button
      type="button"
      className="password-toggle-btn"
      onClick={() => setIsVisible(!isVisible)}
      title={isVisible ? "Sembunyikan Sandi" : "Tampilkan Sandi"}
    >
      <img 
        // Menggunakan ikon kustom dari aset lokal
        src={isVisible ? "/assets/iconpass-open.png" : "/assets/iconpass-hidden.png"} 
        alt={isVisible ? "Sembunyikan" : "Tampilkan"} 
        style={{ width: "20px", height: "20px", objectFit: "contain" }} 
      />
    </button>
  );

  const handleResetRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsLoading(true);

    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("no_hp", resetPhone)
        .single();

      if (error || !user) throw new Error("Nomor HP tidak ditemukan di sistem!");
      if (resetMethod === "email" && !user.email) throw new Error("Akun ini belum mendaftarkan email.");

      const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = new Date(Date.now() + 5 * 60000).toISOString();

      await supabase
        .from("users")
        .update({ otp_code: generatedOTP, otp_expiry: expiryTime })
        .eq("id", user.id);

      setTargetUser(user);

      if (resetMethod === "whatsapp") {
        const response = await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: FONNTE_TOKEN },
          body: new URLSearchParams({
            target: resetPhone,
            message: `Halo *${user.nama_lengkap}*,\n\nKode OTP reset password MBG Smart System kamu adalah: *${generatedOTP}*\n\nBerlaku 5 menit.`,
          }),
        });
        const resData = await response.json();
        if(!resData.status) throw new Error("Gagal mengirim WA. Pastikan token Fonnte aktif.");
      } else {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            nama_lengkap: user.nama_lengkap,
            otp_code: generatedOTP,
            email: user.email,
          },
          EMAILJS_PUBLIC_KEY
        );
      }

      setSuccessMsg(`Kode OTP berhasil dikirim ke ${resetMethod.toUpperCase()}`);
      setResetStep(2);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const finalOtp = otpInput.join("");
    if (finalOtp.length < 6) return;

    setIsLoading(true);
    try {
      const { data: user } = await supabase.from("users").select("*").eq("id", targetUser.id).single();
      if (user.otp_code !== finalOtp) throw new Error("Kode OTP salah!");
      if (new Date() > new Date(user.otp_expiry)) throw new Error("Kode OTP sudah kadaluarsa!");
      
      setSuccessMsg("Verifikasi Berhasil! Silakan buat sandi baru.");
      setResetStep(3);
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsLoading(false); }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setErrorMsg("Sandi minimal 8 karakter!"); return; }
    setIsLoading(true);
    try {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(newPassword, salt);
      await supabase.from("users").update({ password: hashedPassword, otp_code: null, otp_expiry: null }).eq("id", targetUser.id);
      alert("Sandi berhasil diperbarui! Silakan login kembali.");
      window.location.reload(); 
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(""); setIsLoading(true);
    try {
      const { data, error } = await supabase.from("users").select("*").eq("username", username.trim().toLowerCase()).single();
      if (error || !data) throw new Error("Username tidak ditemukan di sistem");
      
      const isPasswordMatch = bcrypt.compareSync(password, data.password);
      if (!isPasswordMatch) throw new Error("Kata sandi salah");

      if (data.status === "pending") {
        throw new Error("Akun Anda sedang menunggu proses persetujuan Admin.");
      } else if (data.status === "ditolak") {
        throw new Error("Maaf, pendaftaran akun Anda ditolak oleh Admin.");
      }

      localStorage.setItem("mbg_user", JSON.stringify(data));
      router.push("/dashboard");
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    if (password !== confirmPass) { setErrorMsg("Konfirmasi kata sandi tidak cocok!"); return; }
    if (password.length < 8 || (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))) {
      setErrorMsg("Sandi harus minimal 8 karakter & mengandung huruf serta angka!"); return;
    }
    setIsLoading(true);
    try {
      const { data: existingUser } = await supabase.from("users").select("username").eq("username", username.toLowerCase()).single();
      if (existingUser) throw new Error("Username sudah digunakan!");
      
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);
      
      const { error } = await supabase.from("users").insert([{
        username: username.toLowerCase(), 
        password: hashedPassword, 
        nama_lengkap: namaLengkap, 
        no_hp: noHp, 
        lokasi: lokasi, 
        role: "Petugas Lapangan",
        status: "pending" 
      }]);
      
      if (error) throw error;
      
      alert("Akun telah didaftarkan, silakan menunggu proses persetujuan admin.");
      
      setView("login"); 
      setUsername(""); setPassword(""); setConfirmPass(""); setNamaLengkap(""); setNoHp(""); setLokasi("");
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsLoading(false); }
  };

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

      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-brand">
            <h1 style={{ fontSize: "1.7rem", whiteSpace: "nowrap", marginBottom: "4px" }}>Makan Bergizi Gratis</h1>
            <p>Smart System</p>
          </div>

          {view === "login" && (
            <>
              <h2 className="auth-title">Login Petugas</h2>
              {errorMsg && <div className="auth-error">{errorMsg}</div>}

              <form onSubmit={handleLogin}>
                <div className="input-group">
                  <span className="input-icon">
                    <img src="/assets/icon-user.png" alt="User Icon" style={{ width: "26px", height: "26px", objectFit: "contain" }} />
                  </span>
                  <input type="text" placeholder="Username (Misal: Fadiah)" required value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                
                {/* Input Password Login dengan Fitur Mata */}
                <div className="input-group">
                  <span className="input-icon">
                    <img src="/assets/icon-lock.png" alt="Lock Icon" style={{ width: "26px", height: "26px", objectFit: "contain" }} />
                  </span>
                  <input 
                    type={showPasswordLogin ? "text" : "password"} 
                    placeholder="Kata Sandi" 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                  />
                  <PasswordToggle isVisible={showPasswordLogin} setIsVisible={setShowPasswordLogin} />
                </div>
                
                <div className="auth-actions">
                  <button type="submit" className="btn-primary" disabled={isLoading}>{isLoading ? "Masuk..." : "Masuk"}</button>
                  <a href="#" className="link-action" onClick={(e) => { e.preventDefault(); setView("reset"); setErrorMsg(""); }}>Lupa Sandi?</a>
                </div>
              </form>

              <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.85rem" }}>
                Belum punya akun? <a href="#" style={{ color: "var(--clr-teal)", fontWeight: "bold" }} onClick={(e) => { e.preventDefault(); setView("register"); setErrorMsg(""); setShowPasswordLogin(false); }}>Daftar Sekarang</a>
              </p>
              
              <div className="auth-footer" style={{ marginTop: "2rem", borderTop: "1px solid var(--clr-gray-200)", paddingTop: "1.5rem" }}>
                <p style={{ marginBottom: "12px", color: "var(--clr-gray-500)" }}>Untuk akses baru, hubungi administrator sistem.</p>
                <a 
                  href="https://wa.me/6281344188607?text=Halo%20Admin%2C%20saya%20petugas%20baru%20MBG.%20Saya%20sudah%20mendaftar%20akun%20dan%20ingin%20meminta%20persetujuan%20akses%20login." 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px", background: "#25D366", color: "white", padding: "8px 20px", borderRadius: "24px", textDecoration: "none", fontSize: "0.9rem", fontWeight: "600", boxShadow: "0 4px 10px rgba(37, 211, 102, 0.3)", transition: "all 0.3s ease"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                  onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .104 5.383.101 11.947c0 2.098.546 4.142 1.584 5.945L0 24l6.335-1.652c1.74.943 3.71 1.444 5.714 1.447h.005c6.553 0 11.89-5.386 11.893-11.95a11.813 11.813 0 00-3.48-8.413z"/>
                  </svg>
                  Hubungi Admin
                </a>
              </div>
            </>
          )}

          {view === "register" && (
            <>
              <h2 className="auth-title">Daftar Petugas Baru</h2>
              {errorMsg && <div className="auth-error">{errorMsg}</div>}
              <form onSubmit={handleRegister}>
                <div className="input-group"><input type="text" placeholder="Nama Lengkap" required value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} /></div>
                <div className="input-group"><input type="text" placeholder="Username" required value={username} onChange={(e) => setUsername(e.target.value)} /></div>
                <div className="input-group"><input type="tel" placeholder="Nomor Telepon (Awali 628...)" required value={noHp} onChange={(e) => setNoHp(e.target.value.replace(/\D/g, ""))} /></div>
                <div className="input-group"><input type="text" placeholder="Lokasi Tugas (Dapur MBG)" required value={lokasi} onChange={(e) => setLokasi(e.target.value)} /></div>
                
                {/* Input Kata Sandi Daftar dengan Fitur Mata */}
                <div className="input-group" style={{ marginBottom: "8px" }}>
                  <input 
                    type={showPasswordRegister ? "text" : "password"} 
                    placeholder="Kata Sandi" 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                  />
                  <PasswordToggle isVisible={showPasswordRegister} setIsVisible={setShowPasswordRegister} />
                </div>
                
                <p style={{ fontSize: "0.75rem", color: "var(--clr-gray-500)", marginTop: "0", marginBottom: "12px", marginLeft: "4px" }}>*Minimal 8 karakter, kombinasi huruf & angka</p>
                
                {/* Input Konfirmasi Sandi Daftar dengan Fitur Mata */}
                <div className="input-group">
                  <input 
                    type={showConfirmPassRegister ? "text" : "password"} 
                    placeholder="Konfirmasi Sandi" 
                    required 
                    value={confirmPass} 
                    onChange={(e) => setConfirmPass(e.target.value)} 
                  />
                  <PasswordToggle isVisible={showConfirmPassRegister} setIsVisible={setShowConfirmPassRegister} />
                </div>
                
                <button type="submit" className="btn-primary btn-primary-full" disabled={isLoading}>{isLoading ? "Mendaftarkan..." : "Daftar Akun"}</button>
              </form>
              <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.85rem" }}>Sudah punya akun? <a href="#" style={{ color: "var(--clr-teal)", fontWeight: "bold" }} onClick={(e) => { e.preventDefault(); setView("login"); setErrorMsg(""); setShowPasswordRegister(false); setShowConfirmPassRegister(false); }}>Login</a></p>
            </>
          )}

          {view === "reset" && (
            <>
              <h2 className="auth-title">Reset Akses Petugas</h2>
              {errorMsg && <div className="auth-error">{errorMsg}</div>}
              {successMsg && <div className="auth-success" style={{color:'green', fontSize:'0.85rem', marginBottom:'10px', textAlign:'center'}}>{successMsg}</div>}

              {resetStep === 1 && (
                <form onSubmit={handleResetRequest}>
                  <p className="auth-subtitle">Masukkan nomor telepon terdaftar (Awali dengan 62).</p>
                  <div className="input-group">
                    <span className="input-icon">📱</span>
                    <input type="tel" placeholder="Contoh: 628123456789" required value={resetPhone} onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, ""))} />
                  </div>

                  <p className="method-label">Pilih Metode:</p>
                  <div className="method-toggle">
                    <button type="button" className={`method-btn ${resetMethod === "whatsapp" ? "active" : ""}`} onClick={() => setResetMethod("whatsapp")}>
                      <span className="method-icon">📞</span> WhatsApp
                    </button>
                    <button type="button" className={`method-btn ${resetMethod === "email" ? "active" : ""}`} onClick={() => setResetMethod("email")}>
                      <span className="method-icon">📧</span> Email
                    </button>
                  </div>

                  <button type="submit" className="btn-primary btn-primary-full" disabled={isLoading}>
                    {isLoading ? "Mengirim..." : "Kirim Kode Reset"}
                  </button>
                </form>
              )}

              {resetStep === 2 && (
                <div style={{ textAlign: "center" }}>
                  <p className="auth-subtitle">Masukkan 6 digit kode yang dikirim ke perangkat Anda.</p>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "1.5rem" }}>
                    {otpInput.map((digit, i) => (
                      <input key={i} type="text" maxLength={1} value={digit} onChange={(e) => {
                        const newOtp = [...otpInput]; newOtp[i] = e.target.value; setOtpInput(newOtp);
                        if (e.target.value && i < 5) {
                          const inputs = document.querySelectorAll('.otp-input');
                          (inputs[i+1] as HTMLInputElement).focus();
                        }
                      }} className="otp-input" style={{ width: "40px", height: "50px", textAlign: "center", fontSize: "1.5rem", borderRadius: "8px", border: "2px solid var(--clr-teal)" }} />
                    ))}
                  </div>
                  <button onClick={handleVerifyOTP} className="btn-primary btn-primary-full" disabled={isLoading}>Verifikasi Kode</button>
                </div>
              )}

              {resetStep === 3 && (
                <form onSubmit={handleUpdatePassword}>
                  <p className="auth-subtitle">Buat kata sandi baru Anda.</p>
                  {/* Input Sandi Baru Lupa Sandi dengan Fitur Mata */}
                  <div className="input-group">
                    <span className="input-icon">🔒</span>
                    <input 
                      type={showPasswordLogin ? "text" : "password"} 
                      placeholder="Sandi Baru" 
                      required 
                      value={newPassword} 
                      onChange={(e)=>setNewPassword(e.target.value)} 
                    />
                    <PasswordToggle isVisible={showPasswordLogin} setIsVisible={setShowPasswordLogin} />
                  </div>
                  <button type="submit" className="btn-primary btn-primary-full" disabled={isLoading}>Simpan Sandi Baru</button>
                </form>
              )}

              <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <a href="#" className="link-action" onClick={(e) => { e.preventDefault(); setView("login"); setResetStep(1); setSuccessMsg(""); setErrorMsg(""); setShowPasswordLogin(false); }}>Kembali ke Halaman Login</a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}