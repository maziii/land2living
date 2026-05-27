import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSync } from "../context/sync.js";

const LANGUAGES = [
  { value: "nde", label: "isiNdebele" },
  { value: "zu", label: "isiZulu" },
  { value: "xh", label: "isiXhosa" },
  { value: "af", label: "Afrikaans" },
  { value: "en", label: "English" },
  { value: "nso", label: "Sepedi" },
  { value: "ts", label: "Xitsonga" },
  { value: "tn", label: "Setswana" },
  { value: "ss", label: "siSwati" },
  { value: "ve", label: "Tshivenda" },
  { value: "nr", label: "isiNdebele (South)" },
];

export default function RegisterResidentPage() {
  const navigate = useNavigate();
  const { enqueueItem } = useSync();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    idNumber: "",
    firstName: "",
    lastName: "",
    phoneNumber: "+27",
    languagePreference: "nde",
    gender: "",
    dateOfBirth: "",
    whatsappNumber: "",
    notes: "",
    consentDataCapture: false,
    consentMarketing: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consentDataCapture) {
      setError("Resident must consent to data capture");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        idNumber: form.idNumber,
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber,
        languagePreference: form.languagePreference,
        consentDataCapture: true,
        consentMarketing: form.consentMarketing,
        ...(form.gender && { gender: form.gender }),
        ...(form.dateOfBirth && { dateOfBirth: form.dateOfBirth }),
        ...(form.whatsappNumber && { whatsappNumber: form.whatsappNumber }),
        ...(form.notes && { notes: form.notes }),
      };
      await enqueueItem("create_resident", payload);
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
          <h2 className="text-forest-800 font-bold text-xl">Resident saved</h2>
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
        <h1 className="font-bold">Register Resident</h1>
      </header>

      <form onSubmit={(e) => void handleSubmit(e)} className="px-4 py-6 space-y-4 pb-20">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <Field label="SA ID Number *">
          <input
            type="text"
            required
            maxLength={13}
            value={form.idNumber}
            onChange={(e) => set("idNumber", e.target.value)}
            className={inputClass}
            placeholder="13-digit ID number"
            inputMode="numeric"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name *">
            <input type="text" required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Last Name *">
            <input type="text" required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="Phone Number *">
          <input
            type="tel"
            required
            value={form.phoneNumber}
            onChange={(e) => set("phoneNumber", e.target.value)}
            className={inputClass}
            placeholder="+27821234567"
          />
        </Field>

        <Field label="Language *">
          <select value={form.languagePreference} onChange={(e) => set("languagePreference", e.target.value)} className={inputClass}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={inputClass}>
              <option value="">Unknown</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="X">Other</option>
            </select>
          </Field>
          <Field label="Date of Birth">
            <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label="WhatsApp Number">
          <input type="tel" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} className={inputClass} placeholder="+27821234567" />
        </Field>

        <Field label="Notes">
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-none`} rows={3} />
        </Field>

        <div className="bg-white rounded-xl p-4 space-y-3 border border-gray-200">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={form.consentDataCapture}
              onChange={(e) => set("consentDataCapture", e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-forest-600"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold">Consent to data capture *</span> — The resident agrees their personal information may be stored in the L2L register.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consentMarketing}
              onChange={(e) => set("consentMarketing", e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-forest-600"
            />
            <span className="text-sm text-gray-700">Consent to receive service updates and notifications</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          {submitting ? "Saving…" : "Save Resident"}
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
