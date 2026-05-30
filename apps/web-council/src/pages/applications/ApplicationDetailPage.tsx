import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchApplication,
  startReview,
  approveApplication,
  rejectApplication,
  deferApplication,
  offerStand,
  markActive,
  withdrawApplication,
  uploadStandPhoto,
  issuePTO,
  type ApplicationSummary,
  type ApplicationStatus,
} from "../../api/applications.js";
import { fetchStands, type StandSummary } from "../../api/stands.js";
import { openPTOPDF } from "../../api/ptos.js";
import { StatusBadge } from "../../components/StatusBadge.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LAND_PURPOSE_LABEL: Record<string, string> = {
  residential: "Residential stand",
  business:    "Business stand",
  farming:     "Farming land",
  community:   "Community land",
};

function applicantName(a: ApplicationSummary) {
  if (a.applicantFirstName || a.applicantLastName)
    return [a.applicantFirstName, a.applicantLastName].filter(Boolean).join(" ");
  return a.applicantResidentId.slice(0, 8);
}

const TERMINAL = new Set(["active", "rejected", "withdrawn"]);

// ── Process stepper ───────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  "Submitted",
  "Under Review",
  "Decision",
  "Stand Offered",
  "Offer Accepted",
  "PTO Active",
];

function statusToStepIndex(status: ApplicationStatus): number {
  switch (status) {
    case "submitted":         return 0;
    case "under_review":      return 1;
    case "approved":
    case "deferred":          return 2;
    case "stand_offered":
    case "viewing_requested":
    case "offer_rejected":    return 3;
    case "offer_accepted":    return 4;
    case "active":            return 5;
    default:                  return -1;
  }
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function ProcessStepper({ status }: { status: ApplicationStatus }) {
  const currentStep = statusToStepIndex(status);
  if (currentStep === -1) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((label, i) => (
          <div key={label} className={`flex items-start ${i < WORKFLOW_STEPS.length - 1 ? "flex-1 min-w-0" : ""}`}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                i < currentStep   ? "bg-forest-600 text-white" :
                i === currentStep ? "bg-forest-600 text-white ring-4 ring-forest-100" :
                                    "bg-gray-100 text-gray-400"
              }`}>
                {i < currentStep ? <CheckIcon /> : i + 1}
              </div>
              <span className={`text-xs text-center leading-tight hidden sm:block ${
                i <= currentStep ? "text-gray-700 font-medium" : "text-gray-400"
              }`}>{label}</span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mt-3.5 mx-1 shrink-0 ${
                i < currentStep ? "bg-forest-500" : "bg-gray-200"
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Panel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 space-y-4 ${accent ? "border-forest-300 bg-forest-50" : "border-gray-200 bg-white"} shadow-sm`}>
      <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-600">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function TimelineRow({ label, date, note }: { label: string; date: string; note?: string | null }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-2 h-2 rounded-full bg-forest-400 mt-1.5 shrink-0" />
      <div>
        <p className="text-sm text-gray-700 font-medium">{label}</p>
        <p className="text-xs text-gray-400">{new Date(date).toLocaleString("en-ZA")}</p>
        {note && <p className="text-xs text-gray-600 italic mt-0.5">"{note}"</p>}
      </div>
    </div>
  );
}

// ── Action panels by stage ────────────────────────────────────────────────────

function AcknowledgePanel({ onConfirm, saving }: { onConfirm: () => void; saving: boolean }) {
  return (
    <Panel title="Step 1 — Acknowledge application" accent>
      <p className="text-sm text-gray-600">
        Acknowledge receipt of this application to signal the council is actively processing it.
        The applicant will see the status update in their app.
      </p>
      <button
        onClick={onConfirm}
        disabled={saving}
        className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
      >
        {saving ? "Saving…" : "Acknowledge & begin review"}
      </button>
    </Panel>
  );
}

