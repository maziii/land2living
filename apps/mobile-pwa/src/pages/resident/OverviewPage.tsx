import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchMyApplications, type Application } from "../../api/applications.js";
import { fetchMyBookings, type Booking } from "../../api/services.js";
import { fetchListings, type ListingSummary } from "../../api/resale.js";

const APPLICATION_STATUS_COLOR: Record<string, string> = {
  submitted:    "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved:     "bg-green-100 text-green-700",
  rejected:     "bg-red-100 text-red-700",
  deferred:     "bg-gray-100 text-gray-600",
  withdrawn:    "bg-gray-100 text-gray-400",
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  quote_requested: "bg-blue-100 text-blue-700",
  quoted:          "bg-amber-100 text-amber-700",
  accepted:        "bg-forest-100 text-forest-700",
  in_progress:     "bg-purple-100 text-purple-700",
  completed:       "bg-green-100 text-green-700",
  disputed:        "bg-red-100 text-red-700",
  cancelled:       "bg-gray-100 text-gray-400",
};

function formatZar(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}

export default function OverviewPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const userId = auth?.userId ?? "";

  const [applications, setApplications] = useState<Application[]>([]);
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [listings, setListings]           = useState<ListingSummary[]>([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    if (!userId) return;
    Promise.allSettled([
      fetchMyApplications(userId).then(r => setApplications(r.applications)),
      fetchMyBookings(userId).then(r => setBookings(r.bookings)),
      fetchListings({ page: 1, pageSize: 3, status: "live" }).then(r => setListings(r.listings)),
    ]).finally(() => setLoading(false));
  }, [userId]);

  const latestApp     = applications[0];
  const activeBooking = bookings.find(b => !["completed", "cancelled"].includes(b.status));

  return (
    <div className="px-4 py-5 space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-forest-900">Welcome back</h2>
        <p className="text-gray-500 text-sm mt-0.5">Here's what's happening on your account.</p>
      </div>

      {/* Status cards */}
      <div className="space-y-3">
        {/* Land application */}
        <button
          onClick={() => navigate("/resident/land")}
          className="w-full bg-white rounded-2xl shadow-sm border border-forest-100 p-4 text-left active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Land Application</p>
                {loading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : latestApp ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPLICATION_STATUS_COLOR[latestApp.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {latestApp.status.replace(/_/g, " ")}
                  </span>
                ) : (
                  <p className="text-xs text-gray-400">No application yet — tap to apply</p>
                )}
              </div>
            </div>
            <span className="text-gray-300 text-xl">›</span>
          </div>
        </button>

        {/* Services booking */}
        <button
          onClick={() => navigate(activeBooking ? "/resident/services" : "/resident/services")}
          className="w-full bg-white rounded-2xl shadow-sm border border-forest-100 p-4 text-left active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Services</p>
                {loading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : activeBooking ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BOOKING_STATUS_COLOR[activeBooking.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {activeBooking.category} · {activeBooking.status.replace(/_/g, " ")}
                  </span>
                ) : (
                  <p className="text-xs text-gray-400">Book a contractor or tradesperson</p>
                )}
              </div>
            </div>
            <span className="text-gray-300 text-xl">›</span>
          </div>
        </button>

        {/* Marketplace */}
        <button
          onClick={() => navigate("/resident/market")}
          className="w-full bg-white rounded-2xl shadow-sm border border-forest-100 p-4 text-left active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏡</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Land Market</p>
                {loading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : (
                  <p className="text-xs text-gray-400">{listings.length > 0 ? `${listings.length}+ live listings` : "No listings right now"}</p>
                )}
              </div>
            </div>
            <span className="text-gray-300 text-xl">›</span>
          </div>
        </button>
      </div>

      {/* Live listings preview */}
      {!loading && listings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 text-sm">Live listings</h3>
            <button onClick={() => navigate("/resident/market")} className="text-forest-600 text-xs font-medium">See all</button>
          </div>
          <div className="space-y-2">
            {listings.map(l => (
              <button
                key={l.id}
                onClick={() => navigate(`/resale/${l.id}`)}
                className="w-full bg-white rounded-xl border border-forest-100 p-3 text-left active:bg-forest-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{formatZar(l.askingPriceZar)}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{l.description}</p>
                  </div>
                  <span className="text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full ml-2 shrink-0">
                    {l.listingType.replace("_", " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
