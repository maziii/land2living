import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchApplication, updateWizardStep, submitDraftApplication } from "../../api/applications.js";
import type { ApplicationSummary } from "../../api/applications.js";
import { fetchResidentMe } from "../../api/residents.js";
import type { ResidentDetail } from "../../api/residents.js";

const STEPS = ["Your details", "Location", "Land use", "Your background", "Review & submit"];
const LAND_PURPOSES = [
  { value: "residential", label: "Residential", desc: "Build a home" },
  { value: "business",    label: "Business",    desc: "Commercial or trade" },
  { value: "farming",     label: "Farming",     desc: "Agricultural use" },
  { value: "community",   label: "Community",   desc: "School, church, garden" },
] as const;

type LandPurpose = "residential" | "business" | "farming" | "community";

interface FormState {
  firstName:   string;
  lastName:    string;
  phone:       string;
  villageName: string;
  siteDesc:    string;
  purpose:     LandPurpose | "";
  household:   string;
  hasExistingLand:         boolean | null;
  existingLandDesc:        string;
  hasPreviousApp:          boolean | null;
  previousAppRef:          string;
  hasDispute:              boolean | null;
  disputeDesc:             string;
  consentTerms:            boolean;
  consentPopia:            boolean;
}

function emptyForm(): FormState {
  return {
    firstName: "", lastName: "", phone: "", villageName: "", siteDesc: "",
    purpose: "", household: "1",
    hasExistingLand: null, existingLandDesc: "",
    hasPreviousApp: null, previousAppRef: "",
    hasDispute: null, disputeDesc: "",
    consentTerms: false, consentPopia: false,
  };
}

function prefillFromResident(resident: ResidentDetail): Partial<FormState> {
  return {
    firstName: resident.firstName,
    lastName:  resident.lastName,
    phone:     resident.phoneNumber,
  };
}

function prefillFromApp(app: ApplicationSummary): Partial<FormState> {
  return {
    ...(app.applicantFirstName  && { firstName:   app.applicantFirstName }),
    ...(app.applicantLastName   && { lastName:    app.applicantLastName }),
    ...(app.applicantPhone      && { phone:       app.applicantPhone }),
    ...(app.villageName         && { villageName: app.villageName }),
    ...(app.siteDescription     && { siteDesc:    app.siteDescription }),
    ...(app.landPurpose         && { purpose:     app.landPurpose as LandPurpose }),
    ...(app.householdSize       && { household:   String(app.householdSize) }),
    ...(app.hasExistingLand    !== null && app.hasExistingLand    !== undefined && { hasExistingLand:  app.hasExistingLand }),
    ...(app.existingLandDescription && { existingLandDesc: app.existingLandDescription }),
    ...(app.hasPreviousApplication !== null && app.hasPreviousApplication !== undefined && { hasPreviousApp: app.hasPreviousApplication }),
    ...(app.previousApplicationRef  && { previousAppRef: app.previousApplicationRef }),
    ...(app.hasDispute         !== null && app.hasDispute         !== undefined && { hasDispute:  app.hasDispute }),
    ...(app.disputeDescription  && { disputeDesc:  app.disputeDescription }),
  };
}

function RadioGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="flex gap-3">
        {([true, false] as const).map(opt => (
          <label key={String(opt)} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="text-forest-600 focus:ring-forest-500"
            />
            <span className="text-sm">{opt ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ApplicationWizardPage() {
  const { id } = useParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const [app, setApp] = useState<ApplicationSummary | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [id]);

  async function load() {
    if (!id) return;
    try {
      const [application, resident] = await Promise.all([
        fetchApplication(apiFetch, id),
        fetchResidentMe(apiFetch),
      ]);
      setApp(application);
      const base = { ...emptyForm(), ...prefillFromResident(resident), ...prefillFromApp(application) };
      setForm(base);
      // Restore to the furthest saved step
      if (application.wizardStep !== null && application.wizardStep > 0) {
        const savedStep = Math.min(Math.floor(application.wizardStep / 4), STEPS.length - 1);
        setStep(savedStep);
      }
    } catch {
      setError("Could not load your application.");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!form.firstName.trim()) return "First name is required";
      if (!form.lastName.trim())  return "Last name is required";
      if (!form.phone.trim())     return "Phone number is required";
    }
    if (step === 1) {
      if (!form.villageName.trim()) return "Please select or enter your village";
    }
    if (step === 2) {
      if (!form.purpose) return "Please select a land use purpose";
      if (!form.household || Number(form.household) < 1) return "Household size must be at least 1";
    }
    if (step === 3) {
      if (form.hasExistingLand === null)  return "Please answer whether you have existing land";
      if (form.hasPreviousApp  === null)  return "Please answer whether you have a previous application";
      if (form.hasDispute      === null)  return "Please answer whether you have any disputes";
    }
    if (step === 4) {
      if (!form.consentPopia) return "POPIA consent is required";
      if (!form.consentTerms) return "You must accept the terms";
    }
    return null;
  }

  function stepToWizardData(s: number): Parameters<typeof updateWizardStep>[2] {
    if (s === 0) return {
      wizardStep: 4,
      applicantFirstName: form.firstName.trim(),
      applicantLastName:  form.lastName.trim(),
      applicantPhone:     form.phone.trim(),
    };
    if (s === 1) return {
      wizardStep: 9,
      ...(form.villageName.trim() && { villageName:     form.villageName.trim() }),
      ...(form.siteDesc.trim()    && { siteDescription: form.siteDesc.trim() }),
    };
    if (s === 2) return {
      wizardStep: 8,
      ...(form.purpose             && { landPurpose:   form.purpose as LandPurpose }),
      ...(Number(form.household)   && { householdSize: Number(form.household) }),
    };
    if (s === 3) return {
      wizardStep: 12,
      ...(form.hasExistingLand  !== null && { hasExistingLand:         form.hasExistingLand }),
      ...(form.existingLandDesc          && { existingLandDescription: form.existingLandDesc }),
      ...(form.hasPreviousApp   !== null && { hasPreviousApplication:  form.hasPreviousApp }),
      ...(form.previousAppRef            && { previousApplicationRef:  form.previousAppRef }),
      ...(form.hasDispute       !== null && { hasDispute:              form.hasDispute }),
      ...(form.disputeDesc               && { disputeDescription:      form.disputeDesc }),
    };
    // step 4 — review / consent — no intermediate save; submit directly
    return { wizardStep: 15, consentPopia: form.consentPopia, consentTerms: form.consentTerms };
  }

  async function saveStep(s: number) {
    if (!id) return;
    await updateWizardStep(apiFetch, id, stepToWizardData(s));
  }

  async function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      await saveStep(step);
      setStep(s => s + 1);
    } catch {
      setError("Could not save your progress. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    try {
      await saveStep(4);
      await submitDraftApplication(apiFetch, id!);
      navigate(`/portal/applications/${id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 rounded-2xl bg-gray-200" />
        <div className="h-64 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (!app) {
    return <p className="text-red-600 text-sm">{error ?? "Application not found."}</p>;
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500";
  const textareaCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 min-h-[80px] resize-none";

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i < step  ? "bg-forest-600 text-white"
                : i === step ? "bg-forest-700 text-white ring-4 ring-forest-200"
                : "bg-gray-200 text-gray-500"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <p className={`text-xs mt-1 font-medium text-center leading-tight ${i === step ? "text-forest-700" : "text-gray-400"}`}>
                {label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-5 transition-colors ${i < step ? "bg-forest-500" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
        {/* Step 0 — Your details */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Your details</h2>
            <p className="text-sm text-gray-500">We've pre-filled this from your profile. Correct anything if needed.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name <span className="text-red-500">*</span></label>
                <input type="text" value={form.firstName} onChange={e => set("firstName", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name <span className="text-red-500">*</span></label>
                <input type="text" value={form.lastName} onChange={e => set("lastName", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number <span className="text-red-500">*</span></label>
              <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} />
            </div>
          </div>
        )}

        {/* Step 1 — Location */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Location</h2>
            <p className="text-sm text-gray-500">Tell us where you'd like your stand to be.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Village / section <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.villageName}
                onChange={e => set("villageName", e.target.value)}
                placeholder="e.g. KwaMhlanga"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred area description
                <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={form.siteDesc}
                onChange={e => set("siteDesc", e.target.value)}
                placeholder="Describe the location, nearby landmarks, or any specific area you have in mind…"
                className={textareaCls}
              />
            </div>
          </div>
        )}

        {/* Step 2 — Land use */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Land use</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">How will you use the land? <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                {LAND_PURPOSES.map(p => (
                  <label key={p.value}
                    className={`flex flex-col gap-0.5 rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                      form.purpose === p.value
                        ? "border-forest-600 bg-forest-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="purpose"
                      value={p.value}
                      checked={form.purpose === p.value}
                      onChange={() => set("purpose", p.value)}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold text-gray-800">{p.label}</span>
                    <span className="text-xs text-gray-500">{p.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Household size <span className="text-red-500">*</span></label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.household}
                onChange={e => set("household", e.target.value)}
                className={`${inputCls} max-w-[120px]`}
              />
              <p className="mt-1 text-xs text-gray-400">Number of people who will live on this stand</p>
            </div>
          </div>
        )}

        {/* Step 3 — Background */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-800">Your background</h2>
            <p className="text-sm text-gray-500">These questions help the council assess your application fairly.</p>

            <RadioGroup
              label="Do you currently occupy or own any other land? *"
              value={form.hasExistingLand}
              onChange={v => set("hasExistingLand", v)}
            />
            {form.hasExistingLand && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe the land you occupy</label>
                <textarea value={form.existingLandDesc} onChange={e => set("existingLandDesc", e.target.value)} className={textareaCls} />
              </div>
            )}

            <RadioGroup
              label="Have you previously applied for land with this council? *"
              value={form.hasPreviousApp}
              onChange={v => set("hasPreviousApp", v)}
            />
            {form.hasPreviousApp && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Previous application reference (if known)</label>
                <input type="text" value={form.previousAppRef} onChange={e => set("previousAppRef", e.target.value)} className={inputCls} />
              </div>
            )}

            <RadioGroup
              label="Are you aware of any land disputes involving you or your family? *"
              value={form.hasDispute}
              onChange={v => set("hasDispute", v)}
            />
            {form.hasDispute && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Describe the dispute</label>
                <textarea value={form.disputeDesc} onChange={e => set("disputeDesc", e.target.value)} className={textareaCls} />
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Review & submit */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-800">Review & submit</h2>

            {/* Summary */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{form.firstName} {form.lastName}</span>
                <span className="text-gray-500">Phone</span>
                <span className="font-medium">{form.phone}</span>
                <span className="text-gray-500">Village</span>
                <span className="font-medium">{form.villageName || "—"}</span>
                <span className="text-gray-500">Land use</span>
                <span className="font-medium capitalize">{form.purpose || "—"}</span>
                <span className="text-gray-500">Household</span>
                <span className="font-medium">{form.household} {Number(form.household) === 1 ? "person" : "people"}</span>
                <span className="text-gray-500">Existing land</span>
                <span className="font-medium">{form.hasExistingLand === null ? "—" : form.hasExistingLand ? "Yes" : "No"}</span>
              </div>
            </div>

            {/* Consent */}
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consentPopia}
                  onChange={e => set("consentPopia", e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-forest-600 focus:ring-forest-500 shrink-0"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">POPIA consent —</span> I consent to the council collecting
                  and processing my personal information for land administration purposes in accordance with POPIA.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consentTerms}
                  onChange={e => set("consentTerms", e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-forest-600 focus:ring-forest-500 shrink-0"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">Declaration —</span> I confirm that the information I have
                  provided is accurate and complete. I understand that providing false information may result
                  in my application being rejected.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Navigation */}
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => { setError(null); setStep(s => s - 1); }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={saving}
              className="flex-1 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !form.consentPopia || !form.consentTerms}
              className="flex-1 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
