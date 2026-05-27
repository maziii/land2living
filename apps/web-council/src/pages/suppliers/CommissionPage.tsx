import { useEffect, useState } from "react";
import { useAuth } from "../../context/auth.js";
import { fetchSales, generateInvoice, recordPayment, type SaleSummary } from "../../api/suppliers.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";

function formatZar(amount: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(amount);
}

export function CommissionPage() {
  const { apiFetch } = useAuth();
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSales(apiFetch, { page, ...(statusFilter ? { status: statusFilter } : {}) })
      .then(({ sales: data, total: t, totalCommissionOwed }) => {
        setSales(data);
        setTotal(t);
        setTotalOwed(totalCommissionOwed);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, statusFilter]);

  async function handleInvoice(saleId: string) {
    setActing(saleId);
    setActionErrors((prev) => { const n = { ...prev }; delete n[saleId]; return n; });
    try {
      const updated = await generateInvoice(apiFetch, saleId);
      setSales((prev) => prev.map((s) => s.id === saleId ? updated : s));
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [saleId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setActing(null);
    }
  }

  async function handlePayment(saleId: string) {
    setActing(saleId);
    setActionErrors((prev) => { const n = { ...prev }; delete n[saleId]; return n; });
    try {
      const updated = await recordPayment(apiFetch, saleId);
      setSales((prev) => prev.map((s) => s.id === saleId ? updated : s));
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [saleId]: err instanceof Error ? err.message : "Failed" }));
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Commission Tracker</h1>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total owed</div>
          <div className="text-xl font-bold text-forest-700">{formatZar(totalOwed)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">All statuses</option>
          <option value="pending_invoice">Pending invoice</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading…</div>}
      {error && <div className="text-red-600 py-4">{error}</div>}

      {!loading && !error && sales.length === 0 && (
        <div className="text-gray-400 py-12 text-center">No sales recorded yet</div>
      )}

      {!loading && !error && sales.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sale amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Commission</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rate</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.supplierName}</td>
                  <td className="px-4 py-3 text-gray-700">{formatZar(s.fulfilledAmountZar)}</td>
                  <td className="px-4 py-3 font-medium text-forest-700">{formatZar(s.commissionAmountZar)}</td>
                  <td className="px-4 py-3 text-gray-500">{(s.commissionRateBasisPoints / 100).toFixed(1)}%</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right space-y-1">
                    {actionErrors[s.id] && (
                      <div className="text-xs text-red-600 mb-1">{actionErrors[s.id]}</div>
                    )}
                    {s.status === "pending_invoice" && (
                      <button
                        onClick={() => void handleInvoice(s.id)}
                        disabled={acting === s.id}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {acting === s.id ? "…" : "Invoice"}
                      </button>
                    )}
                    {s.status === "invoiced" && (
                      <button
                        onClick={() => void handlePayment(s.id)}
                        disabled={acting === s.id}
                        className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {acting === s.id ? "…" : "Mark paid"}
                      </button>
                    )}
                    {s.status === "paid" && (
                      <span className="text-xs text-gray-400">
                        Paid {s.paidAt ? new Date(s.paidAt).toLocaleDateString() : ""}
                      </span>
                    )}
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
