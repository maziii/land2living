import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchApplication,
  acceptStandOffer,
  requestStandViewing,
  rejectStandOffer,
  withdrawApplication,
  type ApplicationDraft,
} from "../../api/land-application.js";

// ── Stage helpers ─────────────────────────────────────────────────────────────

type StageStatus = "done" | "active" | "pending";

interface Stage {
  label:    string;
  sublabel: string;
  status:   StageStatus;
}

function deriveStages(app: ApplicationDraft): Stage[] {
  const s = app.status;

  const pastDecision = ["approved", "stand_offered", "viewing_requested", "offer_rejected", "offer_accepted", "active"].includes(s);
  const pastOffer    = ["offer_accepted", "active"].includes(s);
  const isNegotiating = ["stand_offered", "viewing_requested", "offer_rejected"].includes(s);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-ZA") : "";

  const submitted: Stage = {
    label:    "Submitted",
    sublabel: fmt(app.submittedAt),
    status:   "done",
  };

  const inReview: Stage = {
    label:    "Under review",
    sublabel: app.reviewedAt ? fmt(app.reviewedAt) : "Council is processing your application",
    status:   s === "submitted"    ? "active"
            : s === "under_review" ? "active"
            : s === "draft"        ? "pending"
            :                        "done",
  };

  const decision: Stage = (() => {
    if (s === "rejected")  return { label: "Not approved", sublabel: fmt(app.decidedAt), status: "done" as StageStatus };
    if (s === "deferred")  return { label: "Deferred",     sublabel: "Council has deferred — check back soon", status: "done" as StageStatus };
    if (s === "withdrawn") return { label: "Withdrawn",    sublabel: "You withdrew this application", status: "done" as StageStatus };
    if (pastDecision)      return { label: "Approved",     sublabel: fmt(app.decidedAt), status: "done" as StageStatus };
    return { label: "Decision", sublabel: "Pending council decision", status: "pending" as StageStatus };
  })();

  const standStage: Stage = (() => {
    if (s === "offer_rejected") return { label: "Stand offer",  sublabel: "You declined — council is finding another stand", status: "active" as StageStatus };
    if (s === "stand_offered")  return { label: "Stand offered", sublabel: "A stand has been shared with you — review and respond", status: "active" as StageStatus };
    if (s === "viewing_requested") return { label: "Viewing requested", sublabel: "Council will contact you to arrange a viewing", status: "active" as StageStatus };
    if (pastOffer)              return { label: "Stand confirmed", sublabel: "You accepted the offered stand", status: "done" as StageStatus };
    if (isNegotiating || pastDecision) return { label: "Stand offer", sublabel: "Council is allocating a stand", status: "pending" as StageStatus };
    return { label: "Stand offer", sublabel: "Pending council decision", status: "pending" as StageStatus };
  })();

  const pto: Stage = {
    label:    "PTO active",
    sublabel: s === "active"
      ? "Payment received · PTO signed · Your stand is confirmed"
      : s === "offer_accepted"
        ? "Visit the council office to pay and sign your PTO"
        : "Pending stand confirmation",
    status: s === "active" ? "done" : (s === "offer_accepted" ? "active" : "pending"),
  };

  return [submitted, inReview, decision, standStage, pto];
}

const STAGE_ICON: Record<StageStatus, string> = { done: "✓", active: "●", pending: "○" };
const STAGE_RING: Record<StageStatus, string> = {
  done:    "bg-forest-600 text-white",
  active:  "bg-amber-400 text-white",
  pending: "bg-gray-100 text-gray-400",
};
const STAGE_LINE: Record<StageStatus, string> = {
  done: "bg-forest-500", active: "bg-gray-200", pending: "bg-gray-200",
};

// ── Label helpers ─────────────────────────────────────────────────────────────

const LAND_PURPOSE_LABEL: Record<string, string> = {
  residential: "Residential stand",
  business:    "Business stand",
  farming:     "Farming land",
  community:   "Community land",
};

const STATUS_COLOR: Record<string, string> = {
  submitted:         "bg-blue-100 text-blue-700",
  under_review:      "bg-amber-100 text-amber-700",
  approved:          "bg-green-100 text-green-700",
  stand_offered:     "bg-purple-100 text-purple-700",
  viewing_requested: "bg-purple-100 text-purple-700",
  offer_rejected:    "bg-orange-100 text-orange-700",
  offer_accepted:    "bg-green-100 text-green-700",
  active:            "bg-forest-100 text-forest-700",
  rejected:          "bg-red-100 text-red-700",
  deferred:          "bg-orange-100 text-orange-700",
  withdrawn:         "bg-gray-100 text-gray-500",
};

