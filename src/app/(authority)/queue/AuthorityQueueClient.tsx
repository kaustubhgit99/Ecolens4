"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplaintRow, UserRow, DepartmentRow } from "@/lib/supabase/database.types";

type QueueComplaint = Pick<ComplaintRow,
  "id"|"title"|"description"|"status"|"ai_priority"|"ai_category"|"ai_department"|
  "ai_confidence"|"address"|"ward"|"department"|"created_at"|"resolved_at"|"citizen_id"
>;
type QueueProfile = Pick<UserRow,"id"|"full_name"|"role"|"department"|"ward">;
type QueueDept = Pick<DepartmentRow,"id"|"name"|"code"|"active">;

const STATUS_CFG = {
  pending:       { label:"Pending",      c:"#94A3B8", bg:"rgba(148,163,184,.1)" },
  ai_processing: { label:"AI Processing",c:"#A78BFA", bg:"rgba(139,92,246,.1)"  },
  rejected_spam: { label:"Rejected",     c:"#FCA5A5", bg:"rgba(239,68,68,.1)"   },
  merged:        { label:"Merged",       c:"#FCD34D", bg:"rgba(245,158,11,.1)"  },
  routed:        { label:"Routed",       c:"#86EFAC", bg:"rgba(46,204,113,.1)"  },
  in_progress:   { label:"In Progress",  c:"#FCD34D", bg:"rgba(245,158,11,.12)" },
  resolved:      { label:"Resolved",     c:"#6EE7B7", bg:"rgba(16,185,129,.12)" },
} as const;

const PRI_CFG = {
  High:   { c:"#FCA5A5", dot:"#EF4444", bg:"rgba(239,68,68,.12)"   },
  Medium: { c:"#FCD34D", dot:"#F59E0B", bg:"rgba(245,158,11,.12)"  },
  Low:    { c:"#93C5FD", dot:"#3B82F6", bg:"rgba(59,130,246,.12)"  },
} as const;

const GREEN = "#2ECC71";

