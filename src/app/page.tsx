"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  // States
  const [view, setView] = useState<"login" | "reset">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Login Form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Reset Form
  const [resetPhone, setResetPhone] = useState("");
  const [resetMethod, setResetMethod] = useState<"whatsapp" | "sms">(
    "whatsapp",
  );

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username.trim().toLowerCase())
        .single();

      if (error || !data) throw new Error("Username tidak ditemukan di sistem");
      if (data.password !== password) throw new Error("Kata sandi salah");

      localStorage.setItem("mbg_user", JSON.stringify(data));
      router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsLoading(true);

    // Simulasi delay jaringan seperti di app.js
    setTimeout(() => {
      const otpCode = Math.floor(100000 + Math.random() * 900000);
      const metodeLabel = resetMethod === "whatsapp" ? "WhatsApp" : "SMS";
      setSuccessMsg(
        `Kode verifikasi telah dikirim via ${metodeLabel} ke ${resetPhone} (Demo OTP: ${otpCode})`,
      );
      setIsLoading(false);
    }, 1000);
  };

  return (
    <>
      {/* BACKGROUND MAKANAN SESUAI INDEX.HTML LAMA */}
      <div className="food-layer" id="food-bg">
        <div
          className="food-flake"
          style={{ top: "4%", left: "6%", fontSize: "3.8rem" }}
        >
          🍎
        </div>
        <div
          className="food-flake"
          style={{ top: "12%", left: "22%", fontSize: "2.8rem" }}
        >
          🌾
        </div>
        <div
          className="food-flake"
          style={{ top: "6%", left: "42%", fontSize: "3.2rem" }}
        >
          🐟
        </div>
        <div
          className="food-flake"
          style={{ top: "3%", right: "28%", fontSize: "3.5rem" }}
        >
          🍗
        </div>
        <div
          className="food-flake"
          style={{ top: "14%", right: "8%", fontSize: "3rem" }}
        >
          🍌
        </div>
        <div
          className="food-flake"
          style={{ top: "35%", left: "4%", fontSize: "3.5rem" }}
        >
          🥦
        </div>
        <div
          className="food-flake"
          style={{ top: "50%", left: "15%", fontSize: "3rem" }}
        >
          🧅
        </div>
        <div
          className="food-flake"
          style={{ top: "60%", right: "6%", fontSize: "3.6rem" }}
        >
          🧅
        </div>
        <div
          className="food-flake"
          style={{ top: "42%", right: "18%", fontSize: "3.2rem" }}
        >
          🥛
        </div>
        <div
          className="food-flake"
          style={{ bottom: "18%", left: "10%", fontSize: "3rem" }}
        >
          🥕
        </div>
        <div
          className="food-flake"
          style={{ bottom: "8%", left: "35%", fontSize: "2.5rem" }}
        >
          ⭐
        </div>
        <div
          className="food-flake"
          style={{ bottom: "5%", right: "25%", fontSize: "3.4rem" }}
        >
          🍱
        </div>
        <div
          className="food-flake"
          style={{ bottom: "15%", right: "5%", fontSize: "3rem" }}
        >
          🥚
        </div>
        <div
          className="food-flake"
          style={{ top: "28%", left: "38%", fontSize: "2.8rem" }}
        >
          🫑
        </div>
      </div>

      {/* TAMPILAN LOGIN */}
      {view === "login" && (
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-brand">
              <h1>Makan Bergizi Gratis</h1>
              <p>Smart System</p>
            </div>

            <h2 className="auth-title">Login Petugas</h2>
            {errorMsg && <div className="auth-error">{errorMsg}</div>}

            <form onSubmit={handleLogin}>
              <div className="input-group">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  placeholder="Username (Misal: Fadiah)"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="input-group">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  placeholder="Kata Sandi"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="auth-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? "Masuk..." : "Masuk"}
                </button>
                <a
                  href="#"
                  className="link-action"
                  onClick={(e) => {
                    e.preventDefault();
                    setView("reset");
                    setErrorMsg("");
                  }}
                >
                  Lupa Sandi?
                </a>
              </div>
            </form>

            <div className="auth-footer">
              <p>Untuk akses baru, hubungi administrator sistem.</p>
            </div>
          </div>
        </div>
      )}

      {/* TAMPILAN RESET PASSWORD */}
      {view === "reset" && (
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-brand">
              <h1>Makan Bergizi Gratis</h1>
              <p>Smart System</p>
            </div>

            <h2 className="auth-title">Reset Akses Petugas</h2>
            <p className="auth-subtitle">
              Masukkan nomor HP terdaftar dan pilih metode pengiriman kode
              verifikasi (OTP).
            </p>

            {errorMsg && <div className="auth-error">{errorMsg}</div>}
            {successMsg && <div className="auth-success">{successMsg}</div>}

            <form onSubmit={handleReset}>
              <div className="input-group">
                <span className="input-icon">📱</span>
                <input
                  type="tel"
                  placeholder="Nomor HP (Contoh: 08123456789)"
                  required
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value)}
                />
              </div>

              <p className="method-label">Pilih Metode:</p>
              <div className="method-toggle">
                <button
                  type="button"
                  className={`method-btn ${resetMethod === "whatsapp" ? "active" : ""}`}
                  onClick={() => setResetMethod("whatsapp")}
                >
                  <span className="method-icon">📞</span> WhatsApp
                </button>
                <button
                  type="button"
                  className={`method-btn ${resetMethod === "sms" ? "active" : ""}`}
                  onClick={() => setResetMethod("sms")}
                >
                  <span className="method-icon">💬</span> SMS
                </button>
              </div>

              <button
                type="submit"
                className="btn-primary btn-primary-full"
                disabled={isLoading}
              >
                {isLoading ? "Mengirim..." : "Kirim Kode Reset"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <a
                href="#"
                className="link-action"
                onClick={(e) => {
                  e.preventDefault();
                  setView("login");
                  setSuccessMsg("");
                }}
              >
                Kembali ke Halaman Login
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
