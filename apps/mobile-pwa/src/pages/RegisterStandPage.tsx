import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSync } from "../context/sync.js";

export default function RegisterStandPage() {
  const navigate = useNavigate();
  const { enqueueItem } = useSync();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [form, setForm] = useState({
    localReference: "",
    gpsLatitude: "",
    gpsLongitude: "",
    addressDescription: "",
    villageOrSection: "",
    areaSquareMetres: "",
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function captureGps() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this device");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("gpsLatitude", pos.coords.latitude.toFixed(6));
        set("gpsLongitude", pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
        setError(null);
      },
      (err) => {
        setGpsLoading(false);
        setError(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gpsLatitude || !form.gpsLongitude) {
      setError("GPS coordinates are required — tap 'Use my location'");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        gpsLatitude: parseFloat(form.gpsLatitude),
        gpsLongitude: parseFloat(form.gpsLongitude),
        addressDescription: form.addressDescription,
        villageOrSection: form.villageOrSection,
        ...(form.localReference && { localReference: form.localReference }),
        ...(form.areaSquareMetres && { areaSquareMetres: parseFloat(form.areaSquareMetres) }),
        ...(form.notes && { notes: form.notes }),
      };
      await enqueueItem("create_stand", payload);
      setSuccess(true);
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-forest-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-forest-800 font-bold text-xl">Stand saved</h2>
          <p className="text-forest-600 text-sm mt-2">Will sync when online</p>
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
        <h1 className="font-bold">Register Stand</h1>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-6 space-y-4 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {/* GPS capture */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">GPS Coordinates *</p>
          <button
            type="button"
            onClick={captureGps}
            disabled={gpsLoading}
            className="w-full bg-forest-100 hover:bg-forest-200 text-forest-700 font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
          >
            {gpsLoading ? "Getting location…" : "📍 Use my location"}
          </button>
          {form.gpsLatitude && (
            <p className="mt-2 text-sm text-forest-700 text-center">
              {form.gpsLatitude}, {form.gpsLongitude}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                value={form.gpsLatitude}
                onChange={(e) => set("gpsLatitude", e.target.value)}
                className={inputClass}
                placeholder="-25.746"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                value={form.gpsLongitude}
                onChange={(e) => set("gpsLongitude", e.target.value)}
                className={inputClass}
                placeholder="28.188"
              />
            </div>
          </div>
        </div>

        <Field label="Address Description *">
          <textarea
            required
            value={form.addressDescription}
            onChange={(e) => set("addressDescription", e.target.value)}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Describe the location in plain language (e.g. next to the mango tree near the main road)"
          />
        </Field>

        <Field label="Village / Section *">
          <input
            type="text"
            required
            value={form.villageOrSection}
            onChange={(e) => set("villageOrSection", e.target.value)}
            className={inputClass}
            placeholder="Section A"
          />
        </Field>

        <Field label="Local Reference (optional)">
          <input type="text" value={form.localReference} onChange={(e) => set("localReference", e.target.value)} className={inputClass} placeholder="Council's existing stand number" />
        </Field>

        <Field label="Area (m²) (optional)">
          <input type="number" min="0" step="any" value={form.areaSquareMetres} onChange={(e) => set("areaSquareMetres", e.target.value)} className={inputClass} placeholder="450" />
        </Field>

        <Field label="Notes (optional)">
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-none`} rows={3} />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          {submitting ? "Saving…" : "Save Stand"}
        </button>
      </form>
    </div>
  );
}

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
