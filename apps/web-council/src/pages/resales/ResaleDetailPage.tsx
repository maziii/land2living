import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchListing,
  approveListing,
  rejectListing,
  initiateTransfer,
  acceptOffer,
  rejectOffer,
  type ListingDetail,
  type OfferSummary,
} from "../../api/resale.js";
import { StatusBadge } from "../../components/StatusBadge.js";

function formatZar(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export function ResaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch, auth } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCouncil = auth?.claims.role === "council_secretary" || auth?.claims.role === "founder";

  useEffect(() => {
    if (!id) return;
    fetchListing(apiFetch, id)
      .then(setListing)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, id]);

  async function handleApprove() {
    if (!id || !window.confirm("Approve this listing and make it live?")) return;
    setSaving(true);
    try {
      const updated = await approveListing(apiFetch, id);
      setListing(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!id || !window.confirm("Reject this listing and return it to draft?")) return;
    setSaving(true);
    try {
      const updated = await rejectListing(apiFetch, id);
      setListing(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleInitiateTransfer() {
    if (!id || !window.confirm("Initiate the ownership transfer process?")) return;
    setSaving(true);
    try {
      const updated = await initiateTransfer(apiFetch, id);
      setListing(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptOffer(offer: OfferSummary) {
    if (!listing || !window.confirm(`Accept offer of ${formatZar(offer.offerAmountZar)}?`)) return;
    setSaving(true);
    try {
      const updated = await acceptOffer(apiFetch, offer.id);
      setListing(prev => prev ? { ...prev, offers: prev.offers.map(o => o.id === offer.id ? updated : o) } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRejectOffer(offer: OfferSummary) {
    if (!listing || !window.confirm("Reject this offer?")) return;
    setSaving(true);
    try {
      const updated = await rejectOffer(apiFetch, offer.id);
      setListing(prev => prev ? { ...prev, offers: prev.offers.map(o => o.id === offer.id ? updated : o) } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!listing) return <div className="p-6 text-gray-500">Not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/marketplace/resales" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Resale Listings
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{listing.listingType.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</h1>
            <p className="text-gray-500 text-sm mt-1 font-mono">{listing.id}</p>
          </div>
          <StatusBadge status={listing.status} />
        </div>

        <dl className="grid grid-cols-2 gap-5">
          <Field label="Asking price" value={<span className="text-lg font-semibold text-green-700">{formatZar(listing.askingPriceZar)}</span>} />
          <Field label="Negotiable" value={listing.negotiable ? "Yes" : "No"} />
          <Field label="Seller resident" value={<span className="font-mono text-xs">{listing.sellerResidentId}</span>} />
          <Field label="Stand" value={<span className="font-mono text-xs">{listing.standId}</span>} />
          <Field label="PTO" value={<span className="font-mono text-xs">{listing.ptoId}</span>} />
          <Field label="Expires" value={new Date(listing.expiresAt).toLocaleDateString()} />
          <div className="col-span-2">
            <Field label="Description" value={listing.description} />
          </div>
          <Field label="Listed" value={new Date(listing.createdAt).toLocaleString()} />
          <Field label="Last updated" value={new Date(listing.updatedAt).toLocaleString()} />
        </dl>
      </div>

      {/* Council actions */}
      {isCouncil && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Council Actions</h2>
          <div className="flex flex-wrap gap-3">
            {listing.status === "pending_council_approval" && (
              <>
                <button
                  onClick={() => void handleApprove()}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Approve listing
                </button>
                <button
                  onClick={() => void handleReject()}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Reject (return to draft)
                </button>
              </>
            )}
            {listing.status === "under_offer" && (
              <button
                onClick={() => void handleInitiateTransfer()}
                disabled={saving}
                className="px-4 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Initiate transfer
              </button>
            )}
            {["live", "draft", "withdrawn", "expired", "transfer_pending", "transferred"].includes(listing.status) && (
              <p className="text-sm text-gray-500 italic">No council actions available for status: {listing.status}</p>
            )}
          </div>
        </div>
      )}

      {/* Offers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Offers ({listing.offers.length})</h2>
        {listing.offers.length === 0 ? (
          <p className="text-sm text-gray-400">No offers yet</p>
        ) : (
          <div className="space-y-3">
            {listing.offers.map((offer) => (
              <div key={offer.id} className="border border-gray-100 rounded-lg p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{formatZar(offer.offerAmountZar)}</span>
                    <StatusBadge status={offer.status} />
                  </div>
                  <p className="text-xs text-gray-500 font-mono">{offer.buyerResidentId}</p>
                  <p className="text-xs text-gray-400">{new Date(offer.createdAt).toLocaleString()}</p>
                  {offer.notes && <p className="text-xs text-gray-600 italic">"{offer.notes}"</p>}
                </div>
                {offer.status === "submitted" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleAcceptOffer(offer)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => void handleRejectOffer(offer)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
