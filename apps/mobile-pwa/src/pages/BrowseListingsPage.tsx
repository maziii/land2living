import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, type ListingSummary } from "../api/resale.js";

function formatZar(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}

export default function BrowseListingsPage() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchListings({ page, pageSize: 20, status: "live" })
      .then(({ listings: data, total: t }) => {
        setListings(prev => page === 1 ? data : [...prev, ...data]);
        setTotal(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="min-h-screen bg-forest-50">
      <header className="bg-forest-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-forest-300 hover:text-white">
          ← Back
        </button>
        <div>
          <h1 className="font-bold">Browse Listings</h1>
          <p className="text-forest-300 text-xs">{total} live listings</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {!loading && listings.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">🏡</div>
            <p>No live listings at this time</p>
          </div>
        )}

        {listings.map((listing) => (
          <button
            key={listing.id}
            onClick={() => navigate(`/resale/${listing.id}`)}
            className="w-full bg-white rounded-2xl shadow-sm p-4 border border-forest-100 active:bg-forest-50 transition-colors text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full font-medium">
                    {listing.listingType.replace("_", " ")}
                  </span>
                  {listing.negotiable && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Negotiable</span>
                  )}
                </div>
                <p className="font-semibold text-gray-900 text-lg">{formatZar(listing.askingPriceZar)}</p>
                <p className="text-gray-500 text-sm mt-1 line-clamp-2">{listing.description}</p>
              </div>
              <div className="text-gray-300 text-xl">›</div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Listed {new Date(listing.createdAt).toLocaleDateString()} · Expires {new Date(listing.expiresAt).toLocaleDateString()}
            </p>
          </button>
        ))}

        {loading && (
          <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
        )}

        {!loading && listings.length < total && (
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full py-3 text-forest-600 font-medium text-sm"
          >
            Load more ({total - listings.length} remaining)
          </button>
        )}
      </main>
    </div>
  );
}
