import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, type ListingSummary, type ListingStatus, type ListingType } from "../../api/resale.js";

type Tab = "browse" | "mine";
type FilterType = "all" | "vacant_stand" | "built_property";

const STATUS_COLOR: Record<string, string> = {
  draft:                    "bg-gray-100 text-gray-600",
  pending_council_approval: "bg-amber-100 text-amber-700",
  live:                     "bg-emerald-100 text-emerald-700",
  under_offer:              "bg-blue-100 text-blue-700",
  transfer_pending:         "bg-purple-100 text-purple-700",
  transferred:              "bg-forest-100 text-forest-700",
  withdrawn:                "bg-gray-100 text-gray-400",
  expired:                  "bg-gray-100 text-gray-400",
};

const TYPE_COLORS: Record<string, string> = {
  residential: "bg-blue-100 text-blue-700",
  business:    "bg-purple-100 text-purple-700",
  farming:     "bg-green-100 text-green-700",
  community:   "bg-amber-100 text-amber-700",
};

const TYPE_LABEL: Record<string, string> = {
  residential: "Residential",
  business:    "Business",
  farming:     "Farming",
  community:   "Community",
};

function formatZar(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing, showStatus }: { listing: ListingSummary; showStatus: boolean }) {
  const navigate = useNavigate();
  const [imgIdx, setImgIdx] = useState(0);
  const hasPhotos = listing.photos.length > 0;
  const standTypeLabel = listing.standType ? (TYPE_LABEL[listing.standType] ?? listing.standType) : null;

  return (
    <button
      onClick={() => navigate(`/resale/${listing.id}`)}
      className="group w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-forest-300 active:scale-[0.99] transition-all"
    >
      {/* Photo area — same proportions as council StandCard */}
      <div className="relative h-44 bg-gray-100">
        {hasPhotos ? (
          <>
            <img
              src={listing.photos[imgIdx]}
              alt={listing.standAddress}
              className="w-full h-full object-cover"
            />
            {listing.photos.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {listing.photos.map((_, i) => (
                  <span
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setImgIdx(i); }}
                    className={`w-1.5 h-1.5 rounded-full transition-colors cursor-pointer ${i === imgIdx ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7l9-4 9 4v13H3V7z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20V12h6v8" />
            </svg>
            <span className="text-xs">No photos yet</span>
          </div>
        )}

        {/* Stand type badge (residential / business / etc) */}
        {standTypeLabel && (
          <span className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[listing.standType!] ?? "bg-gray-100 text-gray-600"}`}>
            {standTypeLabel}
          </span>
        )}

        {/* Negotiable badge */}
        {listing.negotiable && (
          <span className="absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Negotiable
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-2">
        {/* Address + price row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-forest-700 leading-snug line-clamp-2 flex-1">
            {listing.standAddress || listing.description}
          </p>
          <span className="text-sm font-bold text-forest-700 shrink-0">
            {formatZar(listing.askingPriceZar)}
          </span>
        </div>

        {/* Village + area row */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{listing.standVillage || "Communal land"}</span>
          </p>
          {listing.standAreaSqm && (
            <span className="text-xs text-gray-400 shrink-0">{listing.standAreaSqm.toLocaleString()} m²</span>
          )}
        </div>

        {/* Reference + listing type + status footer */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">
              {listing.standReference ?? listing.id.slice(0, 8).toUpperCase()}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              listing.listingType === "built_property" ? "bg-forest-100 text-forest-700" : "bg-terracotta-100 text-terracotta-700"
            }`}>
              {listing.listingType === "built_property" ? "Built" : "Vacant stand"}
            </span>
          </div>
          {showStatus && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[listing.status] ?? "bg-gray-100 text-gray-600"}`}>
              {listing.status.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <div className="h-44 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between gap-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-1/5" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState<Tab>("browse");
  const [filter, setFilter]     = useState<FilterType>("all");
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setListings([]);
  }, [tab, filter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = tab === "browse"
      ? { page, pageSize: 20, status: "live" as ListingStatus, ...(filter !== "all" && { listingType: filter as ListingType }) }
      : { page, pageSize: 20, ...(filter !== "all" && { listingType: filter as ListingType }) };
    fetchListings(params)
      .then(({ listings: data, total: t }) => {
        setListings(prev => page === 1 ? data : [...prev, ...data]);
        setTotal(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tab, filter, page]);

  const visibleCount = total;

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Property Market</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">
                {visibleCount} {tab === "browse" && filter !== "all" ? "matching" : "total"} in market
              </p>
            )}
          </div>
          <button
            onClick={() => navigate("/create-listing")}
            className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + List property
          </button>
        </div>

        {/* Browse / My Listings tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          {(["browse", "mine"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-forest-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {t === "browse" ? "Browse" : "My Listings"}
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2 pb-3 overflow-x-auto no-scrollbar">
          {(["all", "vacant_stand", "built_property"] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === f
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {f === "all" ? "All" : f === "vacant_stand" ? "Vacant stands" : "Built properties"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
        )}

        {/* Skeleton */}
        {loading && listings.length === 0 && (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && listings.length === 0 && (
          <div className="text-center py-20">
            <div className="w-full h-32 flex flex-col items-center justify-center text-gray-300 gap-2 mb-4">
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M3 7l9-4 9 4v13H3V7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M9 20V12h6v8" />
              </svg>
            </div>
            <p className="font-semibold text-gray-700 text-lg">
              {tab === "browse" ? "No properties listed" : "You have no listings yet"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {tab === "browse"
                ? "Check back soon — listings appear here after council approval."
                : "List your stand or property to connect with buyers."}
            </p>
            {tab === "mine" && (
              <button
                onClick={() => navigate("/create-listing")}
                className="mt-5 bg-forest-600 text-white text-sm font-semibold px-6 py-3 rounded-xl"
              >
                Create a listing
              </button>
            )}
          </div>
        )}

        {/* Cards — single column on mobile, 2 col on wider screens */}
        {listings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {listings.map(l => <ListingCard key={l.id} listing={l} showStatus={tab === "mine"} />)}
          </div>
        )}

        {loading && listings.length > 0 && (
          <div className="text-center py-4 text-gray-400 text-sm mt-4">Loading more…</div>
        )}

        {!loading && listings.length > 0 && listings.length < total && tab === "browse" && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full mt-4 py-3.5 border border-forest-300 text-forest-700 font-semibold text-sm rounded-xl bg-white"
          >
            Load more ({total - listings.length} remaining)
          </button>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
