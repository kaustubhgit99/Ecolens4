"use client";

import React, { useState, useEffect, useRef, useTransition, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

type AuthMode = "email_password" | "email_otp" | "phone_otp";
type Step = "credentials" | "otp";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0F172A" }} />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<AuthMode>("email_password");
  const [step, setStep] = useState<Step>("credentials");
  const [isSignUp, setIsSignUp] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Show error from URL params (e.g. from auth callback)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(decodeURIComponent(urlError));
  }, [searchParams]);

  useEffect(() => {
    if (step === "otp") setTimeout(() => otpRefs.current[0]?.focus(), 100);
  }, [step]);

  const clear = () => { setError(null); setInfo(null); };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const otpValue = otp.join("");

  // ── Email + Password ─────────────────────────────────────
  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault(); clear();
    startTransition(async () => {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } },
        });
        if (err) return setError(err.message);
        setInfo("Verification email sent! Check your inbox.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) return setError(err.message);
        router.push("/dashboard");
        router.refresh();
      }
    });
  };

  // ── Send OTP ─────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); clear();
    startTransition(async () => {
      if (mode === "phone_otp") {
        const formatted = phone.startsWith("+") ? phone : `+91${phone}`;
        const { error: err } = await supabase.auth.signInWithOtp({ phone: formatted });
        if (err) return setError(err.message);
      } else {
        const { error: err } = await supabase.auth.signInWithOtp({
          email,
          options: { data: { full_name: fullName } },
        });
        if (err) return setError(err.message);
      }
      setInfo(`OTP sent to your ${mode === "phone_otp" ? "phone" : "email"}.`);
      setStep("otp");
    });
  };

  // ── Verify OTP ───────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length !== 6) return setError("Enter the full 6-digit code.");
    clear();
    startTransition(async () => {
      let result;
      if (mode === "phone_otp") {
        const formatted = phone.startsWith("+") ? phone : `+91${phone}`;
        result = await supabase.auth.verifyOtp({ phone: formatted, token: otpValue, type: "sms" });
      } else {
        result = await supabase.auth.verifyOtp({ email, token: otpValue, type: "email" });
      }
      if (result.error) return setError(result.error.message);
      const redirectTo = searchParams.get("redirect") ?? "/dashboard";
      router.push(redirectTo);
      router.refresh();
    });
  };

  const TABS: { id: AuthMode; label: string; icon: string }[] = [
    { id: "email_password", label: "Password", icon: "🔑" },
    { id: "email_otp",      label: "Email OTP", icon: "✉️" },
    { id: "phone_otp",      label: "Phone OTP", icon: "📱" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
        @keyframes cardIn { from{opacity:0;transform:translateY(16px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes f1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,20px)} }
        @keyframes f2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-30px)} }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#0F172A;color:#F8FAFC;font-family:'DM Sans',sans-serif}
        .page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;position:relative;overflow:hidden;background:#0F172A}
        .bg{position:fixed;inset:0;pointer-events:none;z-index:0}
        .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(46,204,113,.04)1px,transparent 1px),linear-gradient(90deg,rgba(46,204,113,.04)1px,transparent 1px);background-size:40px 40px}
        .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.18}
        .orb1{width:500px;height:500px;background:#2ECC71;top:-200px;right:-150px;animation:f1 8s ease-in-out infinite}
        .orb2{width:400px;height:400px;background:#0EA5E9;bottom:-180px;left:-120px;animation:f2 10s ease-in-out infinite}
        .card{position:relative;z-index:1;width:100%;max-width:420px;background:rgba(30,41,59,.85);backdrop-filter:blur(20px);border:1px solid rgba(46,204,113,.15);border-radius:20px;padding:2rem;box-shadow:0 25px 60px rgba(0,0,0,.5),0 0 80px rgba(46,204,113,.07);animation:cardIn .5s cubic-bezier(.16,1,.3,1) both}
        .brand{display:flex;align-items:center;gap:.75rem;margin-bottom:1.75rem}
        .brand-name{font-size:1.35rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
        .brand-tag{font-size:.7rem;color:#2ECC71;text-transform:uppercase;letter-spacing:.1em;font-weight:500}
        .h2{font-size:1.3rem;font-weight:700;color:#F8FAFC;margin:0 0 .3rem;letter-spacing:-.025em}
        .sub{font-size:.82rem;color:#94A3B8;margin:0 0 1.5rem;line-height:1.5}
        .tabs{display:flex;gap:.35rem;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:4px;margin-bottom:1.25rem}
        .tab{flex:1;display:flex;align-items:center;justify-content:center;gap:.35rem;padding:.45rem .5rem;background:transparent;border:none;border-radius:7px;cursor:pointer;font-size:.78rem;font-weight:500;color:#64748B;transition:all .2s;white-space:nowrap;font-family:inherit}
        .tab:hover{color:#94A3B8;background:rgba(255,255,255,.04)}
        .tab.on{background:rgba(46,204,113,.12);color:#2ECC71;box-shadow:0 0 0 1px rgba(46,204,113,.25)}
        .alert{display:flex;align-items:flex-start;gap:.5rem;padding:.65rem .85rem;border-radius:8px;font-size:.82rem;line-height:1.5;margin-bottom:1rem;animation:fadeIn .2s ease}
        .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#FCA5A5}
        .ok{background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.25);color:#86EFAC}
        .form{display:flex;flex-direction:column;gap:.9rem}
        .field{display:flex;flex-direction:column;gap:.4rem}
        .label{font-size:.78rem;font-weight:500;color:#94A3B8}
        .input{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:.65rem .85rem;color:#F8FAFC;font-size:.9rem;outline:none;transition:border-color .2s,box-shadow .2s;width:100%;font-family:inherit}
        .input::placeholder{color:#475569}
        .input:focus{border-color:rgba(46,204,113,.5);box-shadow:0 0 0 3px rgba(46,204,113,.1)}
        .phone-row{display:flex;align-items:center;gap:.5rem}
        .prefix{display:flex;align-items:center;gap:.3rem;background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:.65rem .75rem;color:#94A3B8;font-size:.85rem;white-space:nowrap;flex-shrink:0}
        .otp-group{display:flex;gap:.5rem;justify-content:center;margin:.5rem 0}
        .otp-box{width:46px;height:56px;background:rgba(15,23,42,.7);border:1.5px solid rgba(255,255,255,.08);border-radius:10px;text-align:center;font-size:1.3rem;font-weight:700;color:#F8FAFC;outline:none;transition:all .2s;caret-color:#2ECC71;font-family:inherit}
        .otp-box:focus{border-color:#2ECC71;box-shadow:0 0 0 3px rgba(46,204,113,.15);background:rgba(46,204,113,.05)}
        .btn{width:100%;padding:.7rem;font-weight:700;font-size:.9rem;border:none;border-radius:10px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:.5rem;min-height:44px;font-family:inherit}
        .btn-green{background:#2ECC71;color:#0F172A}
        .btn-green:hover:not(:disabled){background:#27ae60;box-shadow:0 4px 20px rgba(46,204,113,.35);transform:translateY(-1px)}
        .btn-green:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .btn-ghost{background:transparent;color:#64748B;font-size:.82rem}
        .btn-ghost:hover{color:#94A3B8}
        .footer{font-size:.72rem;color:#475569;text-align:center;margin-top:.5rem;line-height:1.5}
        .link{color:#2ECC71;text-decoration:none}
        .link:hover{text-decoration:underline}
        .spinner{animation:spin .8s linear infinite;display:inline-block;flex-shrink:0}
        @media(max-width:440px){.card{border-radius:16px;padding:1.5rem}.otp-box{width:40px;height:50px;font-size:1.1rem}}
      `}</style>

      <div className="page">
        <div className="bg">
          <div className="grid" />
          <div className="orb orb1" />
          <div className="orb orb2" />
        </div>

        <main className="card">
          {/* Brand */}
          <div className="brand">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="18" fill="#2ECC71" opacity=".15"/>
              <path d="M18 6s-10 8-10 15c0 5.5 4.5 10 10 10s10-4.5 10-10C28 14 18 6 18 6z" fill="#2ECC71" opacity=".9"/>
              <circle cx="18" cy="21" r="4" fill="#0F172A"/>
              <circle cx="18" cy="21" r="2" fill="#2ECC71"/>
            </svg>
            <div>
              <div className="brand-name">EcoLens</div>
              <div className="brand-tag">Amravati Civic Platform</div>
            </div>
          </div>

          <h2 className="h2">
            {step === "otp" ? "Enter verification code" : isSignUp ? "Create account" : "Welcome back"}
          </h2>
          <p className="sub">
            {step === "otp"
              ? `Sent to your ${mode === "phone_otp" ? "phone" : "email"}`
              : "Report civic issues · Earn Swacchata Coins"}
          </p>

          {/* Tabs */}
          {step === "credentials" && (
            <div className="tabs">
              {TABS.map(t => (
                <button key={t.id} className={`tab${mode === t.id ? " on" : ""}`}
                  onClick={() => { setMode(t.id); clear(); }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          )}

          {error && <div className="alert err"><span>⚠️</span>{error}</div>}
          {info  && <div className="alert ok"><span>✅</span>{info}</div>}

          {/* Email + Password form */}
          {step === "credentials" && mode === "email_password" && (
            <form className="form" onSubmit={handleEmailPassword} noValidate>
              {isSignUp && (
                <div className="field">
                  <label className="label">Full Name</label>
                  <input className="input" type="text" placeholder="Rajesh Kumar"
                    value={fullName} onChange={e => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="field">
                <label className="label">Email address</label>
                <input className="input" type="email" placeholder="you@example.com"
                  autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Password</label>
                <input className="input" type="password" placeholder="••••••••"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              </div>
              <button className="btn btn-green" type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : isSignUp ? "Create Account" : "Sign In"}
              </button>
              <button type="button" className="btn btn-ghost"
                onClick={() => { setIsSignUp(s => !s); clear(); }}>
                {isSignUp ? "Already have an account? Sign in" : "New to EcoLens? Create account"}
              </button>
            </form>
          )}

          {/* OTP request form */}
          {step === "credentials" && (mode === "email_otp" || mode === "phone_otp") && (
            <form className="form" onSubmit={handleSendOtp} noValidate>
              {mode === "email_otp" ? (
                <div className="field">
                  <label className="label">Email address</label>
                  <input className="input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              ) : (
                <div className="field">
                  <label className="label">Mobile number</label>
                  <div className="phone-row">
                    <span className="prefix">🇮🇳 +91</span>
                    <input className="input" type="tel" placeholder="9876543210"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      required pattern="[0-9]{10}" />
                  </div>
                </div>
              )}
              <button className="btn btn-green" type="submit" disabled={isPending}>
                {isPending ? <Spinner /> : "Send OTP"}
              </button>
            </form>
          )}

          {/* OTP verification form */}
          {step === "otp" && (
            <form className="form" onSubmit={handleVerifyOtp} noValidate>
              <div className="otp-group">
                {otp.map((d, i) => (
                  <input key={i} ref={el => { otpRefs.current[i] = el; }}
                    className="otp-box" type="text" inputMode="numeric"
                    maxLength={1} value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`} autoComplete="one-time-code" />
                ))}
              </div>
              <button className="btn btn-green" type="submit"
                disabled={isPending || otpValue.length !== 6}>
                {isPending ? <Spinner /> : "Verify & Continue"}
              </button>
              <button type="button" className="btn btn-ghost"
                onClick={() => { setStep("credentials"); setOtp(["","","","","",""]); clear(); }}>
                ← Back
              </button>
            </form>
          )}

          <p className="footer">
            By continuing you agree to{" "}
            <a href="#" className="link">AMC Terms of Service</a>
          </p>
        </main>
      </div>
    </>
  );
}

function Spinner() {
  return (
    <svg className="spinner" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2.5" strokeOpacity=".25"/>
      <path d="M9 2a7 7 0 0 1 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