function DecisionPanel({
  onApprove, onReject, onDefer, saving,
}: {
  onApprove: (notes: string) => void;
  onReject:  (notes: string) => void;
  onDefer:   (notes: string) => void;
  saving: boolean;
}) {
  const [notes, setNotes]   = useState("");
  const [picked, setPicked] = useState<"approve" | "reject" | "defer" | null>(null);

  const OPTION_LABELS = {
    approve: "Proceed — offer a stand",
    reject:  "Not approve",
    defer:   "Defer",
  } as const;

  return (
    <Panel title="Step 2 — Record decision" accent>
      <p className="text-sm text-gray-600">Review the application details above and record a decision.</p>
      <div className="flex gap-2 flex-wrap">
        {(["approve", "reject", "defer"] as const).map(opt => (
          <button
            key={opt}
            onClick={() => setPicked(opt)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              picked === opt
                ? opt === "approve" ? "bg-green-600 text-white border-green-600"
                : opt === "reject"  ? "bg-red-600 text-white border-red-600"
                :                     "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {OPTION_LABELS[opt]}
          </button>
        ))}
      </div>
      {picked && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {picked === "approve" ? "Note to applicant (optional)" : "Reason (recommended)"}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={
                picked === "approve" ? "Any message to include — the applicant will see this when a stand is offered…"
                : picked === "reject" ? "Reason for not approving this application…"
                : "Reason for deferral and when to check back…"
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
            />
          </div>
          <button
            onClick={() => picked === "approve" ? onApprove(notes) : picked === "reject" ? onReject(notes) : onDefer(notes)}
            disabled={saving}
            className={`px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 ${
              picked === "approve" ? "bg-green-600 hover:bg-green-700"
              : picked === "reject" ? "bg-red-600 hover:bg-red-700"
              : "bg-orange-500 hover:bg-orange-600"
            }`}
          >
            {saving ? "Saving…" : `Confirm — ${OPTION_LABELS[picked]}`}
          </button>
        </>
      )}
    </Panel>
  );
}

function OfferStandPanel({
  stands, onOffer, saving, reOffer,
}: {
  stands:  StandSummary[];
  onOffer: (standId: string, note: string, photos: File[]) => void;
  saving:  boolean;
  reOffer?: boolean;
}) {
  const [standId, setStandId]   = useState("");
  const [note, setNote]         = useState("");
  const [photos, setPhotos]     = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotos(prev => [...prev, ...files]);
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(previews[i] ?? "");
    setPhotos(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
  }

  return (
    <Panel title={reOffer ? "Re-offer a stand" : "Step 3 — Offer a stand"} accent>
      <p className="text-sm text-gray-600">
        {reOffer
          ? "The applicant requested a different stand. Select an alternative and upload photos to help them decide."
          : "Select an available stand from the register, upload photos, and write a message. The applicant will review the offer and can accept, request a viewing, or ask for a different stand."}
      </p>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Stand</label>
        <select
          value={standId}
          onChange={e => setStandId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
        >
          <option value="">Select a stand…</option>
          {stands.map(s => (
            <option key={s.id} value={s.id}>
              {s.localReference ?? s.id.slice(0, 8)} — {s.addressDescription}
              {s.areaSquareMetres ? ` (${s.areaSquareMetres} m²)` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Photos of the stand (optional)</label>
        {previews.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {previews.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <img src={src} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="cursor-pointer inline-flex items-center gap-2 text-sm text-forest-700 border border-forest-300 bg-white rounded-lg px-3 py-2 hover:bg-forest-50 transition-colors">
          <span>+ Add photos</span>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </label>
        {photos.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">{photos.length} photo{photos.length !== 1 ? "s" : ""} selected — will be uploaded when you send the offer</p>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Message to applicant</label>
        <textarea
          rows={4}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Describe the stand — location, size, condition, what's nearby, any access instructions…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
        />
      </div>

      <button
        onClick={() => onOffer(standId, note, photos)}
        disabled={saving || !standId}
        className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
      >
        {saving ? "Saving…" : `Send stand offer${photos.length > 0 ? ` with ${photos.length} photo${photos.length !== 1 ? "s" : ""}` : ""}`}
      </button>
    </Panel>
  );
}

function StandOfferedPanel({ app }: { app: ApplicationSummary }) {
  const photoCount = app.documents.filter(d => d.documentType === "stand_photo").length;

  return (
    <Panel title="Offer sent — awaiting applicant response" accent>
      <p className="text-sm text-gray-600">
        The stand offer has been sent. The applicant can accept, request a viewing, or ask for a different stand from their app.
      </p>

      {app.allocatedStandId && (
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-1">
          <p className="text-xs text-gray-500">Offered stand</p>
          <Link
            to={`/dashboard/land/available/${app.allocatedStandId}`}
            className="text-sm font-medium text-forest-700 hover:underline"
          >
            {app.allocatedStandId}
          </Link>
          {photoCount > 0 && (
            <p className="text-xs text-gray-400">{photoCount} photo{photoCount !== 1 ? "s" : ""} shared with applicant</p>
          )}
        </div>
      )}

      {app.applicantPhone && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="text-xs text-amber-700 font-medium">Want to invite for an in-person viewing?</p>
          <p className="text-xs text-amber-600">Contact the applicant directly and arrange a visit. They can then confirm acceptance from their app.</p>
          <a href={`tel:${app.applicantPhone}`} className="text-sm font-semibold text-forest-700 hover:underline block mt-1">
            {app.applicantPhone}
          </a>
        </div>
      )}

      <p className="text-xs text-gray-400">No further action required until the applicant responds.</p>
    </Panel>
  );
}

function ViewingRequestedPanel({ app }: { app: ApplicationSummary }) {
  return (
    <Panel title="Viewing requested by applicant" accent>
      <p className="text-sm text-gray-600">
        The applicant has requested to visit the stand before making a decision.
        Contact them to arrange a convenient time.
      </p>
      {app.applicantPhone && (
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 mb-1">Applicant contact</p>
          <a href={`tel:${app.applicantPhone}`} className="text-sm font-semibold text-forest-700 hover:underline">
            {app.applicantPhone}
          </a>
        </div>
      )}
      <p className="text-xs text-gray-500">
        After the viewing, the applicant will accept or decline the offer from their app.
        No further action required from you until they respond.
      </p>
    </Panel>
  );
}

// ── Step 4: Payment, PTO issuance, and signing ───────────────────────────────

function SubStepIndicator({ current }: { current: 0 | 1 | 2 }) {
  const labels = ["Confirm payment", "Generate PTO", "Sign & register"];
  return (
    <div className="flex items-start mb-4">
      {labels.map((label, i) => (
        <div key={label} className={`flex items-start ${i < labels.length - 1 ? "flex-1 min-w-0" : ""}`}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
              i < current  ? "bg-green-600 text-white" :
              i === current ? "bg-forest-600 text-white ring-2 ring-forest-100" :
                              "bg-gray-100 text-gray-400"
            }`}>
              {i < current ? <CheckIcon /> : i + 1}
            </div>
            <span className={`text-xs text-center leading-tight hidden sm:block ${
              i <= current ? "text-gray-700" : "text-gray-400"
            }`}>{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div className={`flex-1 h-0.5 mt-3 mx-1 shrink-0 ${i < current ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function OfferAcceptedPanel({
  existingPtoId,
  canIssuePTO,
  onIssuePTO,
  onMarkActive,
  saving,
  apiFetch,
}: {
  existingPtoId: string | null;
  canIssuePTO: boolean;
  onIssuePTO: () => Promise<{ id: string }>;
  onMarkActive: () => void;
  saving: boolean;
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const [subStep, setSubStep]     = useState<0 | 1 | 2>(existingPtoId ? 2 : 0);
  const [issuedPtoId, setIssuedPtoId] = useState<string | null>(existingPtoId);
  const [issuing, setIssuing]     = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]   = useState<string | null>(null);

  async function handleOpenPDF(ptoId: string) {
    setPdfLoading(true);
    setPdfError(null);
    try {
      await openPTOPDF(apiFetch, ptoId);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Failed to open PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleGeneratePTO() {
    setIssuing(true);
    setIssueError(null);
    try {
      const pto = await onIssuePTO();
      setIssuedPtoId(pto.id);
      setSubStep(2);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Failed to generate PTO");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Panel title="Step 4 — Payment, PTO issuance & signing" accent>
      <SubStepIndicator current={subStep} />

      {subStep === 0 && (
        <>
          <p className="text-sm text-gray-600">
            The applicant has accepted the stand offer. Confirm that the applicable fees have been received at the council office before proceeding to PTO generation.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Collect all applicable stand fees before generating the PTO document.
          </div>
          <button
            onClick={() => setSubStep(1)}
            className="bg-forest-600 hover:bg-forest-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            Payment confirmed — proceed to PTO generation
          </button>
        </>
      )}

      {subStep === 1 && (
        <>
          <p className="text-sm text-gray-600">
            Generate the cryptographically signed Permission to Occupy document. It will be added to the PTO register and a signed PDF will be securely stored.
          </p>
          {!canIssuePTO && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              Only a Council Secretary or Founder can generate the PTO. Ask a council secretary to complete this step.
            </div>
          )}
          {issueError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{issueError}</div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setSubStep(0)}
              className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
            >
              ← Back
            </button>
            <button
              onClick={() => void handleGeneratePTO()}
              disabled={!canIssuePTO || issuing || saving}
              className="bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {issuing ? "Generating…" : "Generate & sign PTO"}
            </button>
          </div>
        </>
      )}

      {subStep === 2 && issuedPtoId && (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-green-800">PTO generated and registered</p>
            <p className="font-mono text-xs text-green-700">Ref: {issuedPtoId.slice(0, 8).toUpperCase()}</p>
            <div className="flex items-center flex-wrap gap-2 pt-1">
              <button
                onClick={() => void handleOpenPDF(issuedPtoId)}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 text-xs text-forest-700 border border-forest-300 bg-white rounded-lg px-3 py-1.5 hover:bg-forest-50 disabled:opacity-60"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {pdfLoading ? "Opening…" : "Preview PTO PDF"}
              </button>
              <Link
                to={`/dashboard/land/ptos/${issuedPtoId}`}
                className="inline-flex items-center gap-1.5 text-xs text-forest-700 border border-forest-300 bg-white rounded-lg px-3 py-1.5 hover:bg-forest-50"
              >
                View in PTO Register →
              </Link>
            </div>
            {pdfError && <p className="text-xs text-red-600">{pdfError}</p>}
          </div>
          <p className="text-sm text-gray-600">
            Present the PTO document to the applicant at the council premises. Once the applicant has reviewed and signed the document, click below to activate and close this application.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Confirm the applicant has signed the PTO document before completing.
          </div>
          <button
            onClick={onMarkActive}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? "Saving…" : "Confirm signed — activate & close application"}
          </button>
        </>
      )}
    </Panel>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApplicationDetailPage() {
  const { id }             = useParams<{ id: string }>();
  const { apiFetch, auth } = useAuth();

  const [application, setApplication] = useState<ApplicationSummary | null>(null);
  const [stands, setStands]           = useState<StandSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  const canAct      = ["council_secretary", "land_officer", "founder"].includes(auth?.claims.role ?? "");
  const canIssuePTO = ["council_secretary", "founder"].includes(auth?.claims.role ?? "");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchApplication(apiFetch, id),
      fetchStands(apiFetch, { pageSize: 100, availableOnly: true }),
    ])
      .then(([app, standsRes]) => { setApplication(app); setStands(standsRes.stands); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, id]);

  async function act(fn: () => Promise<ApplicationSummary>) {
    setSaving(true);
    setError(null);
    try { setApplication(await fn()); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!application && error) return <div className="p-6 text-red-600">{error}</div>;
  if (!application) return <div className="p-6 text-gray-500">Not found</div>;

  const a   = application;
  const s   = a.status;
  const ref = a.id.slice(0, 8).toUpperCase();
  const standPhotoCount = a.documents.filter(d => d.documentType === "stand_photo").length;

  return (
    <div className="p-6 space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to=".." className="text-forest-600 hover:underline text-sm">← Applications</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {a.landPurpose ? LAND_PURPOSE_LABEL[a.landPurpose] : (a.applicationType?.replace(/_/g, " ") ?? "Land Application")}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <StatusBadge status={s} />
            <span className="text-gray-400 text-xs">Ref: {ref}</span>
            {a.submittedAt && (
              <span className="text-gray-400 text-xs">
                Submitted {new Date(a.submittedAt).toLocaleDateString("en-ZA")}
              </span>
            )}
          </div>
        </div>
        {canAct && !TERMINAL.has(s) && (
          <button
            onClick={() => void act(() => withdrawApplication(apiFetch, id!))}
            disabled={saving}
            className="text-sm text-gray-500 border border-gray-300 hover:bg-gray-50 disabled:opacity-60 px-3 py-1.5 rounded-lg shrink-0"
          >
            Withdraw
          </button>
        )}
      </div>

      {/* Process stepper */}
      <ProcessStepper status={s} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Applicant details */}
      <Panel title="Applicant">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name"         value={applicantName(a)} />
          <Field label="Phone"        value={a.applicantPhone ?? "—"} />
          <Field label="Resident ID"  value={a.applicantResidentId} mono />
          <Field label="Household"    value={`${a.householdSize} ${a.householdSize === 1 ? "person" : "people"}`} />
        </div>
      </Panel>

      {/* Application details */}
      <Panel title="Application details">
        <div className="grid grid-cols-2 gap-4">
          {a.landPurpose     && <Field label="Land use"          value={LAND_PURPOSE_LABEL[a.landPurpose] ?? a.landPurpose} />}
          {a.villageName     && <Field label="Preferred village" value={a.villageName} />}
          {a.authorityType   && <Field label="Authority type"    value={a.authorityType.replace(/_/g, " ")} />}
          {a.siteDescription && <Field label="Site description"  value={a.siteDescription} />}
          {a.requestedLocationDescription && <Field label="Location requested" value={a.requestedLocationDescription} />}
          {a.reason          && <Field label="Reason"            value={a.reason} />}
        </div>
        {(a.hasExistingLand !== null || a.hasPreviousApplication !== null || a.hasDispute !== null) && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-3 gap-4">
            {a.hasExistingLand !== null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Existing land</p>
                <p className={`text-sm font-medium ${a.hasExistingLand ? "text-amber-700" : "text-gray-700"}`}>
                  {a.hasExistingLand ? "Yes" : "No"}
                </p>
                {a.existingLandDescription && <p className="text-xs text-gray-500 mt-0.5">{a.existingLandDescription}</p>}
              </div>
            )}
            {a.hasPreviousApplication !== null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Prior application</p>
                <p className={`text-sm font-medium ${a.hasPreviousApplication ? "text-amber-700" : "text-gray-700"}`}>
                  {a.hasPreviousApplication ? `Yes${a.previousApplicationRef ? ` — ${a.previousApplicationRef}` : ""}` : "No"}
                </p>
              </div>
            )}
            {a.hasDispute !== null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Land dispute</p>
                <p className={`text-sm font-medium ${a.hasDispute ? "text-red-700" : "text-gray-700"}`}>
                  {a.hasDispute ? "Yes — dispute disclosed" : "No"}
                </p>
                {a.disputeDescription && <p className="text-xs text-gray-500 mt-0.5">{a.disputeDescription}</p>}
              </div>
            )}
          </div>
        )}
        {a.allocatedStandId && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Allocated stand</p>
            <Link
              to={`/dashboard/land/available/${a.allocatedStandId}`}
              className="text-sm text-forest-700 hover:underline font-medium"
            >
              {a.allocatedStandId}
            </Link>
          </div>
        )}
        {a.documents.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Documents</p>
            <div className="flex flex-wrap gap-2">
              {a.documents.map(doc => (
                <span key={doc.id} className="text-xs bg-gray-100 px-2 py-1 rounded capitalize">
                  {doc.documentType.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Timeline */}
      <Panel title="Timeline">
        <div className="space-y-3">
          {a.submittedAt && <TimelineRow label="Submitted"      date={a.submittedAt} />}
          {a.reviewedAt  && <TimelineRow label="Review started" date={a.reviewedAt} />}
          {a.decidedAt   && (
            <TimelineRow
              label={s === "stand_offered" || s === "viewing_requested" || s === "offer_accepted" || s === "active" ? "Approved — proceeding to offer" : `Decision: ${s}`}
              date={a.decidedAt}
              note={a.decisionNotes}
            />
          )}
          {standPhotoCount > 0 && (
            <div className="ml-5 text-xs text-gray-500">
              {standPhotoCount} stand photo{standPhotoCount !== 1 ? "s" : ""} uploaded
            </div>
          )}
        </div>
      </Panel>

      {/* ── Stage-aware action panels ─────────────────────────────── */}

      {canAct && s === "submitted" && (
        <AcknowledgePanel
          saving={saving}
          onConfirm={() => void act(() => startReview(apiFetch, id!))}
        />
      )}

      {canAct && s === "under_review" && (
        <DecisionPanel
          saving={saving}
          onApprove={notes => void act(() => approveApplication(apiFetch, id!, notes))}
          onReject={notes  => void act(() => rejectApplication(apiFetch,  id!, notes))}
          onDefer={notes   => void act(() => deferApplication(apiFetch,   id!, notes))}
        />
      )}

      {canAct && s === "approved" && (
        <OfferStandPanel
          stands={stands}
          saving={saving}
          onOffer={(standId, note, photos) => void act(async () => {
            for (const f of photos) {
              await uploadStandPhoto(apiFetch, id!, f);
            }
            return offerStand(apiFetch, id!, { allocatedStandId: standId, offerNote: note });
          })}
        />
      )}

      {canAct && s === "stand_offered" && (
        <StandOfferedPanel app={a} />
      )}

      {canAct && s === "viewing_requested" && (
        <ViewingRequestedPanel app={a} />
      )}

      {canAct && s === "offer_rejected" && (
        <OfferStandPanel
          stands={stands}
          saving={saving}
          reOffer
          onOffer={(standId, note, photos) => void act(async () => {
            for (const f of photos) {
              await uploadStandPhoto(apiFetch, id!, f);
            }
            return offerStand(apiFetch, id!, { allocatedStandId: standId, offerNote: note });
          })}
        />
      )}

      {canAct && s === "offer_accepted" && (
        <OfferAcceptedPanel
          existingPtoId={a.ptoId}
          canIssuePTO={canIssuePTO}
          onIssuePTO={() => issuePTO(apiFetch, id!)}
          onMarkActive={() => void act(() => markActive(apiFetch, id!))}
          saving={saving}
          apiFetch={apiFetch}
        />
      )}

      {s === "active" && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <CheckIcon />
            </div>
            <p className="font-semibold text-green-800">PTO active — stand formally registered</p>
          </div>
          <p className="text-sm text-green-700">Payment received, PTO signed and registered in the digital land register.</p>
          {a.ptoId && (
            <div className="flex items-center flex-wrap gap-3 pt-1 border-t border-green-200">
              <span className="text-xs font-mono text-green-700 bg-green-100 px-2 py-1 rounded">
                PTO {a.ptoId.slice(0, 8).toUpperCase()}
              </span>
              <Link
                to={`/dashboard/land/ptos/${a.ptoId}`}
                className="text-xs font-medium text-forest-700 hover:underline"
              >
                View PTO record →
              </Link>
              <button
                onClick={() => void openPTOPDF(apiFetch, a.ptoId!)}
                className="text-xs font-medium text-forest-700 hover:underline"
              >
                Download PDF
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