export default function AuthorityQueueClient({
  profile, complaints: initial, departments,
}: {
  profile: QueueProfile;
  complaints: QueueComplaint[];
  departments: QueueDept[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTx] = useTransition();

  const [complaints, setComplaints] = useState<QueueComplaint[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterDept,     setFilterDept]     = useState("All");
  const [search,         setSearch]         = useState("");
  const [sortBy,         setSortBy]         = useState<"created_at"|"priority">("priority");
  const [toast,          setToast]          = useState<string | null>(null);
  const [loggingOut,     setLoggingOut]     = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    startTx(async () => {
      const body: Record<string, string> = { status };
      if (notes) body.resolution_notes = notes;

      const res = await fetch(`/api/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const { data } = await res.json();
        setComplaints(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
        showToast(status === "resolved" ? "✅ Marked as resolved!" : "✅ Status updated");
        if (status === "resolved") setSelectedId(null);
      } else {
        const { error } = await res.json();
        showToast(`❌ ${error}`);
      }
    });
  };

  const PRI_ORDER = { High: 0, Medium: 1, Low: 2 } as const;

  const filtered = useMemo(() => {
    let d = [...complaints];
    if (filterPriority !== "All") d = d.filter(c => c.ai_priority === filterPriority);
    if (filterStatus   !== "All") d = d.filter(c => c.status === filterStatus);
    if (filterDept     !== "All") d = d.filter(c => c.department === filterDept || c.ai_department === filterDept);
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(c =>
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.ward ?? "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "priority") {
      d.sort((a, b) => {
        const pa = a.ai_priority ? PRI_ORDER[a.ai_priority as keyof typeof PRI_ORDER] ?? 3 : 3;
        const pb = b.ai_priority ? PRI_ORDER[b.ai_priority as keyof typeof PRI_ORDER] ?? 3 : 3;
        return pa - pb;
      });
    } else {
      d.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return d;
  }, [complaints, filterPriority, filterStatus, filterDept, search, sortBy]);

  const stats = {
    total:      complaints.length,
    high:       complaints.filter(c => c.ai_priority === "High" && c.status !== "resolved").length,
    active:     complaints.filter(c => c.status === "in_progress").length,
    resolved:   complaints.filter(c => c.status === "resolved").length,
  };

  const selected = selectedId ? complaints.find(c => c.id === selectedId) ?? null : null;

  const timeAgo = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return `${Math.floor((Date.now() - new Date(iso).getTime()) / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="aq">
        {/* Toast */}
        {toast && <div className="toast">{toast}</div>}

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="s-brand">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="18" fill={GREEN} opacity=".15"/>
              <path d="M18 6s-10 8-10 15c0 5.5 4.5 10 10 10s10-4.5 10-10C28 14 18 6 18 6z" fill={GREEN} opacity=".9"/>
              <circle cx="18" cy="21" r="4" fill="#0F172A"/><circle cx="18" cy="21" r="2" fill={GREEN}/>
            </svg>
            <div>
              <div className="s-name">EcoLens</div>
              <div className="s-role">Authority Panel</div>
            </div>
          </div>
          <nav className="s-nav">
            {[
              { icon:"📋", label:"Complaint Queue", active:true  },
              { icon:"🗺️", label:"Heatmap",          active:false },
              { icon:"📊", label:"Analytics",        active:false },
              { icon:"📁", label:"History",          active:false },
            ].map(item => (
              <div key={item.label} className={`nav-item${item.active ? " nav-on" : ""}`}>
                <span>{item.icon}</span><span>{item.label}</span>
              </div>
            ))}
          </nav>
          <div className="s-dept">
            <div className="s-dept-label">DEPARTMENT</div>
            <div className="s-dept-chip">🏛️ {profile.department ?? "All Departments"}</div>
          </div>
          <div className="s-user">
            <div className="s-avatar">{profile.full_name.slice(0,2).toUpperCase()}</div>
            <div>
              <div className="s-uname">{profile.full_name}</div>
              <div className="s-urole">{profile.role}</div>
            </div>
            <button className="logout-sm" onClick={handleLogout} disabled={loggingOut} title="Sign out">⏻</button>
          </div>
        </aside>

        {/* Main */}
        <div className="aq-body">
          <header className="topbar">
            <div>
              <h1 className="tb-title">Complaint Queue</h1>
              <p className="tb-sub">Amravati · {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
            </div>
            {stats.high > 0 && (
              <div className="hi-badge">🔴 {stats.high} High Priority</div>
            )}
          </header>

          {/* Stats */}
          <div className="stat-strip">
            {[
              { label:"Total",         val:stats.total,    color:"#94A3B8", icon:"📋" },
              { label:"High Priority", val:stats.high,     color:"#EF4444", icon:"🔴" },
              { label:"In Progress",   val:stats.active,   color:"#F59E0B", icon:"⏳" },
              { label:"Resolved",      val:stats.resolved, color:GREEN,     icon:"✅" },
            ].map(s => (
              <div className="stat-card" key={s.label}>
                <span className="stat-icon">{s.icon}</span>
                <div>
                  <div className="stat-val" style={{ color:s.color }}>{s.val}</div>
                  <div className="stat-lbl">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="filter-bar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input className="search-inp" type="search" placeholder="Search complaints…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="filter-chips">
              <select className="fsel" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="All">All Priorities</option>
                {["High","Medium","Low"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="fsel" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="fsel" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="All">All Depts</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <select className="fsel" value={sortBy} onChange={e => setSortBy(e.target.value as "created_at"|"priority")}>
                <option value="priority">Sort: Priority</option>
                <option value="created_at">Sort: Newest</option>
              </select>
            </div>
          </div>

          <div className="result-row">
            Showing <strong>{filtered.length}</strong> of {complaints.length}
            {(filterPriority!=="All"||filterStatus!=="All"||filterDept!=="All"||search) && (
              <button className="clear-btn" onClick={() => { setFilterPriority("All"); setFilterStatus("All"); setFilterDept("All"); setSearch(""); }}>Clear</button>
            )}
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Priority</th><th>Complaint</th><th className="hide-sm">Dept</th>
                  <th>Status</th><th className="hide-md">Confidence</th>
                  <th className="hide-sm">When</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="empty-row">🔍 No complaints match filters.</td></tr>
                ) : filtered.map(c => {
                  const sc = STATUS_CFG[c.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                  const pc = c.ai_priority ? PRI_CFG[c.ai_priority as keyof typeof PRI_CFG] : null;
                  const isSel = selectedId === c.id;
                  return (
                    <tr key={c.id} className={`crow${isSel ? " crow-sel" : ""}`}
                      style={{"--pc": pc?.dot ?? "#334155"} as React.CSSProperties}
                      onClick={() => setSelectedId(isSel ? null : c.id)}
                      tabIndex={0} onKeyDown={e => e.key==="Enter" && setSelectedId(isSel ? null : c.id)}>
                      <td>
                        {pc ? (
                          <span className="pill" style={{ color:pc.c, background:pc.bg }}>
                            <span className="dot" style={{ background:pc.dot }} />{c.ai_priority}
                          </span>
                        ) : <span style={{ color:"#475569", fontSize:".72rem" }}>—</span>}
                      </td>
                      <td>
                        <div className="c-title">{c.title ?? c.description?.slice(0,55) ?? "Untitled"}</div>
                        <div className="c-sub">{c.ai_category ?? "—"}{c.address ? ` · ${c.address.split(",")[0]}` : ""}</div>
                      </td>
                      <td className="hide-sm">
                        <span style={{ fontSize:".72rem", color:"#64748B" }}>
                          {c.department ?? c.ai_department ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className="pill" style={{ color:sc.c, background:sc.bg }}>{sc.label}</span>
                      </td>
                      <td className="hide-md">
                        {c.ai_confidence != null ? (
                          <div className="conf-wrap">
                            <div className="conf-bar" style={{ width:`${Math.round(c.ai_confidence*100)}%` }} />
                            <span className="conf-lbl">{Math.round(c.ai_confidence*100)}%</span>
                          </div>
                        ) : <span style={{ color:"#334155", fontSize:".72rem" }}>—</span>}
                      </td>
                      <td className="hide-sm">
                        <span style={{ fontSize:".7rem", color:"#475569", fontFamily:"monospace" }}>{timeAgo(c.created_at)}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="act-grp">
                          {c.status !== "in_progress" && c.status !== "resolved" && (
                            <button className="act-btn act-prog" disabled={isPending}
                              onClick={() => updateStatus(c.id, "in_progress")}>
                              Start
                            </button>
                          )}
                          {c.status !== "resolved" && (
                            <button className="act-btn act-res" disabled={isPending}
                              onClick={() => updateStatus(c.id, "resolved")}>
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <aside className="detail-panel">
            <div className="dp-head">
              <span className="dp-title">Details</span>
              <button className="dp-close" onClick={() => setSelectedId(null)}>✕</button>
            </div>
            <div className="dp-body">
              <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap", marginBottom:".75rem" }}>
                {selected.ai_priority && (() => {
                  const pc = PRI_CFG[selected.ai_priority as keyof typeof PRI_CFG];
                  return <span className="pill" style={{ color:pc.c, background:pc.bg }}><span className="dot" style={{ background:pc.dot }}/>{selected.ai_priority}</span>;
                })()}
                {(() => {
                  const sc = STATUS_CFG[selected.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                  return <span className="pill" style={{ color:sc.c, background:sc.bg }}>{sc.label}</span>;
                })()}
              </div>
              <div className="dp-complaint-title">{selected.title ?? "Untitled Complaint"}</div>
              <div className="dp-id">ID: <code>{selected.id.slice(0,8).toUpperCase()}</code></div>
              {[
                { icon:"📝", label:"Description", val: selected.description ?? "—" },
                { icon:"📍", label:"Address",     val: selected.address ?? "—" },
                { icon:"🏘️", label:"Ward",        val: selected.ward ?? "—" },
                { icon:"🏛️", label:"Department",  val: selected.department ?? selected.ai_department ?? "—" },
                { icon:"🤖", label:"AI Category", val: selected.ai_category ?? "—" },
                { icon:"🕐", label:"Submitted",   val: new Date(selected.created_at).toLocaleString("en-IN") },
              ].map(r => (
                <div className="dp-row" key={r.label}>
                  <span className="dp-icon">{r.icon}</span>
                  <div>
                    <div className="dp-lbl">{r.label}</div>
                    <div className="dp-val">{r.val}</div>
                  </div>
                </div>
              ))}
              {selected.ai_confidence != null && (
                <div className="dp-row">
                  <span className="dp-icon">🧠</span>
                  <div style={{ flex:1 }}>
                    <div className="dp-lbl">AI Confidence</div>
                    <div className="conf-wrap" style={{ marginTop:"4px" }}>
                      <div className="conf-bar" style={{ width:`${Math.round(selected.ai_confidence*100)}%` }} />
                      <span className="conf-lbl">{Math.round(selected.ai_confidence*100)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {selected.status !== "resolved" && (
              <div className="dp-actions">
                {selected.status !== "in_progress" && (
                  <button className="dp-btn dp-prog" disabled={isPending}
                    onClick={() => updateStatus(selected.id, "in_progress")}>
                    ⏳ Mark In Progress
                  </button>
                )}
                <button className="dp-btn dp-res" disabled={isPending}
                  onClick={() => updateStatus(selected.id, "resolved")}>
                  ✅ Mark Resolved
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap');
  @keyframes toastIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0F172A;color:#F8FAFC;font-family:'DM Sans',sans-serif}
  .aq{min-height:100vh;display:flex;background:#0F172A;position:relative}
  .toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:rgba(30,41,59,.97);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.6rem 1.25rem;font-size:.82rem;color:#F8FAFC;z-index:100;animation:toastIn .2s ease;box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:nowrap}
  .sidebar{width:220px;flex-shrink:0;background:rgba(15,23,42,.98);border-right:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
  .s-brand{display:flex;align-items:center;gap:.65rem;padding:1.25rem 1rem;border-bottom:1px solid rgba(255,255,255,.05)}
  .s-name{font-size:.95rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
  .s-role{font-size:.65rem;color:${GREEN};text-transform:uppercase;letter-spacing:.1em}
  .s-nav{padding:.75rem .5rem;flex:1;display:flex;flex-direction:column;gap:2px}
  .nav-item{display:flex;align-items:center;gap:.6rem;padding:.55rem .75rem;border-radius:8px;color:#64748B;font-size:.82rem;font-weight:500;cursor:pointer;transition:all .2s}
  .nav-item:hover{background:rgba(255,255,255,.05);color:#94A3B8}
  .nav-on{background:rgba(46,204,113,.1);color:${GREEN};box-shadow:inset 3px 0 0 ${GREEN}}
  .s-dept{padding:.75rem 1rem;border-top:1px solid rgba(255,255,255,.05)}
  .s-dept-label{font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.35rem}
  .s-dept-chip{display:inline-flex;align-items:center;gap:.35rem;background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.2);color:${GREEN};border-radius:20px;padding:.3rem .65rem;font-size:.75rem;font-weight:600}
  .s-user{display:flex;align-items:center;gap:.6rem;padding:.85rem 1rem;border-top:1px solid rgba(255,255,255,.05)}
  .s-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${GREEN},#0EA5E9);color:#0F172A;font-weight:700;font-size:.72rem;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .s-uname{font-size:.78rem;font-weight:600;color:#F8FAFC}
  .s-urole{font-size:.62rem;color:#475569;text-transform:capitalize}
  .logout-sm{margin-left:auto;background:none;border:none;color:#475569;cursor:pointer;font-size:.9rem;padding:4px;transition:color .2s;flex-shrink:0}
  .logout-sm:hover{color:#FCA5A5}
  .aq-body{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(15,23,42,.9);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
  .tb-title{font-size:1.1rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
  .tb-sub{font-size:.7rem;color:#475569;font-family:'IBM Plex Mono',monospace}
  .hi-badge{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#FCA5A5;border-radius:20px;padding:.3rem .75rem;font-size:.75rem;font-weight:700}
  .stat-strip{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid rgba(255,255,255,.05)}
  .stat-card{display:flex;align-items:center;gap:.65rem;padding:.85rem 1.25rem;border-right:1px solid rgba(255,255,255,.04);transition:background .2s}
  .stat-card:hover{background:rgba(255,255,255,.02)}
  .stat-icon{font-size:1.2rem}
  .stat-val{font-size:1.35rem;font-weight:700;font-family:'IBM Plex Mono',monospace;line-height:1}
  .stat-lbl{font-size:.65rem;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
  .filter-bar{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;padding:.85rem 1.25rem;border-bottom:1px solid rgba(255,255,255,.04);background:rgba(30,41,59,.4)}
  .search-wrap{position:relative;flex:1;min-width:160px}
  .search-icon{position:absolute;left:.7rem;top:50%;transform:translateY(-50%);font-size:.78rem;pointer-events:none}
  .search-inp{width:100%;background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:.5rem .75rem .5rem 2rem;color:#F8FAFC;font-size:.82rem;font-family:inherit;outline:none;transition:border-color .2s}
  .search-inp::placeholder{color:#334155}
  .search-inp:focus{border-color:rgba(46,204,113,.35)}
  .filter-chips{display:flex;gap:.5rem;flex-wrap:wrap}
  .fsel{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);color:#94A3B8;border-radius:7px;padding:.45rem .65rem;font-size:.76rem;font-family:inherit;outline:none;cursor:pointer}
  .fsel:focus{border-color:rgba(46,204,113,.35)}
  .result-row{padding:.5rem 1.25rem;font-size:.75rem;color:#475569;display:flex;align-items:center;gap:.5rem}
  .result-row strong{color:#94A3B8}
  .clear-btn{background:none;border:none;color:${GREEN};font-size:.75rem;cursor:pointer;text-decoration:underline;font-family:inherit}
  .table-wrap{flex:1;overflow-x:auto}
  .tbl{width:100%;border-collapse:collapse;font-size:.82rem}
  .tbl thead tr{background:rgba(30,41,59,.6);border-bottom:1px solid rgba(255,255,255,.06)}
  .tbl th{padding:.65rem 1rem;text-align:left;font-size:.66rem;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap}
  .crow{border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .15s;position:relative}
  .crow::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc,transparent);opacity:0;transition:opacity .2s}
  .crow:hover{background:rgba(255,255,255,.025)}
  .crow:hover::before,.crow-sel::before{opacity:1}
  .crow-sel{background:rgba(46,204,113,.04) !important}
  .crow-sel::before{background:${GREEN} !important;opacity:1 !important}
  .tbl td{padding:.75rem 1rem;vertical-align:middle}
  .pill{display:inline-flex;align-items:center;gap:.3rem;border-radius:20px;padding:.2rem .6rem;font-size:.7rem;font-weight:700;white-space:nowrap}
  .dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
  .c-title{font-size:.84rem;font-weight:600;color:#F8FAFC;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
  .c-sub{font-size:.7rem;color:#475569;margin-top:2px}
  .conf-wrap{display:flex;align-items:center;gap:.4rem;background:rgba(255,255,255,.05);border-radius:99px;height:6px;width:80px;position:relative;overflow:visible}
  .conf-bar{height:100%;background:linear-gradient(90deg,${GREEN},#0EA5E9);border-radius:99px;transition:width .5s ease}
  .conf-lbl{position:absolute;right:-28px;font-size:.65rem;color:#64748B;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
  .act-grp{display:flex;gap:.35rem}
  .act-btn{padding:.28rem .6rem;border-radius:6px;font-size:.7rem;font-weight:600;border:1px solid;cursor:pointer;transition:all .2s;font-family:inherit}
  .act-prog{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.25);color:#FCD34D}
  .act-prog:hover:not(:disabled){background:rgba(245,158,11,.15)}
  .act-res{background:rgba(46,204,113,.08);border-color:rgba(46,204,113,.25);color:${GREEN}}
  .act-res:hover:not(:disabled){background:rgba(46,204,113,.15)}
  .act-btn:disabled{opacity:.4;cursor:not-allowed}
  .empty-row{text-align:center;padding:3rem;color:#475569;font-size:.85rem}
  .detail-panel{width:290px;flex-shrink:0;background:rgba(15,23,42,.98);border-left:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
  .dp-head{display:flex;align-items:center;justify-content:space-between;padding:1rem;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;background:rgba(15,23,42,.98);z-index:1}
  .dp-title{font-size:.85rem;font-weight:700;color:#F8FAFC}
  .dp-close{background:rgba(255,255,255,.06);border:none;color:#64748B;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:.72rem;display:flex;align-items:center;justify-content:center;transition:all .2s;font-family:inherit}
  .dp-close:hover{background:rgba(255,255,255,.1);color:#F8FAFC}
  .dp-body{padding:.85rem;display:flex;flex-direction:column;gap:.65rem;flex:1}
  .dp-complaint-title{font-size:.9rem;font-weight:700;color:#F8FAFC;line-height:1.4}
  .dp-id{font-size:.68rem;color:#334155;font-family:'IBM Plex Mono',monospace}
  .dp-id code{color:#475569}
  .dp-row{display:flex;gap:.55rem;align-items:flex-start}
  .dp-icon{font-size:.88rem;flex-shrink:0;margin-top:1px}
  .dp-lbl{font-size:.62rem;color:#475569;text-transform:uppercase;letter-spacing:.06em}
  .dp-val{font-size:.78rem;color:#94A3B8;line-height:1.45;margin-top:1px}
  .dp-actions{padding:.85rem;border-top:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:.4rem;position:sticky;bottom:0;background:rgba(15,23,42,.98)}
  .dp-btn{width:100%;padding:.55rem;border-radius:8px;font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer;transition:all .2s;border:1px solid}
  .dp-btn:disabled{opacity:.4;cursor:not-allowed}
  .dp-prog{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.25);color:#FCD34D}
  .dp-prog:hover:not(:disabled){background:rgba(245,158,11,.14)}
  .dp-res{background:rgba(46,204,113,.1);border-color:rgba(46,204,113,.3);color:${GREEN}}
  .dp-res:hover:not(:disabled){background:rgba(46,204,113,.18)}
  @media(max-width:1100px){.detail-panel{display:none}}
  @media(max-width:900px){.stat-strip{grid-template-columns:repeat(2,1fr)}.hide-md{display:none !important}}
  @media(max-width:680px){.sidebar{display:none}.hide-sm{display:none !important}.stat-strip{grid-template-columns:repeat(2,1fr)}}
`;
