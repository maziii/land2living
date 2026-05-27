import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSync } from "../context/sync.js";

const APPLICATION_TYPES = [
  { value: "new_stand", label: "New stand application" },
  { value: "additional_stand", label: "Additional stand" },
  { value: "regularisation", label: "Regularisation" },
] as const;

type ApplicationType = (typeof APPLICATION_TYPES)[number]["value"];

export default function SubmitApplicationPage() {
  const navigate = useNavigate();
  const { enqueueItem } = useSync();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    applicantResidentId: "",
    applicationType: "new_stand" as ApplicationType,
    requestedLocationDescription: "",
    requestedSizeSquareMetres: "",
    householdSize: "1",
    reason: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        applicantResidentId: form.applicantResidentId,
        applicationType: form.applicationType,
        requestedLocationDescription: form.requestedLocationDescription,
        householdSize: Number(form.householdSize),
        reason: form.reason,
        ...(form.requestedSizeSquareMetres && {
          requestedSizeSquareMetres: Number(form.requestedSizeSquareMetres),
        }),
      };
      await enqueueItem("submit_application", payload);
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
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-forest-800 font-bold text-xl">Application queued</h2>
          <p className="text-forest-600 text-sm mt-2">Will submit when online</p>
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
        <h1 className="font-bold">Submit Application</h1>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-6 space-y-4 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <Field label="Resident ID (UUID) *">
          <input
            type="text"
            required
            value={form.applicantResidentId}
            onChange={(e) => set("applicantResidentId", e.target.value)}
            className={inputClass}
            placeholder="e.g. from the resident's profile"
          />
        </Field>

        <Field label="Application type *">
          <select
            value={form.applicationType}
            onChange={(e) => set("applicationType", e.target.value as ApplicationType)}
            className={inputClass}
          >
            {APPLICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Requested location *">
          <textarea
            required
            rows={3}
            value={form.requestedLocationDescription}
            onChange={(e) => set("requestedLocationDescription", e.target.value)}
            className={`${inputClass} resize-none`}
            placeholder="Describe the location e.g. 'North of the school, near the river'"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Household size *">
            <input
              type="number"
              required
              min={1}
              max={50}
              value={form.householdSize}
              onChange={(e) => set("householdSize", e.target.value)}
              className={inputClass}
              inputMode="numeric"
            />
          </Field>
          <Field label="Requested area (m²)">
            <input
              type="number"
              min={0}
              value={form.requestedSizeSquareMetres}
              onChange={(e) => set("requestedSizeSquareMetres", e.target.value)}
              className={inputClass}
              inputMode="numeric"
              placeholder="Optional"
            />
          </Field>
        </div>

        <Field label="Reason for application *">
          <textarea
            required
            rows={5}
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            className={`${inputClass} resize-none`}
            placeholder="Why is the applicant requesting this stand?"
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          {submitting ? "Saving…" : "Submit Application"}
        </button>
      </form>
    </div>
  );
}

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
