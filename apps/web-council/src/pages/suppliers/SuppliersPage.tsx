import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchQuoteRequests,
  type QuoteRequestSummary,
} from "../../api/suppliers.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "receiving", label: "Receiving responses" },
  { value: "selected", label: "Supplier selected" },
];

export function SuppliersPage() {
  const { apiFetch } = useAuth();
  const [requests, setRequests] = useState<QuoteRequestSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchQuoteRequests(apiFetch, {
      page,
      ...(statusFilter ? { status: statusFilter } : {}),
    })
      .then(({ requests: data, total: t }) => {
        setRequests(data);
        setTotal(t);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, statusFilter]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Supplier Quote Requests</h1>
        <div className="flex gap-3">
          <Link
            to="/dashboard/marketplace/suppliers/sales"
            className="text-sm text-forest-600 hover:text-forest-800 font-medium"
          >
            Commission tracker →
          </Link>
          <Link
            to="/dashboard/marketplace/suppliers/new"
            className="bg-forest-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-forest-700"
          >
            New request
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading…</div>}
      {error && <div className="text-red-600 py-4">{error}</div>}

      {!loading && !error && requests.length === 0 && (
        <div className="text-gray-400 py-12 text-center">No quote requests found</div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Request ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Basket items</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Suppliers</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Responses</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-700">{r.basket.length} items</td>
                  <td className="px-4 py-3 text-gray-700">{r.dispatchedToSupplierIds.length}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${r.responseCount > 0 ? "text-green-700" : "text-gray-400"}`}>
                      {r.responseCount}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/dashboard/marketplace/suppliers/${r.id}`}
                      className="text-forest-600 hover:text-forest-800 font-medium"
                    >
                      Compare →
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
