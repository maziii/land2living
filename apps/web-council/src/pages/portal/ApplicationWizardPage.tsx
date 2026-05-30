import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchApplication,
  updateWizardStep,
  submitDraftApplication,
  uploadApplicationDocument,
} from "../../api/applications.js";
import type { ApplicationSummary } from "../../api/applications.js";
import { fetchResidentMe } from "../../api/residents.js";
import type { ResidentDetail } from "../../api/residents.js";

const STEPS = ["Your details", "Documents", "Location", "Land use", "Your background", "Review & submit"];

const LAND_PURPOSES = [
  { value: "residential", label: "Residential", desc: "Build a home" },
  { value: "business",    label: "Business",    desc: "Commercial or trade" },
  { value: "farming",     label: "Farming",     desc: "Agricultural use" },
  { value: "community",   label: "Community",   desc: "School, church, garden" },
] as const;

type LandPurpose = "residential" | "business" | "farming" | "community";

interface FormState {
  villageName: string;
  siteDesc:    string;
  purpose:     LandPurpose | "";
  household:   string;
  hasExistingLand:    boolean | null;
  existingLandDesc:   string;
  hasPreviousApp:     boolean | null;
  previousAppRef:     string;
  hasDispute:         boolean | null;
  disputeDesc:        string;
  consentTerms:       boolean;
  consentPopia:       boolean;
}

function emptyForm(): FormState {
  return {
    villageName: "", siteDesc: "", purpose: "", household: "1",
    hasExistingLand: null, existingLandDesc: "",
    hasPreviousApp: null, previousAppRef: "",
    hasDispute: null, disputeDesc: "",
    consentTerms: false, consentPopia: false,
  };
}

function prefillFromApp(app: ApplicationSummary): Partial<FormState> {
  return {
    ...(app.villageName             && { villageName: app.villageName }),
    ...(app.siteDescription         && { siteDesc:    app.siteDescription }),
    ...(app.landPurpose             && { purpose:     app.landPurpose as LandPurpose }),
    ...(app.householdSize           && { household:   String(app.householdSize) }),
    ...(app.hasExistingLand     !== null && app.hasExistingLand     !== undefined && { hasExistingLand:  app.hasExistingLand }),
    ...(app.existingLandDescription && { existingLandDesc: app.existingLandDescription }),
    ...(app.hasPreviousApplication !== null && app.hasPreviousApplication !== undefined && { hasPreviousApp: app.hasPreviousApplication }),
    ...(app.previousApplicationRef  && { previousAppRef: app.previousApplicationRef }),
    ...(app.hasDispute          !== null && app.hasDispute          !== undefined && { hasDispute:  app.hasDispute }),
    ...(app.disputeDescription      && { disputeDesc:  app.disputeDescription }),
  };
}

// ── Document upload slot ──────────────────────────────────────────────────────

interface DocSlotProps {
  label:        string;
  required:     boolean;
  docType:      "id_document" | "proof_of_residence" | "affidavit";
  existing:     ApplicationSummary["documents"];
  onUploaded:   (doc: ApplicationSummary["documents"][0]) => void;
  appId:        string;
  apiFetch:     (path: string, init?: RequestInit) => Promise<Response>;
}

