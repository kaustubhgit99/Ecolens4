"use client";

import React, { useState, useRef, useCallback, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  address: string;
  loading: boolean;
  error: string | null;
}

const GREEN = "#2ECC71";
const STEPS = [
  { n: 1, label: "Photo"    },
  { n: 2, label: "Details"  },
  { n: 3, label: "Submit"   },
];

export default function ReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTx] = useTransition();
  const [step, setStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const fileRef   = useRef<HTMLInputElement>(null);
  const camRef    = useRef<HTMLInputElement>(null);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null);
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationState>({
    latitude: null, longitude: null, address: "", loading: false, error: null,
  });

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return alert("Please select an image.");
    if (file.size > 10 * 1024 * 1024) return alert("Image must be under 10 MB.");
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = e => {
      setImageBase64(e.target?.result as string);
      setImageFile(file);
      setPreviewUrl(url);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocation(l => ({ ...l, error: "Geolocation not supported." }));
      return;
    }
    setLocation(l => ({ ...l, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          if (res.ok) { const d = await res.json(); address = d.display_name ?? address; }
        } catch { /* use coordinate fallback */ }
        setLocation({ latitude, longitude, address, loading: false, error: null });
      },
      err => setLocation(l => ({
        ...l, loading: false,
        error: err.code === 1 ? "Location access denied. Allow in browser settings." : "Could not get location.",
      })),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const canProceed = () => {
    if (step === 1) return !!imageBase64;
    if (step === 2) return !!description.trim() && location.latitude !== null;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    startTx(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }

        let image_url: string | null = null;
        if (imageFile) {
          const path = `${user.id}/${Date.now()}_${imageFile.name.replace(/\s/g, "_")}`;
          const { error: upErr } = await supabase.storage
            .from("complaint-images")
            .upload(path, imageFile, { upsert: false });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from("complaint-images").getPublicUrl(path);
          image_url = urlData.publicUrl;
        }

        const { data: complaint, error: insertErr } = await supabase
          .from("complaints")
          .insert({
            citizen_id:  user.id,
            title:       title.trim() || null,
            description: description.trim(),
            image_url,
            latitude:    location.latitude!,
            longitude:   location.longitude!,
            address:     location.address || null,
            status:      "pending",
            ai_is_spam:      false,
            ai_is_duplicate: false,
            coins_awarded:   false,
            ai_objects:      [],
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        setSuccessId(complaint.id);
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
      }
    });
  };

  if (successId) return <SuccessScreen id={successId}
    onDashboard={() => router.push("/dashboard")}
    onAnother={() => { setSuccessId(null); setStep(1); setImageBase64(null); setImageFile(null); setPreviewUrl(null); setTitle(""); setDescription(""); setLocation({ latitude:null, longitude:null, address:"", loading:false, error:null }); }} />;

  return (
    <>
      <style>{CSS}</style>
      <div className="rp">
        {/* Header */}
        <header className="rp-head">
          <div className="rp-head-top">
            <button className="back" onClick={() => router.push("/dashboard")}>←</button>
            <div>
              <div className="rp-title">Report an Issue</div>
              <div className="rp-sub">EcoLens · Amravati</div>
            </div>
          </div>
          {/* Progress */}
          <div className="progress-track">
            {STEPS.map((s, i) => (
              <div key={s.n} className={`p-item${step === s.n ? " p-active" : step > s.n ? " p-done" : ""}`}>
                <div className="p-bubble">{step > s.n ? "✓" : s.n}</div>
                <span className="p-label">{s.label}</span>
                {i < STEPS.length - 1 && <div className="p-line" />}
              </div>
            ))}
          </div>
        </header>

        <main className="rp-main">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="step-panel">
              <div className="step-h"><span className="step-em">📷</span>
                <div><h2>Capture the Issue</h2><p>Take a photo or upload from gallery</p></div>
              </div>
              {!previewUrl ? (
                <div className="dropzone" tabIndex={0} role="button"
                  onClick={() => fileRef.current?.click()}
                  onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                  onKeyDown={e => e.key === "Enter" && fileRef.current?.click()}>
                  <div style={{ fontSize:"2.5rem", marginBottom:".5rem" }}>🌿</div>
                  <div className="dz-title">Drop photo here</div>
                  <div className="dz-sub">or tap to browse · max 10 MB</div>
                  <div className="dz-or">or</div>
                  <button className="btn-cam" type="button"
                    onClick={e => { e.stopPropagation(); camRef.current?.click(); }}>
                    📷 Open Camera
                  </button>
                </div>
              ) : (
                <div className="preview-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Preview" className="preview-img" />
                  <div className="preview-actions">
                    <button className="btn-change" onClick={() => fileRef.current?.click()}>Change</button>
                    <button className="btn-rm" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setImageBase64(null); setImageFile(null); }} aria-label="Remove">✕</button>
                  </div>
                  <div className="preview-badge">✓ Photo ready</div>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFileChange} />
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="step-panel">
              <div className="step-h"><span className="step-em">📍</span>
                <div><h2>Add Details</h2><p>Describe and confirm location</p></div>
              </div>
              <div className="field">
                <label className="lbl">Title <span className="opt">(optional)</span></label>
                <input className="inp" type="text" placeholder="e.g. Garbage near bus stop"
                  value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
              </div>
              <div className="field">
                <label className="lbl">Description <span className="req">*</span></label>
                <textarea className="inp inp-ta" rows={4} maxLength={500}
                  placeholder="Describe the issue. English, Hindi or Marathi accepted."
                  value={description} onChange={e => setDescription(e.target.value)} />
                <span className="cnt">{description.length}/500</span>
              </div>
              <div className="field">
                <label className="lbl">Location <span className="req">*</span></label>
                {location.latitude ? (
                  <div className="loc-found">
                    <span>📍</span>
                    <div className="loc-text">
                      <strong>Location captured</strong>
                      <small>{location.address || `${location.latitude.toFixed(5)}, ${location.longitude!.toFixed(5)}`}</small>
                    </div>
                    <button className="loc-retry" onClick={fetchLocation}>↻</button>
                  </div>
                ) : (
                  <>
                    <button className="btn-loc" type="button" onClick={fetchLocation} disabled={location.loading}>
                      {location.loading ? "⏳ Detecting…" : "📡 Use My Location"}
                    </button>
                    {location.error && <p className="field-err">{location.error}</p>}
                  </>
                )}
                <input className="inp" style={{ marginTop:".5rem" }} type="text"
                  placeholder="Or type address manually"
                  value={location.address}
                  onChange={e => setLocation(l => ({ ...l, address: e.target.value }))} />
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="step-panel">
              <div className="step-h"><span className="step-em">✅</span>
                <div><h2>Review & Submit</h2><p>Confirm everything looks correct</p></div>
              </div>
              <div className="summary-card">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Complaint" className="summary-img" />
                )}
                <div className="summary-rows">
                  {[
                    { icon:"📝", label:"Description", val: description },
                    ...(title ? [{ icon:"🏷️", label:"Title", val: title }] : []),
                    { icon:"📍", label:"Location", val: location.address || `${location.latitude?.toFixed(5)}, ${location.longitude?.toFixed(5)}` },
                  ].map(r => (
                    <div className="s-row" key={r.label}>
                      <span>{r.icon}</span>
                      <div><div className="s-lbl">{r.label}</div><div className="s-val">{r.val}</div></div>
                    </div>
                  ))}
                </div>
                <div className="ai-note">🤖 AI will verify and route your complaint within 60 seconds.</div>
              </div>
              {submitError && <div className="submit-err">⚠️ {submitError}</div>}
            </div>
          )}
        </main>

        {/* Footer nav */}
        <footer className="rp-foot">
          <div className="foot-inner">
            {step > 1
              ? <button className="btn-back" onClick={() => setStep(s => s - 1)} disabled={isPending}>← Back</button>
              : <div />
            }
            {step < 3
              ? <button className="btn-next" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  Continue →
                </button>
              : <button className="btn-submit" onClick={handleSubmit} disabled={isPending || !canProceed()}>
                  {isPending ? "Submitting…" : "Submit Report ✈"}
                </button>
            }
          </div>
        </footer>
      </div>
    </>
  );
}

