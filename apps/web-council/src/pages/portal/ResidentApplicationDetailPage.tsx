import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchApplication, acceptOffer, requestViewing, rejectOffer, withdrawApplication } from "../../api/applications.js";
import type { ApplicationSummary, ApplicationStatus } from "../../api/applications.js";

interface TimelineEvent {
  status: ApplicationStatus;
  label: string;
  desc: string;
  colour: string;
}

const TIMELINE: TimelineEvent[] = [
  { status: "submitted",         label: "Submitted",          desc: "Your application has been received by the council.",            colour: "bg-blue-500" },
  { status: "under_review",      label: "Under review",       desc: "A council officer is reviewing your application.",              colour: "bg-amber-500" },
  { status: "approved",          label: "Approved",           desc: "The council has approved your application.",                    colour: "bg-forest-500" },
  { status: "stand_offered",     label: "Stand offered",      desc: "A specific stand has been offered to you.",                    colour: "bg-teal-500" },
  { status: "viewing_requested", label: "Viewing requested",  desc: "You've requested a site visit.",                               colour: "bg-purple-500" },
  { status: "offer_accepted",    label: "Offer accepted",     desc: "You have accepted the stand offer.",                           colour: "bg-forest-600" },
  { status: "active",            label: "Active — PTO issued",desc: "Congratulations! Your PTO has been issued.",                   colour: "bg-forest-700" },
];

const TERMINAL_STATUSES: ApplicationStatus[] = ["rejected", "deferred", "withdrawn"];

function StatusBanner({ status }: { status: ApplicationStatus }) {
  if (status === "rejected") {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        <p className="font-semibold mb-1">Application rejected</p>
        <p>Unfortunately your application was not approved. Please contact a council officer if you have questions.</p>
      </div>
    );
  }
  if (status === "deferred") {
    return (
      <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm text-orange-700">
        <p className="font-semibold mb-1">Application deferred</p>
        <p>The council has deferred your application. It will be reviewed again in due course.</p>
      </div>
    );
  }
  if (status === "withdrawn") {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
        <p className="font-semibold mb-1">Application withdrawn</p>
        <p>This application has been withdrawn.</p>
      </div>
    );
  }
  return null;
}

export function ResidentApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [app, setApp] = useState<ApplicationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    if (!id) return;
    try {
      setApp(await fetchApplication(apiFetch, id));
    } catch {
      setError("Could not load application.");
    } finally {
      setLoading(false);
    }
  }

  async function act(action: () => Promise<ApplicationSummary>) {
    setActing(true);
    setError(null);
    try {
      setApp(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-48 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (!app) {
    return <p className="text-red-600 text-sm">{error ?? "Application not found."}</p>;
  }

  if (app.isDraft) {
    navigate(`/portal/apply/${app.id}`, { replace: true });
    return null;
  }

  const currentIndex = TIMELINE.findIndex(t => t.status === app.status);
  const isTerminal   = TERMINAL_STATUSES.includes(app.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/portal" className="text-sm text-forest-700 hover:underline">← Back</Link>
        <span className="text-gray-300">|</span>
        <p className="text-xs text-gray-400 font-mono">Ref: {app.id.slice(0, 8).toUpperCase()}</p>
      </div>

      {/* Header */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
        <h1 className="text-base font-bold text-gray-800">
          {app.villageName ?? app.requestedLocationDescription ?? "Land application"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {app.landPurpose ?? "Land application"}
          {app.submittedAt && ` · Submitted ${new Date(app.submittedAt).toLocaleDateString()}`}
        </p>
        {app.decisionNotes && (
          <div className="mt-3 rounded-lg bg-forest-50 border border-forest-200 px-3 py-2 text-sm text-forest-800">
            <span className="font-medium">Council note: </span>{app.decisionNotes}
          </div>
        )}
      </div>

      <StatusBanner status={app.status} />

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Stand-offer actions */}
      {app.status === "stand_offered" && (
        <div className="rounded-2xl bg-teal-50 border border-teal-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-teal-800">A stand has been offered to you</p>
          <p className="text-sm text-teal-700">
            The council has allocated a stand for your application. Would you like to accept, request a viewing first, or decline?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void act(() => acceptOffer(apiFetch, app.id))}
              disabled={acting}
              className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800 transition-colors disabled:opacity-50"
            >
              Accept offer
            </button>
            <button
              onClick={() => void act(() => requestViewing(apiFetch, app.id))}
              disabled={acting}
              className="rounded-lg border border-teal-400 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 transition-colors disabled:opacity-50"
            >
              Request site visit
            </button>
            <button
              onClick={() => void act(() => rejectOffer(apiFetch, app.id))}
              disabled={acting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Decline offer
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!isTerminal && (
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">Application progress</h2>
          <div className="space-y-0">
            {TIMELINE.map((event, i) => {
              const done    = i <= currentIndex;
              const current = i === currentIndex;
              return (
                <div key={event.status} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-0.5 transition-colors ${
                      done ? event.colour : "bg-gray-200"
                    } ${current ? "ring-4 ring-offset-1 ring-forest-200" : ""}`} />
                    {i < TIMELINE.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[24px] transition-colors ${done && i < currentIndex ? "bg-forest-400" : "bg-gray-200"}`} />
                    )}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className={`text-sm font-medium ${done ? "text-gray-800" : "text-gray-400"}`}>{event.label}</p>
                    {current && <p className="text-xs text-gray-500 mt-0.5">{event.desc}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Withdraw */}
      {!isTerminal && app.status !== "active" && app.status !== "offer_accepted" && (
        <div className="text-center">
          <button
            onClick={() => {
              if (!confirm("Are you sure you want to withdraw this application? This cannot be undone.")) return;
              void act(() => withdrawApplication(apiFetch, app.id));
            }}
            disabled={acting}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            Withdraw application
          </button>
        </div>
      )}
    </div>
  );
}
