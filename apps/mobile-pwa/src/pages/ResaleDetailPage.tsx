import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { fetchListing, submitListing, submitOffer, type ListingDetail } from "../api/resale.js";

function formatZar(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_council_approval: "bg-amber-100 text-amber-700",
  live: "bg-green-100 text-green-700",
  under_offer: "bg-blue-100 text-blue-700",
  transfer_pending: "bg-purple-100 text-purple-700",
  transferred: "bg-forest-100 text-forest-700",
  withdrawn: "bg-gray-100 text-gray-500",
  expired: "bg-gray-100 text-gray-400",
};

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white";

export default function ResaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Offer form state
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [buyerResidentId, setBuyerResidentId] = useState("");
  const [offerAmount, setOfferAmount] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchListing(id)
      .then(setListing)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit() {
    if (!id || !window.confirm("Submit this listing for council approval?")) return;
    setSaving(true);
    try {
      const updated = await submitListing(id);
      setListing(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const amount = Number(offerAmount);
    if (!amount || amount < 1) {
      setError("Offer amount must be a positive number");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitOffer(id, { buyerResidentId, offerAmountZar: amount });
      setShowOfferForm(false);
      setOfferAmount("");
      setBuyerResidentId("");
      // Refresh listing to show new offer
      const updated = await fetchListing(id);
      setListing(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit offer");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-forest-50 flex items-center justify-center text-gray-400">Loading…</div>
  );

  if (error && !listing) return (
    <div className="min-h-screen bg-forest-50">
      <header className="bg-forest-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-forest-300 hover:text-white">← Back</button>
        <h1 className="font-bold">Listing</h1>
      </header>
      <div className="p-4 text-red-600">{error}</div>
    </div>
  );

  if (!listing) return null;

  const statusClass = STATUS_BADGE[listing.status] ?? "bg-gray-100 text-gray-600";
  const isSeller = listing.sellerResidentId === auth?.userId;
  const canSubmit = isSeller && listing.status === "draft";
  const canOffer = listing.status === "live" && !isSeller;

  return (
    <div className="min-h-screen bg-forest-50">
      <header className="bg-forest-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-forest-300 hover:text-white">← Back</button>
        <h1 className="font-bold flex-1">Listing Detail</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusClass}`}>
          {listing.status.replace(/_/g, " ")}
        </span>
      </header>

      <main className="px-4 py-4 space-y-4 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-forest-100 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full font-medium">
              {listing.listingType.replace("_", " ")}
            </span>
            {listing.negotiable && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Negotiable</span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatZar(listing.askingPriceZar)}</p>
          <p className="text-gray-600 text-sm">{listing.description}</p>
          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <p>Listed: {new Date(listing.createdAt).toLocaleDateString()}</p>
            <p>Expires: {new Date(listing.expiresAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Submit for approval */}
        {canSubmit && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <p className="text-amber-800 text-sm font-medium">This listing is a draft.</p>
            <p className="text-amber-700 text-sm">Submit it for council approval to make it live.</p>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {saving ? "Submitting…" : "Submit for Approval"}
            </button>
          </div>
        )}

        {/* Make an offer */}
        {canOffer && !showOfferForm && (
          <button
            onClick={() => setShowOfferForm(true)}
            className="w-full bg-forest-600 hover:bg-forest-700 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            Make an Offer
          </button>
        )}

        {canOffer && showOfferForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-forest-100 p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Submit Offer</h2>
            <form onSubmit={(e) => void handleOffer(e)} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Resident ID (UUID) *</label>
                <input
                  type="text"
                  required
                  value={buyerResidentId}
                  onChange={(e) => setBuyerResidentId(e.target.value)}
                  className={inputClass}
                  placeholder="Your resident ID"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Offer amount (ZAR) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  placeholder={`e.g. ${listing.askingPriceZar}`}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {saving ? "Submitting…" : "Submit Offer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOfferForm(false)}
                  className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Offers (shown to seller) */}
        {isSeller && listing.offers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-forest-100 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Offers ({listing.offers.length})</h2>
            <div className="space-y-3">
              {listing.offers.map((offer) => (
                <div key={offer.id} className="border border-gray-100 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{formatZar(offer.offerAmountZar)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      offer.status === "accepted" ? "bg-green-100 text-green-700" :
                      offer.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {offer.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{new Date(offer.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              To accept or reject offers, use the council portal.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