function SuccessScreen({ id, onDashboard, onAnother }: { id: string; onDashboard: () => void; onAnother: () => void }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="success-page">
        <div className="success-card">
          <div style={{ fontSize:"3.5rem", marginBottom:"1rem" }}>🌱</div>
          <h2>Submitted!</h2>
          <p>Your complaint is received. AI verification starts shortly.</p>
          <div className="s-id"><span>ID</span><code>{id.slice(0,8).toUpperCase()}</code></div>
          <div className="coin-note">🪙 Earn Swacchata Coins once verified!</div>
          <button className="btn-next w100" style={{ marginTop:"1rem" }} onClick={onDashboard}>View My Complaints</button>
          <button className="btn-back w100" style={{ marginTop:".5rem" }} onClick={onAnother}>Report Another</button>
        </div>
      </div>
    </>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
  @keyframes stepIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:none} }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0F172A;color:#F8FAFC;font-family:'DM Sans',sans-serif}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  .rp{min-height:100vh;display:flex;flex-direction:column;background:#0F172A}
  .rp-head{background:rgba(30,41,59,.97);border-bottom:1px solid rgba(46,204,113,.12);padding:1rem 1.25rem 0;position:sticky;top:0;z-index:10}
  .rp-head-top{display:flex;align-items:center;gap:.75rem;margin-bottom:.85rem}
  .back{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#94A3B8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem}
  .back:hover{background:rgba(255,255,255,.1);color:#F8FAFC}
  .rp-title{font-size:1.05rem;font-weight:700;color:#F8FAFC;letter-spacing:-.02em}
  .rp-sub{font-size:.7rem;color:${GREEN};text-transform:uppercase;letter-spacing:.08em}
  .progress-track{display:flex;align-items:center;padding-bottom:.85rem}
  .p-item{display:flex;align-items:center;gap:.4rem;flex:1}
  .p-bubble{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.1);color:#64748B;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .3s}
  .p-active .p-bubble{background:rgba(46,204,113,.15);border-color:${GREEN};color:${GREEN};box-shadow:0 0 12px rgba(46,204,113,.3)}
  .p-done .p-bubble{background:${GREEN};border-color:${GREEN};color:#0F172A}
  .p-label{font-size:.72rem;font-weight:500;color:#475569;transition:color .3s}
  .p-active .p-label{color:${GREEN}}
  .p-done .p-label{color:#94A3B8}
  .p-line{flex:1;height:1.5px;background:rgba(255,255,255,.07);margin:0 .4rem}
  .p-done .p-line{background:rgba(46,204,113,.3)}
  .rp-main{flex:1;overflow-y:auto;padding:1.25rem}
  .step-panel{display:flex;flex-direction:column;gap:1.25rem;max-width:540px;margin:0 auto;animation:stepIn .25s ease both}
  .step-h{display:flex;align-items:flex-start;gap:.75rem}
  .step-em{font-size:1.8rem;line-height:1;margin-top:2px}
  .step-h h2{font-size:1.1rem;font-weight:700;color:#F8FAFC;margin:0 0 .2rem;letter-spacing:-.02em}
  .step-h p{font-size:.8rem;color:#64748B;margin:0}
  .dropzone{border:2px dashed rgba(46,204,113,.25);border-radius:14px;padding:2.5rem 1.5rem;text-align:center;cursor:pointer;transition:all .25s;background:rgba(46,204,113,.03);display:flex;flex-direction:column;align-items:center;gap:.5rem}
  .dropzone:hover,.dropzone:focus{border-color:rgba(46,204,113,.5);background:rgba(46,204,113,.06);outline:none}
  .dz-title{font-size:.95rem;font-weight:600;color:#F8FAFC}
  .dz-sub{font-size:.75rem;color:#475569}
  .dz-or{font-size:.7rem;color:#334155;text-transform:uppercase;letter-spacing:.1em}
  .btn-cam{display:inline-flex;align-items:center;gap:.4rem;background:rgba(46,204,113,.1);border:1px solid rgba(46,204,113,.3);color:${GREEN};border-radius:8px;padding:.45rem 1rem;font-size:.82rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
  .btn-cam:hover{background:rgba(46,204,113,.18)}
  .preview-wrap{position:relative;border-radius:12px;overflow:hidden;border:1px solid rgba(46,204,113,.2);aspect-ratio:4/3;background:#0F172A}
  .preview-img{width:100%;height:100%;object-fit:cover;display:block}
  .preview-actions{position:absolute;top:.5rem;right:.5rem;display:flex;gap:.4rem}
  .btn-change{background:rgba(15,23,42,.8);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);color:#F8FAFC;border-radius:6px;padding:.3rem .6rem;font-size:.72rem;cursor:pointer;font-family:inherit}
  .btn-rm{width:30px;height:30px;border-radius:6px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#FCA5A5;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem}
  .preview-badge{position:absolute;bottom:.6rem;left:.6rem;background:rgba(46,204,113,.9);color:#0F172A;border-radius:20px;padding:.25rem .65rem;font-size:.7rem;font-weight:700}
  .field{display:flex;flex-direction:column;gap:.4rem}
  .lbl{font-size:.78rem;font-weight:600;color:#94A3B8}
  .req{color:#EF4444}.opt{color:#475569;font-weight:400}
  .inp{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:.65rem .85rem;color:#F8FAFC;font-size:.88rem;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
  .inp::placeholder{color:#334155}
  .inp:focus{border-color:rgba(46,204,113,.45);box-shadow:0 0 0 3px rgba(46,204,113,.09)}
  .inp-ta{resize:vertical;min-height:90px;line-height:1.5}
  .cnt{font-size:.68rem;color:#334155;text-align:right}
  .field-err{font-size:.78rem;color:#FCA5A5;margin-top:.3rem}
  .btn-loc{width:100%;display:flex;align-items:center;justify-content:center;gap:.5rem;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.25);color:#38BDF8;border-radius:10px;padding:.65rem 1rem;font-size:.88rem;font-weight:600;font-family:inherit;cursor:pointer;transition:all .2s}
  .btn-loc:hover:not(:disabled){background:rgba(14,165,233,.14)}
  .btn-loc:disabled{opacity:.6;cursor:not-allowed}
  .loc-found{display:flex;align-items:flex-start;gap:.6rem;background:rgba(46,204,113,.06);border:1px solid rgba(46,204,113,.2);border-radius:10px;padding:.75rem}
  .loc-text{flex:1;display:flex;flex-direction:column;gap:.1rem}
  .loc-text strong{font-size:.82rem;color:${GREEN}}
  .loc-text small{font-size:.7rem;color:#64748B;line-height:1.4}
  .loc-retry{background:none;border:none;color:#64748B;cursor:pointer;font-size:1rem;padding:0 .25rem}
  .loc-retry:hover{color:${GREEN}}
  .summary-card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden}
  .summary-img{width:100%;max-height:200px;object-fit:cover;display:block;border-bottom:1px solid rgba(255,255,255,.06)}
  .summary-rows{padding:1rem;display:flex;flex-direction:column;gap:.75rem}
  .s-row{display:flex;gap:.6rem;align-items:flex-start}
  .s-lbl{font-size:.68rem;color:#64748B;text-transform:uppercase;letter-spacing:.06em}
  .s-val{font-size:.84rem;color:#F8FAFC;line-height:1.4;margin-top:1px}
  .ai-note{display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;background:rgba(46,204,113,.06);border-top:1px solid rgba(46,204,113,.12);font-size:.78rem;color:#86EFAC;line-height:1.5}
  .submit-err{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:.65rem .85rem;color:#FCA5A5;font-size:.82rem}
  .rp-foot{background:rgba(15,23,42,.97);border-top:1px solid rgba(255,255,255,.06);padding:.85rem 1.25rem;position:sticky;bottom:0}
  .foot-inner{display:flex;justify-content:space-between;align-items:center;max-width:540px;margin:0 auto;gap:1rem}
  .btn-back{display:flex;align-items:center;gap:.35rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#94A3B8;border-radius:10px;padding:.6rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
  .btn-back:hover:not(:disabled){background:rgba(255,255,255,.09);color:#F8FAFC}
  .btn-back:disabled{opacity:.4;cursor:not-allowed}
  .btn-next{display:flex;align-items:center;gap:.4rem;background:${GREEN};color:#0F172A;border:none;border-radius:10px;padding:.65rem 1.4rem;font-size:.88rem;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
  .btn-next:hover:not(:disabled){background:#27ae60;box-shadow:0 4px 18px rgba(46,204,113,.3);transform:translateY(-1px)}
  .btn-next:disabled{opacity:.4;cursor:not-allowed;transform:none}
  .btn-submit{display:flex;align-items:center;gap:.4rem;background:${GREEN};color:#0F172A;border:none;border-radius:10px;padding:.65rem 1.4rem;font-size:.88rem;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
  .btn-submit:hover:not(:disabled){background:#27ae60;box-shadow:0 4px 22px rgba(46,204,113,.4);transform:translateY(-1px)}
  .btn-submit:disabled{opacity:.55;cursor:not-allowed}
  .success-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F172A;padding:1.5rem}
  .success-card{width:100%;max-width:400px;text-align:center;background:rgba(30,41,59,.85);border:1px solid rgba(46,204,113,.2);border-radius:20px;padding:2rem;box-shadow:0 0 60px rgba(46,204,113,.1)}
  .success-card h2{font-size:1.4rem;font-weight:700;color:#F8FAFC;margin:0 0 .5rem;letter-spacing:-.02em}
  .success-card p{font-size:.85rem;color:#64748B;margin:0 0 1.25rem;line-height:1.6}
  .s-id{display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.06);border-radius:9px;padding:.6rem .85rem;margin-bottom:.75rem}
  .s-id span{font-size:.7rem;color:#64748B;text-transform:uppercase;letter-spacing:.06em}
  .s-id code{font-size:.85rem;color:${GREEN};font-family:monospace;font-weight:700}
  .coin-note{font-size:.8rem;color:#FCD34D;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.5rem .85rem;margin-bottom:.5rem}
  .w100{width:100%}
`;
