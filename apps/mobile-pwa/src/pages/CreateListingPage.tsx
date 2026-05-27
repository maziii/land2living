import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createListing, type ListingType } from "../api/resale.js";

const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: "built_property", label: "Built property (house / structure)" },
  { value: "vacant_stand", label: "Vacant stand (land only)" },
];

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    sellerResidentId: "",
    standId: "",
    ptoId: "",
    listingType: "built_property" as ListingType,
    askingPriceZar: "",
    description: "",
    negotiable: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(form.askingPriceZar);
    if (!price || price < 1) {
      setError("Asking price must be a positive number");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const listing = await createListing({
        sellerResidentId: form.sellerResidentId,
        standId: form.standId,
        ptoId: form.ptoId,
        listingType: form.listingType,
        askingPriceZar: price,
        description: form.description,
        negotiable: form.negotiable,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/resale/${listing.id}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-forest-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🏡</div>
          <h2 className="text-forest-800 font-bold text-xl">Listing created!</h2>
          <p className="text-forest-600 text-sm mt-2">Redirecting to your listing…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-forest-50">
      <header className="bg-forest-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-forest-300 hover:text-white">
          ← Back
        </button>
        <h1 className="font-bold">List My Stand</h1>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-6 space-y-4 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          You will need your Resident ID, Stand ID, and PTO ID. These can be found in your council records.
        </div>

        <Field label="Your Resident ID (UUID) *">
          <input
            type="text"
            required
            value={form.sellerResidentId}
            onChange={(e) => set("sellerResidentId", e.target.value)}
            className={inputClass}
            placeholder="e.g. a0000000-0000-0000-0000-000000000001"
          />
        </Field>

        <Field label="Stand ID (UUID) *">
          <input
            type="text"
            required
            value={form.standId}
            onChange={(e) => set("standId", e.target.value)}
            className={inputClass}
            placeholder="e.g. b0000000-0000-0000-0000-000000000001"
          />
        </Field>

        <Field label="PTO ID (UUID) *">
          <input
            type="text"
            required
            value={form.ptoId}
            onChange={(e) => set("ptoId", e.target.value)}
            className={inputClass}
            placeholder="e.g. c0000000-0000-0000-0000-000000000001"
          />
        </Field>

        <Field label="Listing type *">
          <select
            value={form.listingType}
            onChange={(e) => set("listingType", e.target.value as ListingType)}
            className={inputClass}
          >
            {LISTING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Asking price (ZAR) *">
          <input
            type="number"
            required
            min={1}
            value={form.askingPriceZar}
            onChange={(e) => set("askingPriceZar", e.target.value)}
            className={inputClass}
            inputMode="numeric"
            placeholder="e.g. 150000"
          />
        </Field>

        <Field label="Description *">
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={`${inputClass} resize-none`}
            placeholder="Describe the property: size, features, condition…"
          />
        </Field>

        <label className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={form.negotiable}
            onChange={(e) => set("negotiable", e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-forest-600 focus:ring-forest-500"
          />
          <span className="text-sm text-gray-700">Asking price is negotiable</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          {submitting ? "Creating…" : "Create Draft Listing"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your listing will be submitted for council approval before going live.
        </p>
      </form>
    </div>
  );
}
