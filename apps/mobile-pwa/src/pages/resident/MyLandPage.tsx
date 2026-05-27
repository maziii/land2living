import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchMyApplications, type ApplicationDraft } from "../../api/land-application.js";

const STATUS_COLOR: Record<string, string> = {
  draft:             "bg-gray-100 text-gray-500",
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
  withdrawn:         "bg-gray-100 text-gray-400",
};

const STATUS_LABEL: Record<string, string> = {
  draft:             "In progress — tap to continue",
  submitted:         "Submitted — awaiting review",
  under_review:      "Under review by council",
  approved:          "Approved — council is allocating a stand",
  stand_offered:     "Stand offered — tap to view and respond",
  viewing_requested: "Viewing requested — council will contact you",
  offer_rejected:    "Offer declined — council is finding another stand",
  offer_accepted:    "Stand accepted — visit council office to pay and sign",
  active:            "PTO active",
  rejected:          "Not approved",
  deferred:          "Deferred — council will follow up",
  withdrawn:         "Withdrawn",
};

function appTitle(app: ApplicationDraft): string {
  if (app.landPurpose) {
    const labels: Record<string, string> = {
      residential: "Residential stand",
      business:    "Business stand",
      farming:     "Farming land",
      community:   "Community land",
    };
    return labels[app.landPurpose] ?? app.landPurpose;
  }
  return "Land application";
}

function appSubtitle(app: ApplicationDraft): string {
  if (app.villageName) return app.villageName;
  if (app.siteDescription) return app.siteDescription;
  if (app.authorityId) return "Authority selected";
  return "Application in progress";
}

export default function MyLandPage() {
  const { auth } = useAuth();
  const navigate  = useNavigate();
  const userId    = auth?.userId ?? "";

  const [applications, setApplications] = useState<ApplicationDraft[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchMyApplications(userId)
      .then(r => setApplications(r.applications))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-forest-900">My Land</h2>
        <button
          onClick={() => navigate("/resident/apply")}
          className="bg-forest-600 text-white text-sm font-semibold px-4 py-2 rounded-xl active:bg-forest-700 transition-colors"
        >
          Apply
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
      )}

{loading && (
        <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
      )}

      {!loading && applications.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-medium text-gray-500">No applications yet</p>
          <p className="text-sm mt-1">Tap Apply to start your land application.</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">Your applications</h3>
          {applications.map(app => (
            <div
              key={app.id}
              onClick={() => {
                if (app.status === "draft") {
                  navigate(`/resident/apply/${app.id}`);
                } else {
                  navigate(`/resident/application/${app.id}`);
                }
              }}
              className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4 space-y-2 active:bg-forest-50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{appTitle(app)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{appSubtitle(app)}</p>
                </div>
                {app.status !== "draft" && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[app.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {app.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500">{STATUS_LABEL[app.status]}</p>

              {app.status === "draft" ? (
                <p className="text-xs text-forest-600 font-medium">Tap to continue →</p>
              ) : (
                <p className="text-xs text-gray-400">
                  {app.submittedAt
                    ? `Submitted ${new Date(app.submittedAt).toLocaleDateString("en-ZA")}`
                    : "Not yet submitted"}
                  {app.decidedAt && ` · Decided ${new Date(app.decidedAt).toLocaleDateString("en-ZA")}`}
                  <span className="text-forest-500 ml-2">View →</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
