import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchQuoteResponses,
  submitManualResponse,
  selectSupplier,
  type QuoteResponseListResponse,
  type QuoteResponseItem,
} from "../../api/suppliers.js";
import { StatusBadge } from "../../components/StatusBadge.js";

function formatZar(amount: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(amount);
}

export function SupplierQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [data, setData] = useState<QuoteResponseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Manual entry form state
  const [showManual, setShowManual] = useState(false);
  const [manualSupplierId, setManualSupplierId] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualAvailability, setManualAvailability] = useState("");
  const [manualLeadDays, setManualLeadDays] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchQuoteResponses(apiFetch, id)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, id]);

  async function handleSelectSupplier(response: QuoteResponseItem) {
    if (!id || !data) return;
    setSelecting(response.id);
    setActionError(null);
    try {
      const updated = await selectSupplier(apiFetch, id, {
        supplierId: response.supplierId,
        responseId: response.id,
      });
      setData(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to select supplier");
    } finally {
      setSelecting(null);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await submitManualResponse(apiFetch, id, {
        supplierId: manualSupplierId,
        ...(manualAmount ? { quoteAmountZar: parseInt(manualAmount, 10) } : {}),
        ...(manualAvailability ? { availability: manualAvailability } : {}),
        ...(manualLeadDays ? { leadTimeDays: parseInt(manualLeadDays, 10) } : {}),
        ...(manualNotes ? { notes: manualNotes } : {}),
      });
      const updated = await fetchQuoteResponses(apiFetch, id);
      setData(updated);
      setShowManual(false);
      setManualSupplierId("");
      setManualAmount("");
      setManualAvailability("");
      setManualLeadDays("");
      setManualNotes("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  const isSelected = data.status === "selected";
  const lowestQuote = data.responses
    .filter((r) => r.quoteAmountZar != null)
    .sort((a, b) => (a.quoteAmountZar ?? 0) - (b.quoteAmountZar ?? 0))[0];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote Comparison</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{id}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {actionError}
        </div>
      )}

      {data.responses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No responses received yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Quote (ZAR)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Availability</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Lead (days)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Via</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.responses.map((r) => {
                const isLowest = r.id === lowestQuote?.id;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${isLowest ? "bg-green-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.supplierName}
                      {isLowest && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          lowest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{formatZar(r.quoteAmountZar)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.availability ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.leadTimeDays ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {r.receivedVia.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isSelected && (
                        <button
                          onClick={() => void handleSelectSupplier(r)}
                          disabled={selecting === r.id}
                          className="bg-forest-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-forest-700 disabled:opacity-50"
                        >
                          {selecting === r.id ? "Selecting…" : "Select"}
                        </button>
                      )}
                      {isSelected && (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isSelected && (
        <div>
          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="text-sm text-forest-600 hover:text-forest-800 font-medium"
            >
              + Add manual response
            </button>
          ) : (
            <form onSubmit={(e) => void handleManualSubmit(e)} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Enter response manually</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier ID *</label>
                  <input
                    required
                    value={manualSupplierId}
                    onChange={(e) => setManualSupplierId(e.target.value)}
                    placeholder="UUID"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quote amount (ZAR)</label>
                  <input
                    type="number"
                    min="1"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                  <input
                    value={manualAvailability}
                    onChange={(e) => setManualAvailability(e.target.value)}
                    placeholder="e.g. in_stock"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead time (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={manualLeadDays}
                    onChange={(e) => setManualLeadDays(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Phone call notes, verbatim quote, etc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-forest-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save response"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManual(false)}
                  className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
