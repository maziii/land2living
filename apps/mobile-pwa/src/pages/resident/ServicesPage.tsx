import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/auth.js";
import {
  SERVICE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  fetchProviders,
  fetchMyBookings,
  createBooking,
  acceptQuote,
  type ServiceCategory,
  type Provider,
  type Booking,
} from "../../api/services.js";

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

const inputClass =
  "w-full border border-gray-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white";

type View = "categories" | "providers" | "book" | "bookings";

export default function ServicesPage() {
  const { auth } = useAuth();
  const userId = auth?.userId ?? "";

  const [view, setView]                   = useState<View>("categories");
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  const [providers, setProviders]   = useState<Provider[]>([]);
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loadingP, setLoadingP]     = useState(false);
  const [loadingB, setLoadingB]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Booking form
  const [description, setDescription] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [saving, setSaving]           = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Load providers when category selected
  useEffect(() => {
    if (!selectedCategory) return;
    setLoadingP(true);
    setError(null);
    fetchProviders(selectedCategory)
      .then(r => setProviders(r.providers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoadingP(false));
  }, [selectedCategory]);

  // Load my bookings
  useEffect(() => {
    if (view !== "bookings" || !userId) return;
    setLoadingB(true);
    fetchMyBookings(userId)
      .then(r => setBookings(r.bookings))
      .catch(() => { /* silent */ })
      .finally(() => setLoadingB(false));
  }, [view, userId]);

  function selectCategory(cat: ServiceCategory) {
    setSelectedCategory(cat);
    setProviders([]);
    setView("providers");
  }

  function selectProvider(provider: Provider) {
    setSelectedProvider(provider);
    setDescription("");
    setRequestedDate("");
    setBookingSuccess(false);
    setView("book");
  }

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!selectedProvider || !selectedCategory) return;
    setSaving(true);
    setError(null);
    try {
      await createBooking({
        providerId: selectedProvider.id,
        category: selectedCategory,
        description,
        ...(requestedDate ? { requestedDate: new Date(requestedDate).toISOString() } : {}),
      });
      setBookingSuccess(true);
      setDescription("");
      setRequestedDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptQuote(bookingId: string) {
    try {
      const updated = await acceptQuote(bookingId);
      setBookings(prev => prev.map(b => b.id === bookingId ? updated : b));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          {view !== "categories" && (
            <button
              onClick={() => {
                if (view === "book") { setView("providers"); return; }
                if (view === "providers") { setView("categories"); setSelectedCategory(null); return; }
                setView("categories");
              }}
              className="text-forest-600 text-sm font-medium"
            >
              ← Back
            </button>
          )}
          {view === "bookings" && (
            <button onClick={() => setView("categories")} className="text-forest-600 text-sm font-medium">← Back</button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-forest-900">
            {view === "categories" && "Services"}
            {view === "providers" && (selectedCategory ? CATEGORY_LABELS[selectedCategory] : "Providers")}
            {view === "book" && `Book ${selectedProvider?.businessName ?? ""}`}
            {view === "bookings" && "My Bookings"}
          </h2>
          {view === "categories" && (
            <button
              onClick={() => setView("bookings")}
              className="text-forest-600 text-sm font-medium"
            >
              My bookings
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
      )}

      {/* ── Category grid ────────────────────────────────────────────────── */}
      {view === "categories" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-gray-500 mb-4">Choose a service to find verified contractors near you.</p>
          <div className="grid grid-cols-3 gap-3">
            {SERVICE_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                className="bg-white rounded-2xl border border-forest-100 shadow-sm p-3 flex flex-col items-center gap-1.5 active:bg-forest-50 transition-colors"
              >
                <span className="text-3xl">{CATEGORY_EMOJI[cat]}</span>
                <span className="text-xs font-medium text-gray-700 text-center leading-tight">{CATEGORY_LABELS[cat]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Provider list ────────────────────────────────────────────────── */}
      {view === "providers" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingP && (
            <div className="text-center py-8 text-gray-400 text-sm">Finding providers…</div>
          )}

          {!loadingP && providers.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">{selectedCategory ? CATEGORY_EMOJI[selectedCategory] : "🔍"}</div>
              <p className="font-medium text-gray-500">No verified providers for this service yet</p>
              <p className="text-sm mt-1">Check back soon or contact the council office.</p>
            </div>
          )}

          {providers.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 text-base">{p.businessName}</h3>
                    {p.verificationStatus === "verified" && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Verified</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.categories.slice(0, 4).map(cat => (
                      <span key={cat} className="text-xs bg-forest-50 text-forest-600 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => selectProvider(p)}
                className="mt-3 w-full bg-forest-600 hover:bg-forest-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Request a quote
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Booking form ─────────────────────────────────────────────────── */}
      {view === "book" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {bookingSuccess ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-gray-900">Request sent!</h3>
              <p className="text-gray-500 mt-2 text-sm">
                {selectedProvider?.businessName} will review your request and send a quote. We'll notify you when they respond.
              </p>
              <button
                onClick={() => { setView("bookings"); setBookingSuccess(false); }}
                className="mt-6 bg-forest-600 text-white font-semibold px-6 py-3 rounded-xl text-sm"
              >
                View my bookings
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleBook(e)} className="space-y-4">
              <div className="bg-forest-50 rounded-xl p-3 flex items-center gap-3">
                <span className="text-2xl">{selectedCategory ? CATEGORY_EMOJI[selectedCategory] : "🔧"}</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selectedProvider?.businessName}</p>
                  <p className="text-xs text-gray-500">{selectedCategory ? CATEGORY_LABELS[selectedCategory] : ""} service</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Describe what you need *
                </label>
                <textarea
                  required
                  minLength={10}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  className={inputClass}
                  placeholder="Describe the work needed as clearly as possible — size, location on your stand, any specific requirements…"
                />
                <p className="text-xs text-gray-400 mt-1">{description.length} / 2000</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred date (optional)
                </label>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={e => setRequestedDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={inputClass}
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                The provider will send you a quote. You only commit to payment after accepting the quote.
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-base"
              >
                {saving ? "Sending…" : "Send quote request"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── My bookings ──────────────────────────────────────────────────── */}
      {view === "bookings" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingB && (
            <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
          )}

          {!loadingB && bookings.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">🔧</div>
              <p className="font-medium text-gray-500">No bookings yet</p>
              <button
                onClick={() => setView("categories")}
                className="mt-4 bg-forest-600 text-white text-sm font-semibold px-6 py-3 rounded-xl"
              >
                Browse services
              </button>
            </div>
          )}

          {bookings.map(b => (
            <div key={b.id} className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{CATEGORY_EMOJI[b.category] ?? "🔧"}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm capitalize">
                      {CATEGORY_LABELS[b.category] ?? b.category}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-1">{b.description}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${BOOKING_STATUS_COLOR[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>

              {b.status === "quoted" && b.quoteAmountZar !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-amber-800 font-medium">Quote received: {formatZar(b.quoteAmountZar)}</p>
                  <button
                    onClick={() => void handleAcceptQuote(b.id)}
                    className="w-full bg-forest-600 text-white font-semibold py-2.5 rounded-xl text-sm"
                  >
                    Accept quote
                  </button>
                </div>
              )}

              {b.status === "completed" && b.customerRating === null && (
                <p className="text-xs text-gray-400">Rate this job through the council portal.</p>
              )}

              <p className="text-xs text-gray-400">
                {new Date(b.createdAt).toLocaleDateString("en-ZA")}
                {b.requestedDate && ` · Requested for ${new Date(b.requestedDate).toLocaleDateString("en-ZA")}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
