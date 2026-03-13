"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplaintRow, UserRow } from "@/lib/supabase/database.types";

type DashProfile = Pick<UserRow, "id" | "full_name" | "role" | "coins_total" | "coins_month" | "ward">;
type DashComplaint = Pick<ComplaintRow,
  "id"|"title"|"description"|"status"|"ai_priority"|"ai_category"|"address"|"created_at"|"resolved_at"|"image_url"|"department"
>;

const STATUS_CFG = {
  pending:       { label: "Pending",      color: "#94A3B8", bg: "rgba(148,163,184,.1)" },
  ai_processing: { label: "AI Processing",color: "#A78BFA", bg: "rgba(139,92,246,.1)"  },
  rejected_spam: { label: "Rejected",     color: "#FCA5A5", bg: "rgba(239,68,68,.1)"   },
  merged:        { label: "Merged",       color: "#FCD34D", bg: "rgba(245,158,11,.1)"  },
  routed:        { label: "Routed",       color: "#86EFAC", bg: "rgba(46,204,113,.1)"  },
  in_progress:   { label: "In Progress",  color: "#FCD34D", bg: "rgba(245,158,11,.12)" },
  resolved:      { label: "Resolved",     color: "#6EE7B7", bg: "rgba(16,185,129,.12)" },
} as const;

const PRIORITY_CFG = {
  High:   { color: "#FCA5A5", dot: "#EF4444" },
  Medium: { color: "#FCD34D", dot: "#F59E0B" },
  Low:    { color: "#93C5FD", dot: "#3B82F6" },
} as const;

