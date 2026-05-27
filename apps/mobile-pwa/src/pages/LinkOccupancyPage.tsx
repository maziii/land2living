import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSync } from "../context/sync.js";

export default function LinkOccupancyPage() {
  const navigate = useNavigate();
  const { enqueueItem } = useSync();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    standId: "",
    residentId: "",
    relationship: "primary_occupant",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await enqueueItem("link_occupancy", {
        standId: form.standId,
        residentId: form.residentId,
        relationship: form.relationship,
      });
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
          <h2 className="text-forest-800 font-bold text-xl">Link saved</h2>
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
        <h1 className="font-bold">Link Resident to Stand</h1>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-amber-700 text-sm">
            Enter the IDs from previously registered records. Make sure both exist in the system before syncing.
          </p>
        </div>

        <Field label="Stand ID *">
          <input
            type="text"
            required
            value={form.standId}
            onChange={(e) => set("standId", e.target.value)}
            className={inputClass}
            placeholder="Stand UUID"
          />
        </Field>

        <Field label="Resident ID *">
          <input
            type="text"
            required
            value={form.residentId}
            onChange={(e) => set("residentId", e.target.value)}
            className={inputClass}
            placeholder="Resident UUID"
          />
        </Field>

        <Field label="Relationship *">
          <select value={form.relationship} onChange={(e) => set("relationship", e.target.value)} className={inputClass}>
            <option value="primary_occupant">Primary Occupant</option>
            <option value="household_member">Household Member</option>
            <option value="historic_owner">Historic Owner</option>
          </select>
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          {submitting ? "Saving…" : "Save Link"}
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
