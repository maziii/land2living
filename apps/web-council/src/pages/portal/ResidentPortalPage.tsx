import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchApplications, createDraft } from "../../api/applications.js";
import type { ApplicationSummary, ApplicationStatus } from "../../api/applications.js";
import { fetchResidentMe } from "../../api/residents.js";
import type { ResidentDetail } from "../../api/residents.js";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft:             "In progress",
  submitted:         "Submitted",
  under_review:      "Under review",
  approved:          "Approved",
  stand_offered:     "Stand offered",
  viewing_requested: "Viewing requested",
  offer_rejected:    "Offer rejected",
  offer_accepted:    "Offer accepted",
  active:            "Active",
  rejected:          "Rejected",
  deferred:          "Deferred",
  withdrawn:         "Withdrawn",
};

const STATUS_COLOURS: Record<ApplicationStatus, string> = {
  draft:             "bg-gray-100 text-gray-600",
  submitted:         "bg-blue-100 text-blue-700",
  under_review:      "bg-amber-100 text-amber-700",
  approved:          "bg-forest-100 text-forest-700",
  stand_offered:     "bg-teal-100 text-teal-700",
  viewing_requested: "bg-purple-100 text-purple-700",
  offer_rejected:    "bg-red-100 text-red-700",
  offer_accepted:    "bg-forest-100 text-forest-700",
  active:            "bg-forest-200 text-forest-800",
  rejected:          "bg-red-100 text-red-700",
  deferred:          "bg-orange-100 text-orange-700",
  withdrawn:         "bg-gray-100 text-gray-500",
};

export function ResidentPortalPage() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [me, appList] = await Promise.all([
        fetchResidentMe(apiFetch),
        fetchApplications(apiFetch, { pageSize: 50 }),
      ]);
      setResident(me);
      setApplications(appList.applications);
    } catch {
      setError("Could not load your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startApplication() {
    setStarting(true);
    try {
      const draft = await createDraft(apiFetch);
      navigate(`/portal/apply/${draft.id}`);
    } catch {
      setError("Could not start application. Please try again.");
      setStarting(false);
    }
  }

  const draftApp = applications.find(a => a.isDraft);
  const activeApps = applications.filter(a => !a.isDraft);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 rounded-2xl bg-gray-200" />
        <div className="h-32 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
        <h1 className="text-xl font-bold text-forest-800">
          Welcome{resident ? `, ${resident.firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your land applications with the {" "}
          <span className="font-medium text-forest-700">Ndebele Royal Council</span>.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Draft in progress */}
      {draftApp && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
          <p className="text-sm font-semibold text-amber-800 mb-1">Application in progress</p>
          <p className="text-sm text-amber-700 mb-3">
            You have an unfinished application. Continue where you left off.
          </p>
          <Link
            to={`/portal/apply/${draftApp.id}`}
            className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Continue application
          </Link>
        </div>
      )}

      {/* Start new CTA */}
      {!draftApp && activeApps.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-forest-200 bg-white p-8 text-center">
          <div className="mb-3 text-4xl">🌱</div>
          <h2 className="text-base font-semibold text-forest-800 mb-1">Apply for land</h2>
          <p className="text-sm text-gray-500 mb-5">
            Start your land application. You can save progress and come back any time.
          </p>
          <button
            onClick={() => void startApplication()}
            disabled={starting}
            className="rounded-lg bg-forest-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start application"}
          </button>
        </div>
      )}

      {!draftApp && activeApps.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => void startApplication()}
            disabled={starting}
            className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800 transition-colors disabled:opacity-50"
          >
            {starting ? "Starting…" : "+ New application"}
          </button>
        </div>
      )}

      {/* Applications list */}
      {activeApps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Your applications</h2>
          {activeApps.map(app => (
            <Link
              key={app.id}
              to={`/portal/applications/${app.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm border border-gray-100 hover:border-forest-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {app.villageName ?? app.requestedLocationDescription ?? "Land application"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {app.landPurpose
                      ? app.landPurpose.charAt(0).toUpperCase() + app.landPurpose.slice(1)
                      : "Land application"}
                    {" · "}
                    Ref: {app.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {app.submittedAt
                      ? `Submitted ${new Date(app.submittedAt).toLocaleDateString()}`
                      : `Started ${new Date(app.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[app.status]}`}>
                  {STATUS_LABELS[app.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