export default function CitizenDashboardClient({
  profile, complaints, unreadCount,
}: {
  profile: DashProfile;
  complaints: DashComplaint[];
  unreadCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "in_progress" | "resolved">("all");

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const filtered = activeTab === "all"
    ? complaints
    : complaints.filter(c =>
        activeTab === "in_progress"
          ? (c.status === "in_progress" || c.status === "routed" || c.status === "ai_processing")
          : c.status === activeTab
      );

  const stats = {
    total:      complaints.length,
    active:     complaints.filter(c => c.status === "in_progress" || c.status === "routed").length,
    resolved:   complaints.filter(c => c.status === "resolved").length,
  };

  const timeAgo = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return `${Math.floor((Date.now() - new Date(iso).getTime()) / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:#0F172A;color:#F8FAFC;font-family:'DM Sans',sans-serif;min-height:100vh}
        .page{min-height:100vh;background:#0F172A;display:flex;flex-direction:column}
        .topbar{background:rgba(15,23,42,.97);border-bottom:1px solid rgba(255,255,255,.06);padding:.85rem 1.25rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
        .brand{display:flex;align-items:center;gap:.6rem}
        .brand-dot{width:8px;height:8px;background:#2ECC71;border-radius:50%}
        .brand-name{font-size:1rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
        .topbar-right{display:flex;align-items:center;gap:.75rem}
        .notif-btn{position:relative;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#94A3B8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem}
        .notif-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;background:#EF4444;border-radius:50%;font-size:.58rem;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #0F172A}
        .logout-btn{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#FCA5A5;border-radius:8px;padding:.4rem .75rem;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
        .logout-btn:hover{background:rgba(239,68,68,.15)}
        .main{flex:1;padding:1.25rem;max-width:720px;margin:0 auto;width:100%}
        .greeting{margin-bottom:1.5rem}
        .greeting h1{font-size:1.4rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
        .greeting p{font-size:.82rem;color:#64748B;margin-top:.2rem}
        .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1.5rem}
        .stat-card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.35rem}
        .stat-label{font-size:.68rem;color:#475569;text-transform:uppercase;letter-spacing:.07em}
        .stat-val{font-size:1.5rem;font-weight:700;font-family:'IBM Plex Mono',monospace}
        .coin-card{background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:1rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between}
        .coin-left{display:flex;align-items:center;gap:.65rem}
        .coin-icon{font-size:1.8rem}
        .coin-title{font-size:.75rem;color:#94A3B8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px}
        .coin-val{font-size:1.4rem;font-weight:700;color:#FCD34D;font-family:'IBM Plex Mono',monospace}
        .coin-month{font-size:.72rem;color:#F59E0B;margin-top:2px}
        .report-btn{background:#2ECC71;color:#0F172A;font-weight:700;font-size:.88rem;border:none;border-radius:10px;padding:.65rem 1.25rem;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:.4rem;font-family:inherit}
        .report-btn:hover{background:#27ae60;box-shadow:0 4px 18px rgba(46,204,113,.35);transform:translateY(-1px)}
        .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
        .section-title{font-size:.95rem;font-weight:700;color:#F8FAFC}
        .tabs{display:flex;gap:.35rem;flex-wrap:wrap}
        .tab{padding:.35rem .75rem;border-radius:20px;border:1px solid rgba(255,255,255,.07);background:transparent;color:#64748B;font-size:.75rem;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit}
        .tab:hover{background:rgba(255,255,255,.05);color:#94A3B8}
        .tab.on{background:rgba(46,204,113,.12);border-color:rgba(46,204,113,.3);color:#2ECC71}
        .complaints-list{display:flex;flex-direction:column;gap:.65rem}
        .c-card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:1rem;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
        .c-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px}
        .c-card:hover{border-color:rgba(255,255,255,.1);background:rgba(30,41,59,.9)}
        .c-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.5rem}
        .c-title{font-size:.88rem;font-weight:600;color:#F8FAFC;line-height:1.3}
        .c-meta{font-size:.72rem;color:#475569;margin-top:.25rem;display:flex;gap:.5rem;flex-wrap:wrap}
        .pill{display:inline-flex;align-items:center;gap:.3rem;border-radius:20px;padding:.18rem .55rem;font-size:.7rem;font-weight:700}
        .dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
        .c-desc{font-size:.78rem;color:#64748B;line-height:1.5;margin-top:.35rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .empty{text-align:center;padding:3rem 1rem;color:#475569}
        .empty-icon{font-size:2.5rem;margin-bottom:.75rem}
        .fab{position:fixed;bottom:1.5rem;right:1.5rem;width:56px;height:56px;border-radius:50%;background:#2ECC71;color:#0F172A;border:none;cursor:pointer;font-size:1.5rem;box-shadow:0 4px 24px rgba(46,204,113,.4);display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:20}
        .fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(46,204,113,.5)}
        @media(max-width:480px){.stat-grid{grid-template-columns:repeat(2,1fr)}.coin-card{flex-direction:column;align-items:flex-start;gap:.75rem}}
      `}</style>

      <div className="page">
        <header className="topbar">
          <div className="brand">
            <div className="brand-dot" />
            <span className="brand-name">EcoLens</span>
          </div>
          <div className="topbar-right">
            {unreadCount > 0 && (
              <button className="notif-btn" aria-label="Notifications">
                🔔 <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
              </button>
            )}
            <button className="logout-btn" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "…" : "Sign out"}
            </button>
          </div>
        </header>

        <main className="main">
          {/* Greeting */}
          <div className="greeting">
            <h1>Hello, {profile.full_name.split(" ")[0]} 👋</h1>
            <p>Amravati Civic Platform · {profile.ward ?? "Amravati"}</p>
          </div>

          {/* Stats */}
          <div className="stat-grid">
            {[
              { label: "Total Reports", val: stats.total,    color: "#94A3B8" },
              { label: "Active",        val: stats.active,   color: "#FCD34D" },
              { label: "Resolved",      val: stats.resolved, color: "#2ECC71" },
            ].map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Coins */}
          <div className="coin-card">
            <div className="coin-left">
              <div className="coin-icon">🪙</div>
              <div>
                <div className="coin-title">Swacchata Coins</div>
                <div className="coin-val">{profile.coins_total.toLocaleString()}</div>
                <div className="coin-month">+{profile.coins_month} this month</div>
              </div>
            </div>
            <button className="report-btn" onClick={() => router.push("/report")}>
              + Report Issue
            </button>
          </div>

          {/* Complaints */}
          <div className="section-header">
            <div className="section-title">My Complaints</div>
            <div className="tabs">
              {(["all","pending","in_progress","resolved"] as const).map(t => (
                <button key={t} className={`tab${activeTab === t ? " on" : ""}`}
                  onClick={() => setActiveTab(t)}>
                  {t === "all" ? "All" : t === "in_progress" ? "Active" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="complaints-list">
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <p>{activeTab === "all" ? "No complaints yet." : "No complaints in this category."}</p>
              </div>
            ) : (
              filtered.map(c => {
                const sc = STATUS_CFG[c.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                const pc = c.ai_priority ? PRIORITY_CFG[c.ai_priority as keyof typeof PRIORITY_CFG] : null;
                return (
                  <div key={c.id} className="c-card"
                    style={{ "--bc": pc?.dot ?? "#334155" } as React.CSSProperties}
                    onClick={() => router.push(`/complaints/${c.id}`)}>
                    <div className="c-top">
                      <div>
                        <div className="c-title">{c.title ?? c.description?.slice(0, 60) ?? "Untitled"}</div>
                        <div className="c-meta">
                          <span>{c.ai_category ?? "Uncategorised"}</span>
                          {c.address && <span>· {c.address.split(",")[0]}</span>}
                          <span>· {timeAgo(c.created_at)}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:".3rem", alignItems:"flex-end" }}>
                        <span className="pill" style={{ color: sc.color, background: sc.bg }}>
                          {sc.label}
                        </span>
                        {pc && (
                          <span className="pill" style={{ color: pc.color, background: "rgba(0,0,0,.2)", border:`1px solid ${pc.dot}30` }}>
                            <span className="dot" style={{ background: pc.dot }} />{c.ai_priority}
                          </span>
                        )}
                      </div>
                    </div>
                    {c.description && <div className="c-desc">{c.description}</div>}
                  </div>
                );
              })
            )}
          </div>
        </main>

        {/* FAB */}
        <button className="fab" onClick={() => router.push("/report")} aria-label="Report new issue">
          +
        </button>
      </div>
    </>
  );
}
