import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, type ListingSummary, type ListingStatus } from "../../api/resale.js";

type Tab = "browse" | "mine";

const STATUS_COLOR: Record<string, string> = {
  draft:                    "bg-gray-100 text-gray-600",
  pending_council_approval: "bg-amber-100 text-amber-700",
  live:                     "bg-green-100 text-green-700",
  under_offer:              "bg-blue-100 text-blue-700",
  transfer_pending:         "bg-purple-100 text-purple-700",
  transferred:              "bg-forest-100 text-forest-700",
  withdrawn:                "bg-gray-100 text-gray-400",
  expired:                  "bg-gray-100 text-gray-400",
};

function formatZar(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}

type FilterType = "all" | "vacant_stand" | "built_property";

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [tab, setTab]         = useState<Tab>("browse");
  const [filter, setFilter]   = useState<FilterType>("all");
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setListings([]);
  }, [tab, filter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = tab === "browse"
      ? { page, pageSize: 20, status: "live" as ListingStatus }
      : { page, pageSize: 20 };
    fetchListings(params)
      .then(({ listings: data, total: t }) => {
        const filtered = filter === "all" ? data : data.filter(l => l.listingType === filter);
        setListings(prev => page === 1 ? filtered : [...prev, ...filtered]);
        setTotal(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tab, filter, page]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0">
        <h2 className="text-xl font-bold text-forest-900 mb-3">Land Market</h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(["browse", "mine"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-forest-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {t === "browse" ? "Browse listings" : "My listings"}
            </button>
          ))}
        </div>

        {/* Type filter (browse only) */}
        {tab === "browse" && (
          <div className="flex gap-2 mt-3 pb-3 overflow-x-auto no-scrollbar">
            {(["all", "vacant_stand", "built_property"] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === f
                    ? "bg-forest-600 text-white border-forest-600"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                {f === "all" ? "All" : f === "vacant_stand" ? "Vacant stand" : "Built property"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        {!loading && listings.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🏡</div>
            <p className="font-medium text-gray-500">
              {tab === "browse" ? "No live listings right now" : "You have no listings yet"}
            </p>
            {tab === "mine" && (
              <button
                onClick={() => navigate("/create-listing")}
                className="mt-4 bg-forest-600 text-white text-sm font-semibold px-6 py-3 rounded-xl"
              >
                Create a listing
              </button>
            )}
          </div>
        )}

        {listings.map(l => (
          <button
            key={l.id}
            onClick={() => navigate(`/resale/${l.id}`)}
            className="w-full bg-white rounded-2xl shadow-sm border border-forest-100 p-4 text-left active:bg-forest-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full font-medium">
                    {l.listingType === "vacant_stand" ? "Vacant stand" : "Built property"}
                  </span>
                  {l.negotiable && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Negotiable</span>
                  )}
                  {tab === "mine" && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[l.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {l.status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <p className="font-bold text-gray-900 text-lg">{formatZar(l.askingPriceZar)}</p>
                <p className="text-gray-500 text-sm mt-1 line-clamp-2">{l.description}</p>
              </div>
              <span className="text-gray-300 text-xl shrink-0">›</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Listed {new Date(l.createdAt).toLocaleDateString("en-ZA")} ·
              Expires {new Date(l.expiresAt).toLocaleDateString("en-ZA")}
            </p>
          </button>
        ))}

        {loading && (
          <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
        )}

        {!loading && listings.length < total && tab === "browse" && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full py-3 text-forest-600 font-medium text-sm"
          >
            Load more ({total - listings.length} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
