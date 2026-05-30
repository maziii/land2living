import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchApplications, type ApplicationSummary } from "../../api/applications.js";
import { fetchStands } from "../../api/stands.js";
import { StatusBadge } from "../../components/StatusBadge.js";

interface Stat { label: string; value: number | string; sub?: string; to: string; }

function StatCard({ label, value, sub, to }: Stat) {
  return (
    <Link to={to} className="group block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-forest-300 hover:shadow-md transition-all">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 group-hover:text-forest-700 transition-colors">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Link>
  );
}

const NEEDS_ACTION_STATUSES = new Set(["submitted", "under_review", "offer_accepted"]);
const STATUS_LABEL: Record<string, string> = {
  submitted:         "Awaiting acknowledgement",
  under_review:      "Under review — decision needed",
  approved:          "Approved — stand not yet offered",
  offer_accepted:    "Stand accepted — awaiting visit",
  viewing_requested: "Viewing requested",
  offer_rejected:    "Stand declined — re-offer needed",
};

export function LandDashboardPage() {
  const { apiFetch } = useAuth();

  const [totalStands,    setTotalStands]    = useState<number | null>(null);
  const [totalActive,    setTotalActive]    = useState<number | null>(null);
  const [totalPending,   setTotalPending]   = useState<number | null>(null);
  const [totalReview,    setTotalReview]    = useState<number | null>(null);
  const [actionItems,    setActionItems]    = useState<ApplicationSummary[]>([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    const canSee = (status: string) =>
      fetchApplications(apiFetch, { statuses: [status as ApplicationSummary["status"]], pageSize: 1 });

    Promise.all([
      fetchStands(apiFetch, { pageSize: 1, availableOnly: true }),
      canSee("active"),
      canSee("submitted"),
      canSee("under_review"),
      // Fetch recent applications needing action (broader query)
      fetchApplications(apiFetch, { pageSize: 20 }),
    ])
      .then(([stands, active, pending, review, all]) => {
        setTotalStands(stands.total);
        setTotalActive(active.total);
        setTotalPending(pending.total);
        setTotalReview(review.total);
        setActionItems(
          all.applications.filter(a => NEEDS_ACTION_STATUSES.has(a.status)).slice(0, 8),
        );
      })
      .finally(() => setLoading(false));
  }, [apiFetch]);

  function applicantName(a: ApplicationSummary) {
    if (a.applicantFirstName || a.applicantLastName)
      return [a.applicantFirstName, a.applicantLastName].filter(Boolean).join(" ");
    return `Ref ${a.id.slice(0, 6).toUpperCase()}`;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Land Administration</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of the land register and application pipeline</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Stands in register"
              value={totalStands ?? "—"}
              sub="Total registered stands"
              to="/dashboard/land/available"
            />
            <StatCard
              label="Active PTOs"
              value={totalActive ?? "—"}
              sub="Payment received & signed"
              to="/dashboard/land/allocated"
            />
            <StatCard
              label="Awaiting review"
              value={totalPending ?? "—"}
              sub="Submitted, not yet acknowledged"
              to="/dashboard/land/applications"
            />
            <StatCard
              label="Under review"
              value={totalReview ?? "—"}
              sub="Council currently processing"
              to="/dashboard/land/applications"
            />
          </div>

          {/* Quick actions */}
          <div className="flex gap-3 flex-wrap">
            <Link
              to="/dashboard/land/available/new"
              className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add stand
            </Link>
            <Link
              to="/dashboard/land/applications"
              className="border border-forest-300 text-forest-700 hover:bg-forest-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              View all applications
            </Link>
          </div>

          {/* Needs action */}
          {actionItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Needs your attention</h2>
                <p className="text-xs text-gray-400 mt-0.5">Applications waiting for a council action</p>
              </div>
              <div className="divide-y divide-gray-50">
                {actionItems.map(a => (
                  <Link
                    key={a.id}
                    to={`/dashboard/land/applications/${a.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{applicantName(a)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {STATUS_LABEL[a.status] ?? a.status.replace(/_/g, " ")}
                        {a.villageName ? ` · ${a.villageName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={a.status} />
                      <span className="text-gray-300 text-xs">›</span>
                    </div>
                  </Link>
                ))}
              </div>
              {actionItems.length === 8 && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <Link to="/dashboard/land/applications" className="text-xs text-forest-600 hover:underline">
                    View all applications →
                  </Link>
                </div>
              )}
            </div>
          )}

          {actionItems.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <p className="text-green-800 font-medium text-sm">All caught up</p>
              <p className="text-green-600 text-xs mt-1">No applications are waiting for a council action right now.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
