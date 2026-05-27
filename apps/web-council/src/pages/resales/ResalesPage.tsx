import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchListings,
  type ListingSummary,
  type ListingStatus,
} from "../../api/resale.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";

const STATUS_OPTIONS: { value: ListingStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending_council_approval", label: "Pending approval" },
  { value: "live", label: "Live" },
  { value: "under_offer", label: "Under offer" },
  { value: "transfer_pending", label: "Transfer pending" },
  { value: "transferred", label: "Transferred" },
  { value: "draft", label: "Draft" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
];

function formatZar(cents: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(cents);
}

export function ResalesPage() {
  const { apiFetch } = useAuth();
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchListings(apiFetch, {
      page,
      pageSize: 20,
      ...(statusFilter && { status: statusFilter }),
    })
      .then(({ listings: data, total: t }) => {
        setListings(data);
        setTotal(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, statusFilter]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Resale Listings</h1>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ListingStatus | ""); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading…</div>}
      {error && <div className="text-red-600 py-4">{error}</div>}

      {!loading && !error && listings.length === 0 && (
        <div className="text-gray-400 py-12 text-center">No listings found</div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stand</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Asking price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Listed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listings.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{l.standId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-700">{l.listingType.replace("_", " ")}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatZar(l.askingPriceZar)}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/dashboard/marketplace/resales/${l.id}`}
                      className="text-forest-600 hover:text-forest-800 font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
      )}
    </div>
  );
}