function DocSlot({ label, required, docType, existing, onUploaded, appId, apiFetch }: DocSlotProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef                   = useRef<HTMLInputElement>(null);

  const docTypeLabels: Record<string, string> = {
    id_document:        "ID document",
    proof_of_residence: "Proof of residence",
    affidavit:          "Affidavit",
  };

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const doc = await uploadApplicationDocument(apiFetch, appId, file, docType);
      onUploaded(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const hasDoc = existing.length > 0;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${hasDoc ? "border-forest-200 bg-forest-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasDoc ? (
            <div className="w-5 h-5 rounded-full bg-forest-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </span>
        </div>
        <label className={`cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
          uploading
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : hasDoc
              ? "border border-forest-300 text-forest-700 bg-white hover:bg-forest-50"
              : "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
        }`}>
          {uploading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Uploading…
            </>
          ) : hasDoc ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Replace
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            disabled={uploading}
            onChange={e => void handleFile(e)}
          />
        </label>
      </div>

      {/* Uploaded file list */}
      {existing.map(doc => (
        <div key={doc.id} className="flex items-center gap-2 text-xs text-forest-700">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{docTypeLabels[doc.documentType] ?? doc.documentType} uploaded</span>
        </div>
      ))}

      {!hasDoc && !uploading && (
        <p className="text-xs text-gray-400">
          {required ? "Required — " : "Optional — "}
          Accepted formats: PDF, JPG, PNG
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Radio group ───────────────────────────────────────────────────────────────

function RadioGroup({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
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

// ── Wizard ────────────────────────────────────────────────────────────────────

export function ApplicationWizardPage() {
  const { id }           = useParams<{ id: string }>();
  const { apiFetch }     = useAuth();
  const navigate         = useNavigate();

  const [app, setApp]           = useState<ApplicationSummary | null>(null);
  const [resident, setResident] = useState<ResidentDetail | null>(null);
  const [step, setStep]         = useState(0);
  const [form, setForm]         = useState<FormState>(emptyForm());
  const [saving, setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { void load(); }, [id]);

  async function load() {
    if (!id) return;
    try {
      const [application, me] = await Promise.all([
        fetchApplication(apiFetch, id),
        fetchResidentMe(apiFetch),
      ]);
      setApp(application);
      setResident(me);
      setForm(prev => ({ ...prev, ...prefillFromApp(application) }));
      if (application.wizardStep !== null && application.wizardStep > 0) {
        const w = application.wizardStep;
        const restored =
          w <= 4  ? 0 :
          w <= 5  ? 1 :
          w <= 9  ? 2 :
          w <= 13 ? 3 :
          w <= 17 ? 4 : 5;
        setStep(restored);
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
    if (step === 1) {
      const hasId = app?.documents.some(d => d.documentType === "id_document") ?? false;
      if (!hasId) return "Please upload a copy of your ID document before continuing";
    }
    if (step === 2) {
      if (!form.villageName.trim()) return "Please enter your preferred village or area";
    }
    if (step === 3) {
      if (!form.purpose) return "Please select a land use purpose";
      if (!form.household || Number(form.household) < 1) return "Household size must be at least 1";
    }
    if (step === 4) {
      if (form.hasExistingLand === null) return "Please answer whether you have existing land";
      if (form.hasPreviousApp  === null) return "Please answer whether you have a previous application";
      if (form.hasDispute      === null) return "Please answer whether you have any disputes";
    }
    if (step === 5) {
      if (!form.consentPopia) return "POPIA consent is required";
      if (!form.consentTerms) return "You must accept the declaration";
    }
    return null;
  }

  function stepToWizardData(s: number): Parameters<typeof updateWizardStep>[2] {
    if (s === 0) return {
      wizardStep: 4,
      ...(resident?.firstName  && { applicantFirstName: resident.firstName }),
      ...(resident?.lastName   && { applicantLastName:  resident.lastName }),
      ...(resident?.phoneNumber && { applicantPhone:    resident.phoneNumber }),
    };
    if (s === 1) return { wizardStep: 5 };
    if (s === 2) return {
      wizardStep: 9,
      ...(form.villageName.trim() && { villageName:     form.villageName.trim() }),
      ...(form.siteDesc.trim()    && { siteDescription: form.siteDesc.trim() }),
    };
    if (s === 3) return {
      wizardStep: 13,
      ...(form.purpose           && { landPurpose:   form.purpose as LandPurpose }),
      ...(Number(form.household) && { householdSize: Number(form.household) }),
    };
    if (s === 4) return {
      wizardStep: 17,
      ...(form.hasExistingLand  !== null && { hasExistingLand:         form.hasExistingLand }),
      ...(form.existingLandDesc          && { existingLandDescription: form.existingLandDesc }),
      ...(form.hasPreviousApp   !== null && { hasPreviousApplication:  form.hasPreviousApp }),
      ...(form.previousAppRef            && { previousApplicationRef:  form.previousAppRef }),
      ...(form.hasDispute       !== null && { hasDispute:              form.hasDispute }),
      ...(form.disputeDesc               && { disputeDescription:      form.disputeDesc }),
    };
    return { wizardStep: 20, consentPopia: form.consentPopia, consentTerms: form.consentTerms };
  }

  async function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      if (id) await updateWizardStep(apiFetch, id, stepToWizardData(step));
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
      if (id) await updateWizardStep(apiFetch, id, stepToWizardData(5));
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

  const docCount   = app.documents.filter(d => d.documentType !== "stand_photo").length;
  const idDocsDone = app.documents.some(d => d.documentType === "id_document");

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step   ? "bg-forest-600 text-white"
                : i === step ? "bg-forest-700 text-white ring-4 ring-forest-200"
                : "bg-gray-200 text-gray-500"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              <p className={`text-xs mt-1 font-medium text-center leading-tight hidden sm:block ${i === step ? "text-forest-700" : "text-gray-400"}`}>
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

        {/* ── Step 0 — Your details (read-only) ────────────────────── */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Your details</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                These details come from your council registration. If anything is incorrect, contact the council to update your record.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500 w-32 shrink-0">Full name</span>
                <span className="text-sm font-medium text-gray-900">
                  {resident ? `${resident.firstName} ${resident.lastName}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500 w-32 shrink-0">Phone</span>
                <span className="text-sm font-medium text-gray-900">
                  {resident?.phoneNumber ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500 w-32 shrink-0">ID number</span>
                <span className="text-sm font-medium text-gray-900 font-mono">
                  {resident?.idNumber ?? "—"}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-forest-50 border border-forest-200 px-3 py-2.5 text-xs text-forest-700">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Your application will be submitted under this registered identity. The council will use this information to verify your eligibility.
            </div>
          </div>
        )}

        {/* ── Step 1 — Documents ────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Required documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Upload your ID document before continuing. Your files are securely stored.
              </p>
            </div>

            <DocSlot
              label="ID document"
              required
              docType="id_document"
              existing={app.documents.filter(d => d.documentType === "id_document")}
              onUploaded={doc => setApp(prev => prev ? { ...prev, documents: [...prev.documents, doc] } : prev)}
              appId={id!}
              apiFetch={apiFetch}
            />
            <DocSlot
              label="Proof of residence"
              required={false}
              docType="proof_of_residence"
              existing={app.documents.filter(d => d.documentType === "proof_of_residence")}
              onUploaded={doc => setApp(prev => prev ? { ...prev, documents: [...prev.documents, doc] } : prev)}
              appId={id!}
              apiFetch={apiFetch}
            />
            <DocSlot
              label="Affidavit"
              required={false}
              docType="affidavit"
              existing={app.documents.filter(d => d.documentType === "affidavit")}
              onUploaded={doc => setApp(prev => prev ? { ...prev, documents: [...prev.documents, doc] } : prev)}
              appId={id!}
              apiFetch={apiFetch}
            />

            {!idDocsDone && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                An ID document is required to proceed with your application.
              </p>
            )}
          </div>
        )}

        {/* ── Step 2 — Location ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Select an area</h2>
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

        {/* ── Step 3 — Land use ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-800">Land use</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">How will you use the land? <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                {LAND_PURPOSES.map(p => (
                  <label key={p.value}
                    className={`flex flex-col gap-0.5 rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                      form.purpose === p.value ? "border-forest-600 bg-forest-50" : "border-gray-200 hover:border-gray-300"
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

        {/* ── Step 4 — Background ───────────────────────────────────── */}
        {step === 4 && (
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

        {/* ── Step 5 — Review & submit ──────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-800">Review & submit</h2>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm space-y-0 divide-y divide-gray-100">
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{resident ? `${resident.firstName} ${resident.lastName}` : "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium">{resident?.phoneNumber ?? "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">ID number</span>
                <span className="font-medium font-mono">{resident?.idNumber ?? "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Documents</span>
                <span className="font-medium">{docCount} file{docCount !== 1 ? "s" : ""} uploaded</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Village</span>
                <span className="font-medium">{form.villageName || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Land use</span>
                <span className="font-medium capitalize">{form.purpose || "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Household</span>
                <span className="font-medium">{form.household} {Number(form.household) === 1 ? "person" : "people"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 py-2">
                <span className="text-gray-500">Existing land</span>
                <span className="font-medium">{form.hasExistingLand === null ? "—" : form.hasExistingLand ? "Yes" : "No"}</span>
              </div>
            </div>

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