const STATUS_DISPLAY: Record<string, string> = {
  submitted:         "Submitted",
  under_review:      "Under review",
  approved:          "Approved",
  stand_offered:     "Stand offered",
  viewing_requested: "Viewing requested",
  offer_rejected:    "Offer declined",
  offer_accepted:    "Stand accepted",
  active:            "PTO active",
  rejected:          "Not approved",
  deferred:          "Deferred",
  withdrawn:         "Withdrawn",
};

// ── Stand offer section ───────────────────────────────────────────────────────

function StandOfferSection({
  app,
  onAction,
  acting,
}: {
  app: ApplicationDraft;
  onAction: (action: "accept" | "viewing" | "reject" | "withdraw") => void;
  acting: boolean;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  const standPhotos = app.documents.filter(d => d.documentType === "stand_photo");
  const canAct = app.status === "stand_offered" || app.status === "viewing_requested";

  return (
    <div className="bg-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden">
      <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
        <p className="text-sm font-semibold text-purple-900">Stand offered by council</p>
        {app.status === "viewing_requested" && (
          <p className="text-xs text-purple-600 mt-0.5">Viewing requested — council will be in touch to arrange a visit</p>
        )}
      </div>

      {/* Photos */}
      {standPhotos.length > 0 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {standPhotos.map(doc => (
            <div key={doc.id} className="w-40 h-28 rounded-xl bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-xs">
              📸 Stand photo
            </div>
          ))}
        </div>
      )}
      {standPhotos.length === 0 && (
        <div className="mx-4 my-3 h-24 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400">
          No photos uploaded yet
        </div>
      )}

      {/* Council note */}
      {app.decisionNotes && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 font-medium mb-0.5">Message from council</p>
          <p className="text-sm text-gray-700 leading-snug">{app.decisionNotes}</p>
        </div>
      )}

      {/* Action buttons */}
      {canAct && !confirmReject && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
          <button
            disabled={acting}
            onClick={() => onAction("accept")}
            className="w-full bg-forest-600 text-white font-semibold py-3 rounded-xl text-sm active:bg-forest-700 disabled:opacity-60 transition-colors"
          >
            {acting ? "Saving…" : "Accept this stand"}
          </button>
          {app.status === "stand_offered" && (
            <button
              disabled={acting}
              onClick={() => onAction("viewing")}
              className="w-full bg-white border border-forest-300 text-forest-700 font-semibold py-3 rounded-xl text-sm active:bg-forest-50 disabled:opacity-60 transition-colors"
            >
              Visit the stand first — request a viewing
            </button>
          )}
          <button
            disabled={acting}
            onClick={() => setConfirmReject(true)}
            className="w-full bg-white border border-gray-200 text-gray-500 font-medium py-3 rounded-xl text-sm active:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            This stand is not right for me
          </button>
        </div>
      )}

      {/* Two-option rejection flow */}
      {canAct && confirmReject && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <p className="text-sm font-medium text-gray-800">What would you like to do?</p>
          <button
            disabled={acting}
            onClick={() => { setConfirmReject(false); onAction("reject"); }}
            className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl text-sm active:bg-orange-600 disabled:opacity-60 text-left px-4"
          >
            <span className="block text-sm font-semibold">{acting ? "Saving…" : "Ask for a different stand"}</span>
            <span className="block text-xs font-normal opacity-90 mt-0.5">The council will find another option and send a new offer</span>
          </button>
          <button
            disabled={acting}
            onClick={() => { setConfirmReject(false); onAction("withdraw"); }}
            className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl text-sm active:bg-red-700 disabled:opacity-60 text-left px-4"
          >
            <span className="block text-sm font-semibold">{acting ? "Saving…" : "Withdraw my application"}</span>
            <span className="block text-xs font-normal opacity-90 mt-0.5">I no longer wish to apply — this will close the application</span>
          </button>
          <button
            onClick={() => setConfirmReject(false)}
            className="w-full bg-gray-100 text-gray-700 font-medium py-3 rounded-xl text-sm"
          >
            Cancel — I'll decide later
          </button>
        </div>
      )}

      {app.status === "offer_rejected" && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100">
          <p className="text-sm text-orange-700">You requested a different stand. The council is sourcing another option — you will be notified when a new offer is ready.</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [app, setApp]       = useState<ApplicationDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [acting, setActing]  = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchApplication(id)
      .then(setApp)
      .catch(() => setError("Could not load application. Please try again."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleOfferAction(action: "accept" | "viewing" | "reject" | "withdraw") {
    if (!id) return;
    setActing(true);
    setError(null);
    try {
      const updated = action === "accept"    ? await acceptStandOffer(id)
                    : action === "viewing"   ? await requestStandViewing(id)
                    : action === "reject"    ? await rejectStandOffer(id)
                    :                          await withdrawApplication(id);
      setApp(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-forest-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (error && !app) {
    return (
      <div className="min-h-screen bg-forest-50 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-red-600 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/resident/land")} className="text-forest-600 text-sm font-medium">← Back to My Land</button>
      </div>
    );
  }

  if (!app) return null;

  const stages = deriveStages(app);
  const ref    = app.id.slice(0, 8).toUpperCase();
  const showStandOffer = ["stand_offered", "viewing_requested", "offer_rejected"].includes(app.status);

  return (
    <div className="min-h-screen bg-forest-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4">
        <button onClick={() => navigate("/resident/land")} className="text-forest-600 text-sm font-medium mb-3">
          ← My Land
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-forest-900">
              {app.landPurpose ? LAND_PURPOSE_LABEL[app.landPurpose] : "Land application"}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Ref: {ref}</p>
          </div>
          {app.status !== "draft" && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${STATUS_COLOR[app.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_DISPLAY[app.status] ?? app.status.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        {/* Workflow progress */}
        <div className="bg-white rounded-2xl border border-forest-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Application progress</h2>
          <div className="relative">
            {stages.map((stage, i) => (
              <div key={stage.label} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${STAGE_RING[stage.status]}`}>
                    {STAGE_ICON[stage.status]}
                  </div>
                  {i < stages.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[28px] mt-1 mb-1 ${STAGE_LINE[stages[i + 1]?.status ?? "pending"]}`} />
                  )}
                </div>
                <div className="pb-5 flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${stage.status === "pending" ? "text-gray-400" : "text-gray-900"}`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{stage.sublabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stand offer interaction */}
        {showStandOffer && (
          <StandOfferSection app={app} onAction={handleOfferAction} acting={acting} />
        )}

        {/* offer_accepted — action required */}
        {app.status === "offer_accepted" && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-amber-800">Action required</p>
            <p className="text-sm text-amber-700 leading-snug">
              You've accepted your stand. Please visit the council office to pay the applicable fees and sign your Permission to Occupy (PTO) document.
            </p>
            <p className="text-xs text-amber-600 mt-1">Bring your ID document when you visit.</p>
          </div>
        )}

        {/* approved — waiting for stand offer */}
        {app.status === "approved" && (
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">Approved</p>
            <p className="text-sm text-blue-700 leading-snug">
              Your application has been approved. The council is now allocating a stand for you. You will receive a notification once a stand offer is ready for your review.
            </p>
          </div>
        )}

        {/* active — PTO live */}
        {app.status === "active" && (
          <div className="bg-green-50 rounded-2xl border border-green-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-green-800">PTO active</p>
            <p className="text-sm text-green-700 leading-snug">
              Your payment has been received and your Permission to Occupy is signed and active. Your stand is now formally registered in your name.
            </p>
          </div>
        )}

        {/* Decision note (rejection / deferral) */}
        {app.decisionNotes && !showStandOffer && (
          <div className={`rounded-2xl border p-4 ${
            app.status === "rejected" ? "bg-red-50 border-red-200"
            : app.status === "deferred" ? "bg-orange-50 border-orange-200"
            : "bg-gray-50 border-gray-200"
          }`}>
            <p className="text-xs font-semibold text-gray-700 mb-1">Council note</p>
            <p className="text-sm text-gray-700 leading-snug">{app.decisionNotes}</p>
          </div>
        )}

        {/* Application details */}
        <div className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
          {[
            app.villageName     && { label: "Village / area",  value: app.villageName },
            app.landPurpose     && { label: "Land use",        value: LAND_PURPOSE_LABEL[app.landPurpose] ?? app.landPurpose },
            app.householdSize   && { label: "Household size",  value: `${app.householdSize} ${app.householdSize === 1 ? "person" : "people"}` },
            app.siteDescription && { label: "Site description", value: app.siteDescription },
            app.submittedAt     && { label: "Submitted",       value: new Date(app.submittedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) },
            app.decidedAt       && { label: "Decision date",   value: new Date(app.decidedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) },
          ].filter(Boolean).map(row => row && (
            <div key={row.label} className="flex justify-between gap-4">
              <p className="text-xs text-gray-500 shrink-0">{row.label}</p>
              <p className="text-xs text-gray-800 text-right">{row.value}</p>
            </div>
          ))}
        </div>

        {/* Documents uploaded by applicant */}
        {app.documents.filter(d => d.documentType !== "stand_photo").length > 0 && (
          <div className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
            {app.documents.filter(d => d.documentType !== "stand_photo").map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
                <span>📎</span>
                <span className="capitalize">{doc.documentType.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}

        {/* Help text */}
        {(app.status === "submitted" || app.status === "under_review" || app.status === "deferred") && (
          <p className="text-xs text-gray-400 text-center px-4">
            The council will contact you once a decision has been made. No action is required from you at this time.
          </p>
        )}

      </div>
    </div>
  );
}
