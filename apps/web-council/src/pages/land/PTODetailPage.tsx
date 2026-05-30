import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { getPTO, getPTOHistory, revokePTO, openPTOPDF, type PTOSummary, type PTOHistoryEntry } from "../../api/ptos.js";

const STATUS_CFG = {
  active:     { label: "Active",     cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  superseded: { label: "Superseded", cls: "bg-slate-100 text-slate-500 border-slate-200"       },
};

const TRANSFER_CFG = {
  initial:    { label: "Initial Allocation", icon: "🏠", cls: "bg-forest-50 border-forest-200 text-forest-800"  },
  transfer:   { label: "Transfer / Resale",  icon: "🔄", cls: "bg-blue-50 border-blue-200 text-blue-800"         },
  revocation: { label: "Revoked",            icon: "🚫", cls: "bg-red-50 border-red-200 text-red-800"            },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value ?? <span className="text-gray-300 italic">Not recorded</span>}</p>
    </div>
  );
}

type Tab = "details" | "history" | "verify";

export function PTODetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { auth, apiFetch } = useAuth();
  const isSenior = ["founder", "council_secretary"].includes(auth?.claims.role ?? "");

  const [pto, setPTO]         = useState<PTOSummary | null>(null);
  const [history, setHistory] = useState<PTOHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>("details");

  const [revoking, setRevoking]     = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]     = useState<string | null>(null);

  async function handleOpenPDF() {
    if (!id) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      await openPTOPDF(apiFetch, id);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not load PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getPTO(apiFetch, id),
      getPTOHistory(apiFetch, id),
    ])
      .then(([p, h]) => { setPTO(p); setHistory(h); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id, apiFetch]);

  async function handleRevoke() {
    if (!id || !revokeReason.trim()) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const updated = await revokePTO(apiFetch, id, revokeReason.trim());
      setPTO(updated);
      setShowRevoke(false);
      setRevokeReason("");
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-100" />
        <div className="h-40 rounded-2xl bg-gray-100" />
        <div className="h-60 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error || !pto) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "PTO not found."}
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CFG[pto.status];
  const payload = pto.signedPayloadJson as Record<string, unknown>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => navigate(-1)} className="hover:text-gray-600 transition-colors">
          ← Back
        </button>
        <span>/</span>
        <Link to="/dashboard/land/ptos" className="hover:text-gray-600 transition-colors">PTO Register</Link>
        <span>/</span>
        <span className="text-gray-600 font-mono">{pto.id.slice(0, 8).toUpperCase()}</span>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-forest-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCfg.cls}`}>
                  {statusCfg.label}
                </span>
                {pto.supersededByPtoId && (
                  <span className="text-xs text-forest-200 font-mono">superseded by {pto.supersededByPtoId.slice(0, 8).toUpperCase()}</span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white">{pto.residentName}</h1>
              <p className="text-sm text-forest-200 mt-0.5">{pto.standRef ? `Stand ${pto.standRef} — ` : ""}{pto.standVillage}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-forest-300 uppercase tracking-wider">Issued</p>
              <p className="text-sm font-semibold text-white mt-0.5">{formatDate(pto.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center flex-wrap gap-3 border-b border-gray-100 px-6 py-3 bg-gray-50">
          <button
            onClick={() => void handleOpenPDF()}
            disabled={pdfLoading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-forest-300 hover:text-forest-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {pdfLoading ? "Loading…" : "Download PDF"}
          </button>
          <button
            onClick={() => void handleOpenPDF()}
            disabled={pdfLoading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-forest-300 hover:text-forest-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          {pdfError && <span className="text-xs text-red-600">{pdfError}</span>}
          {isSenior && pto.status === "active" && (
            <button
              onClick={() => setShowRevoke(true)}
              className="ml-auto flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Revoke PTO
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-100 px-6">
          {(["details", "history", "verify"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-forest-600 text-forest-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {t === "history" && history.length > 1 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-600">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === "details" && (
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Occupant</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name"   value={pto.residentName} />
                  <Field label="Resident ID" value={pto.residentId.slice(0, 8).toUpperCase()} />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Land Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Address"         value={pto.standAddress} />
                  <Field label="Stand Reference" value={pto.standRef} />
                  <Field label="Village / Section" value={pto.standVillage} />
                  <Field label="Allocation Date"
                    value={typeof payload["allocationDate"] === "string" ? formatDate(payload["allocationDate"]) : null} />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Document</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="PTO Reference" value={pto.id.toUpperCase()} />
                  <Field label="Issued By"     value={pto.issuedByUserId.slice(0, 8).toUpperCase()} />
                  <Field label="Issued Date"   value={formatDate(pto.createdAt)} />
                  {pto.supersededAt && (
                    <Field label="Revoked / Superseded" value={formatDate(pto.supersededAt)} />
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Verification URL</p>
                <a
                  href={pto.verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-forest-600 hover:underline break-all"
                >
                  {pto.verificationUrl}
                </a>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">No history found.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-100" />
                  <div className="space-y-4">
                    {history.map((entry, i) => {
                      const cfg = TRANSFER_CFG[entry.transferType];
                      return (
                        <div key={entry.id} className="relative flex gap-4">
                          <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-lg ${cfg.cls}`}>
                            {cfg.icon}
                          </div>
                          <div className={`flex-1 rounded-xl border p-4 ${cfg.cls}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{cfg.label}</span>
                              <span className="text-xs opacity-60">{formatDateShort(entry.createdAt)}</span>
                            </div>
                            <p className="text-sm font-semibold">{entry.residentName}</p>
                            <p className="text-xs opacity-70 mt-0.5">{entry.standRef ?? entry.standAddress}</p>
                            {i === 0 && entry.id !== id && (
                              <Link
                                to={`/dashboard/land/ptos/${entry.id}`}
                                className="mt-2 inline-flex text-xs font-medium hover:underline opacity-70"
                              >
                                View current PTO →
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "verify" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                This PTO is cryptographically signed. The signature below can be verified against the council's public key.
              </p>
              <div className={`flex items-start gap-3 rounded-xl border p-4 ${pto.status === "active" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <svg className={`h-5 w-5 shrink-0 mt-0.5 ${pto.status === "active" ? "text-emerald-600" : "text-slate-400"}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className={`text-sm font-semibold ${pto.status === "active" ? "text-emerald-800" : "text-slate-600"}`}>
                    {pto.status === "active" ? "Valid — digitally signed by council" : "Superseded — no longer the current PTO for this stand"}
                  </p>
                  <p className={`text-xs mt-0.5 ${pto.status === "active" ? "text-emerald-600" : "text-slate-400"}`}>
                    Scan the QR code on the printed certificate or visit the verification URL to confirm authenticity.
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Digital Signature</p>
                <pre className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
                  {pto.signatureBase64}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revoke modal */}
      {showRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Revoke PTO</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently mark the PTO as revoked and end the stand occupancy for <strong>{pto.residentName}</strong>. This action cannot be undone.
            </p>
            {revokeError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{revokeError}</div>
            )}
            <label className="block mb-1 text-xs font-semibold text-gray-700">Reason for revocation <span className="text-red-500">*</span></label>
            <textarea
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              placeholder="e.g. Occupant has relocated; stand transferred to council for reallocation"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowRevoke(false); setRevokeReason(""); setRevokeError(null); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRevoke()}
                disabled={revoking || revokeReason.trim().length < 5}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {revoking ? "Revoking…" : "Confirm Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
