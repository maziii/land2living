import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  createDraft, saveDraftStep, submitDraft, fetchApplication,
  fetchProvinces, fetchAuthorities, fetchVillages,
  type ApplicationDraft, type AuthorityTypeOption, type Province,
  type LandAuthority, type AuthorityVillage, type LandPurpose, type AuthorityType,
} from "../../api/land-application.js";

// ── Lookup data for authority types ──────────────────────────────────────────
const AUTHORITY_TYPE_OPTIONS: AuthorityTypeOption[] = [
  { value: "traditional_council", label: "Traditional Council" },
  { value: "municipality",        label: "Municipality" },
  { value: "cpa",                 label: "Communal Property Association (CPA)" },
  { value: "private_development", label: "Private Development" },
];

const AUTHORITY_TYPE_EMOJI: Record<string, string> = {
  traditional_council: "👑",
  municipality:        "🏛️",
  cpa:                 "🤝",
  private_development: "🏗️",
};

const LAND_PURPOSE_OPTIONS: { value: LandPurpose; label: string; emoji: string; desc: string }[] = [
  { value: "residential", label: "Home",          emoji: "🏠", desc: "Build a home for my family" },
  { value: "business",    label: "Business",      emoji: "🏪", desc: "Run a business or trade" },
  { value: "farming",     label: "Farming",        emoji: "🌾", desc: "Grow food or keep livestock" },
  { value: "community",   label: "Community use",  emoji: "🏫", desc: "School, church or community space" },
];

const TOTAL_STEPS = 14;

// ── Wizard data (accumulated across steps) ───────────────────────────────────
interface WizardData {
  provinceId?: string;
  provinceName?: string;
  authorityType?: AuthorityType;
  authorityId?: string;
  authorityName?: string;
  villageId?: string;
  villageName?: string;
  applicantFirstName?: string;
  applicantLastName?: string;
  applicantPhone?: string;
  applicantIdNumber?: string;
  householdSize?: number;
  landPurpose?: LandPurpose;
  siteDescription?: string;
  hasExistingLand?: boolean;
  existingLandDescription?: string;
  hasPreviousApplication?: boolean;
  previousApplicationRef?: string;
  hasDispute?: boolean;
  disputeDescription?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  consentTerms?: boolean;
  consentPopia?: boolean;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div
        className="bg-forest-500 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function WizardHeader({
  step,
  onBack,
  title,
  subtitle,
}: {
  step: number;
  onBack?: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
      <div className="flex items-center gap-2 mb-2">
        {onBack && (
          <button onClick={onBack} className="text-forest-600 text-sm font-medium shrink-0">← Back</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{step} of {TOTAL_STEPS}</span>
      </div>
      <ProgressBar step={step} />
      <h2 className="text-xl font-bold text-forest-900 mt-3">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function NextButton({
  onClick,
  disabled,
  saving,
  label = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  saving?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      className="w-full bg-forest-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl text-base transition-colors active:bg-forest-700"
    >
      {saving ? "Saving…" : label}
    </button>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function LandApplicationWizard() {
  const navigate = useNavigate();
  const { id: draftIdParam } = useParams<{ id?: string }>();
  const { auth } = useAuth();

  const [step, setStep]             = useState(0);
  const [draftId, setDraftId]       = useState<string | null>(draftIdParam ?? null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [data, setData]             = useState<WizardData>({});
  const [submitted, setSubmitted]   = useState(false);

  // Lookup data
  const [provinces, setProvinces]       = useState<Province[]>([]);
  const [authorities, setAuthorities]   = useState<LandAuthority[]>([]);
  const [villages, setVillages]         = useState<AuthorityVillage[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);

  const loadedRef = useRef(false);

  // Load provinces on mount; resume draft if id param present
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetchProvinces()
      .then(setProvinces)
      .catch(() => setError("Could not load provinces. Please check your connection."));

    if (draftIdParam) {
      fetchApplication(draftIdParam).then(app => {
        setStep(app.wizardStep ?? 0);
        seedDataFromDraft(app);
      }).catch(() => setError("Could not load your draft application."));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function seedDataFromDraft(app: ApplicationDraft) {
    setData({
      ...(app.provinceId != null            && { provinceId:              app.provinceId }),
      ...(app.authorityType != null         && { authorityType:           app.authorityType as AuthorityType }),
      ...(app.authorityId != null           && { authorityId:             app.authorityId }),
      ...(app.villageId != null             && { villageId:               app.villageId }),
      ...(app.villageName != null           && { villageName:              app.villageName }),
      ...(app.applicantFirstName != null    && { applicantFirstName:       app.applicantFirstName }),
      ...(app.applicantLastName != null     && { applicantLastName:        app.applicantLastName }),
      ...(app.applicantPhone != null        && { applicantPhone:           app.applicantPhone }),
      ...(app.householdSize != null         && { householdSize:            app.householdSize }),
      ...(app.landPurpose != null           && { landPurpose:              app.landPurpose }),
      ...(app.siteDescription != null       && { siteDescription:          app.siteDescription }),
      ...(app.hasExistingLand != null       && { hasExistingLand:          app.hasExistingLand }),
      ...(app.existingLandDescription != null && { existingLandDescription: app.existingLandDescription }),
      ...(app.hasPreviousApplication != null  && { hasPreviousApplication:  app.hasPreviousApplication }),
      ...(app.previousApplicationRef != null  && { previousApplicationRef:  app.previousApplicationRef }),
      ...(app.hasDispute != null            && { hasDispute:               app.hasDispute }),
      ...(app.disputeDescription != null    && { disputeDescription:       app.disputeDescription }),
      ...(app.gpsLatitude != null           && { gpsLatitude:              app.gpsLatitude }),
      ...(app.gpsLongitude != null          && { gpsLongitude:             app.gpsLongitude }),
      ...(app.consentTerms != null          && { consentTerms:             app.consentTerms }),
      ...(app.consentPopia != null          && { consentPopia:             app.consentPopia }),
    });
  }

  async function advance(stepData: Partial<WizardData>, nextStep: number) {
    const merged = { ...data, ...stepData };
    setData(merged);
    setError(null);
    setSaving(true);

    try {
      let id = draftId;
      if (!id) {
        const draft = await createDraft();
        id = draft.id;
        setDraftId(id);
      }

      await saveDraftStep(id, {
        wizardStep:             nextStep - 1,
        ...(merged.provinceId             && { provinceId:             merged.provinceId }),
        ...(merged.authorityType          && { authorityType:          merged.authorityType }),
        ...(merged.authorityId            && { authorityId:            merged.authorityId }),
        ...(merged.villageId              && { villageId:              merged.villageId }),
        ...(merged.villageName            && { villageName:            merged.villageName }),
        ...(merged.applicantFirstName     && { applicantFirstName:     merged.applicantFirstName }),
        ...(merged.applicantLastName      && { applicantLastName:      merged.applicantLastName }),
        ...(merged.applicantPhone         && { applicantPhone:         merged.applicantPhone }),
        ...(merged.applicantIdNumber      && { applicantIdNumber:      merged.applicantIdNumber }),
        ...(merged.householdSize !== undefined && { householdSize:     merged.householdSize }),
        ...(merged.landPurpose            && { landPurpose:            merged.landPurpose }),
        ...(merged.siteDescription        && { siteDescription:        merged.siteDescription }),
        ...(merged.hasExistingLand !== undefined && { hasExistingLand: merged.hasExistingLand }),
        ...(merged.existingLandDescription && { existingLandDescription: merged.existingLandDescription }),
        ...(merged.hasPreviousApplication !== undefined && { hasPreviousApplication: merged.hasPreviousApplication }),
        ...(merged.previousApplicationRef && { previousApplicationRef: merged.previousApplicationRef }),
        ...(merged.hasDispute !== undefined && { hasDispute:            merged.hasDispute }),
        ...(merged.disputeDescription     && { disputeDescription:     merged.disputeDescription }),
        ...(merged.gpsLatitude !== undefined  && { gpsLatitude:        merged.gpsLatitude }),
        ...(merged.gpsLongitude !== undefined && { gpsLongitude:       merged.gpsLongitude }),
        ...(merged.consentTerms !== undefined && { consentTerms:       merged.consentTerms }),
        ...(merged.consentPopia !== undefined && { consentPopia:       merged.consentPopia }),
      });

      setStep(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function back() {
    setStep(s => Math.max(0, s - 1));
  }

  async function loadAuthorities(provinceId: string, type?: AuthorityType) {
    setLoadingLookup(true);
    try {
      const list = await fetchAuthorities(provinceId, type);
      setAuthorities(list);
    } catch {
      setError("Could not load authorities.");
    } finally {
      setLoadingLookup(false);
    }
  }

  async function loadVillages(authorityId: string) {
    setLoadingLookup(true);
    try {
      const list = await fetchVillages(authorityId);
      setVillages(list);
    } catch {
      setError("Could not load villages.");
    } finally {
      setLoadingLookup(false);
    }
  }

  // ── Submitted success screen ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl mb-5">✅</div>
        <h2 className="text-2xl font-bold text-forest-900 mb-2">Application submitted!</h2>
        <p className="text-gray-600 text-sm mb-8">
          Your land application has been received. The council will review it and notify you.
          Your reference is <strong>{draftId?.slice(0, 8).toUpperCase()}</strong>.
        </p>
        <button
          onClick={() => navigate("/resident/land")}
          className="bg-forest-600 text-white font-bold px-8 py-4 rounded-2xl text-base"
        >
          View my applications
        </button>
      </div>
    );
  }

  // ── Error banner ───────────────────────────────────────────────────────────
  const errorBanner = error && (
    <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
      {error}
    </div>
  );

  // ── Step 0: Welcome ────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold text-forest-900 mb-2">Apply for land</h2>
          <p className="text-gray-600 text-sm mb-2 max-w-xs">
            We'll ask you a few simple questions. You can save and come back any time.
          </p>
          <p className="text-gray-400 text-xs max-w-xs">About 5–10 minutes to complete.</p>
        </div>
        {errorBanner}
        <div className="px-4 pb-8">
          <button
            onClick={() => setStep(1)}
            className="w-full bg-forest-600 text-white font-bold py-4 rounded-2xl text-base"
          >
            Start application
          </button>
          <button onClick={() => navigate("/resident/land")} className="w-full text-gray-500 text-sm py-3 mt-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: Province ───────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
        <WizardHeader step={1} title="Which province?" subtitle="Select where the land is located." onBack={back} />
        {errorBanner}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {provinces.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading provinces…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {provinces.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    void advance({ provinceId: p.id, provinceName: p.name }, 2);
                    void loadAuthorities(p.id, data.authorityType);
                  }}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    data.provinceId === p.id
                      ? "bg-forest-600 text-white border-forest-600"
                      : "bg-white border-forest-100 shadow-sm"
                  }`}
                >
                  <span className="font-semibold text-sm">{p.name}</span>
                  <span className={`block text-xs mt-0.5 ${data.provinceId === p.id ? "text-forest-100" : "text-gray-400"}`}>{p.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Authority type ─────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
        <WizardHeader step={2} title="Who manages the land?" subtitle="Choose the type of land authority." onBack={back} />
        {errorBanner}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {AUTHORITY_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                void advance({ authorityType: opt.value }, 3);
                if (data.provinceId) void loadAuthorities(data.provinceId, opt.value);
              }}
              className={`w-full rounded-2xl border p-4 text-left flex items-center gap-3 transition-colors ${
                data.authorityType === opt.value
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white border-forest-100 shadow-sm"
              }`}
            >
              <span className="text-3xl">{AUTHORITY_TYPE_EMOJI[opt.value]}</span>
              <div>
                <p className="font-semibold text-sm">{opt.label}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 3: Specific authority ─────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
        <WizardHeader step={3} title="Which authority?" subtitle="Select the specific council or body." onBack={back} />
        {errorBanner}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loadingLookup && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
          {!loadingLookup && authorities.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium text-gray-500">No authorities found for this selection.</p>
              <button onClick={back} className="mt-4 text-forest-600 text-sm font-medium">← Change selection</button>
            </div>
          )}
          {authorities.map(a => (
            <button
              key={a.id}
              onClick={() => {
                void advance({ authorityId: a.id, authorityName: a.name }, 4);
                void loadVillages(a.id);
              }}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                data.authorityId === a.id
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white border-forest-100 shadow-sm"
              }`}
            >
              <p className="font-semibold text-sm">{a.name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 4: First name ─────────────────────────────────────────────────────
  if (step === 4) {
    return <NameStep step={4} field="applicantFirstName" label="What is your first name?" placeholder="First name" data={data} onBack={back} onNext={v => void advance({ applicantFirstName: v }, 5)} saving={saving} error={error} />;
  }

  // ── Step 5: Last name ──────────────────────────────────────────────────────
  if (step === 5) {
    return <NameStep step={5} field="applicantLastName" label="What is your surname?" placeholder="Surname / last name" data={data} onBack={back} onNext={v => void advance({ applicantLastName: v }, 6)} saving={saving} error={error} />;
  }

  // ── Step 6: Phone number ───────────────────────────────────────────────────
  if (step === 6) {
    return <PhoneStep step={6} data={data} onBack={back} onNext={v => void advance({ applicantPhone: v }, 7)} saving={saving} error={error} />;
  }

  // ── Step 7: ID number ──────────────────────────────────────────────────────
  if (step === 7) {
    return <IdNumberStep step={7} data={data} onBack={back} onNext={v => void advance({ applicantIdNumber: v }, 8)} saving={saving} error={error} />;
  }

  // ── Step 8: Household size ─────────────────────────────────────────────────
  if (step === 8) {
    return <HouseholdStep step={8} data={data} onBack={back} onNext={v => void advance({ householdSize: v }, 9)} saving={saving} error={error} />;
  }

  // ── Step 9: Land purpose ───────────────────────────────────────────────────
  if (step === 9) {
    return (
      <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
        <WizardHeader step={9} title="What will you use the land for?" onBack={back} />
        {errorBanner}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {LAND_PURPOSE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => void advance({ landPurpose: opt.value }, 10)}
              className={`w-full rounded-2xl border p-4 text-left flex items-center gap-4 transition-colors ${
                data.landPurpose === opt.value
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white border-forest-100 shadow-sm"
              }`}
            >
              <span className="text-4xl">{opt.emoji}</span>
              <div>
                <p className="font-bold text-base">{opt.label}</p>
                <p className={`text-xs mt-0.5 ${data.landPurpose === opt.value ? "text-forest-100" : "text-gray-400"}`}>{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 10: Preferred village / area ──────────────────────────────────────
  if (step === 10) {
    return <VillageStep step={10} data={data} villages={villages} onBack={back} onNext={(villageId, villageName, site) => void advance({ ...(villageId !== undefined && { villageId }), ...(villageName !== undefined && { villageName }), siteDescription: site }, 11)} saving={saving} error={error} />;
  }

  // ── Step 11: Existing land? ────────────────────────────────────────────────
  if (step === 11) {
    return (
      <YesNoStep
        step={11}
        title="Do you already own or occupy any land?"
        subtitle="This includes land you live on but don't have papers for."
        value={data.hasExistingLand}
        onBack={back}
        onYes={() => void advance({ hasExistingLand: true }, 12)}
        onNo={() => void advance({ hasExistingLand: false }, 13)}
        saving={saving}
        error={error}
        extraWhenYes={
          <TextareaExtra
            label="Describe the land you already have"
            placeholder="Where is it? How long have you been there?"
            value={data.existingLandDescription ?? ""}
            onChange={v => setData(d => ({ ...d, existingLandDescription: v }))}
          />
        }
      />
    );
  }

  // ── Step 12: Previous applications? ───────────────────────────────────────
  if (step === 12) {
    return (
      <YesNoStep
        step={12}
        title="Have you applied for land before?"
        subtitle="Any previous application to a council or authority."
        value={data.hasPreviousApplication}
        onBack={back}
        onYes={() => void advance({ hasPreviousApplication: true }, 13)}
        onNo={() => void advance({ hasPreviousApplication: false }, 13)}
        saving={saving}
        error={error}
        extraWhenYes={
          <TextareaExtra
            label="Reference or description (if you know it)"
            placeholder="e.g. Application #2024-001 or 'applied to Tshwane in 2023'"
            value={data.previousApplicationRef ?? ""}
            onChange={v => setData(d => ({ ...d, previousApplicationRef: v }))}
          />
        }
      />
    );
  }

  // ── Step 13: Disputes? ─────────────────────────────────────────────────────
  if (step === 13) {
    return (
      <YesNoStep
        step={13}
        title="Is there any dispute about this land?"
        subtitle="For example, other people claiming the same piece of land."
        value={data.hasDispute}
        onBack={back}
        onYes={() => void advance({ hasDispute: true }, 14)}
        onNo={() => void advance({ hasDispute: false }, 14)}
        saving={saving}
        error={error}
        extraWhenYes={
          <TextareaExtra
            label="Describe the dispute"
            placeholder="Who is involved? What is the nature of the dispute?"
            value={data.disputeDescription ?? ""}
            onChange={v => setData(d => ({ ...d, disputeDescription: v }))}
          />
        }
      />
    );
  }

  // ── Step 14: Review + consent + submit ────────────────────────────────────
  if (step === 14) {
    return (
      <ReviewStep
        step={14}
        data={data}
        draftId={draftId}
        saving={saving}
        error={error}
        onBack={back}
        onChange={(key, value) => setData(d => ({ ...d, [key]: value }))}
        onSubmit={async () => {
          if (!data.consentTerms || !data.consentPopia) {
            setError("Please accept both consent declarations to proceed.");
            return;
          }
          if (!draftId) { setError("Application not started."); return; }
          setSaving(true);
          setError(null);
          try {
            await saveDraftStep(draftId, {
              wizardStep: 14,
              consentTerms: data.consentTerms,
              consentPopia: data.consentPopia,
            });
            await submitDraft(draftId);
            setSubmitted(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
          } finally {
            setSaving(false);
          }
        }}
      />
    );
  }

  return null;
}

// ── Reusable step sub-components ──────────────────────────────────────────────

function NameStep({
  step, field, label, placeholder, data, onBack, onNext, saving, error,
}: {
  step: number;
  field: "applicantFirstName" | "applicantLastName";
  label: string;
  placeholder: string;
  data: WizardData;
  onBack: () => void;
  onNext: (value: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState(data[field] ?? "");
  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title={label} onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 px-4 py-6">
        <input
          type="text"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-2xl px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
          placeholder={placeholder}
        />
      </div>
      <div className="px-4 pb-8">
        <NextButton onClick={() => { if (value.trim()) onNext(value.trim()); }} disabled={!value.trim()} saving={saving} />
      </div>
    </div>
  );
}

function PhoneStep({ step, data, onBack, onNext, saving, error }: { step: number; data: WizardData; onBack: () => void; onNext: (v: string) => void; saving: boolean; error: string | null }) {
  const [value, setValue] = useState(data.applicantPhone ?? "");
  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title="What is your phone number?" subtitle="We'll use this to contact you about your application." onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 px-4 py-6">
        <input
          type="tel"
          autoFocus
          inputMode="tel"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-2xl px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
          placeholder="+27 71 234 5678"
        />
        <p className="text-xs text-gray-400 mt-2">Include country code, e.g. +27</p>
      </div>
      <div className="px-4 pb-8">
        <NextButton onClick={() => { if (value.trim()) onNext(value.trim()); }} disabled={value.trim().length < 8} saving={saving} />
        <button onClick={() => onNext("")} className="w-full text-gray-400 text-sm py-3">Skip for now</button>
      </div>
    </div>
  );
}

function IdNumberStep({ step, data, onBack, onNext, saving, error }: { step: number; data: WizardData; onBack: () => void; onNext: (v: string) => void; saving: boolean; error: string | null }) {
  const [value, setValue] = useState(data.applicantIdNumber ?? "");
  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title="Your South African ID number" subtitle="13-digit SA ID number. This is kept secure and private." onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 px-4 py-6">
        <input
          type="text"
          autoFocus
          inputMode="numeric"
          maxLength={13}
          value={value}
          onChange={e => setValue(e.target.value.replace(/\D/g, ""))}
          className="w-full border border-gray-300 rounded-2xl px-4 py-4 text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
          placeholder="0000000000000"
        />
        <p className="text-xs text-gray-400 mt-2">{value.length} / 13 digits</p>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          Your ID number is encrypted and used only for identity verification. It is never shared without your consent.
        </div>
      </div>
      <div className="px-4 pb-8">
        <NextButton onClick={() => onNext(value)} disabled={value.length !== 13} saving={saving} />
        <button onClick={() => onNext("")} className="w-full text-gray-400 text-sm py-3">I don't have my ID number</button>
      </div>
    </div>
  );
}

function HouseholdStep({ step, data, onBack, onNext, saving, error }: { step: number; data: WizardData; onBack: () => void; onNext: (v: number) => void; saving: boolean; error: string | null }) {
  const [value, setValue] = useState(data.householdSize ?? 1);
  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title="How many people live in your household?" subtitle="Including yourself and all children." onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <div className="flex items-center gap-8">
          <button
            onClick={() => setValue(v => Math.max(1, v - 1))}
            className="w-16 h-16 rounded-full bg-white border-2 border-forest-200 text-forest-600 text-3xl font-bold flex items-center justify-center shadow-sm active:bg-forest-50"
          >−</button>
          <div className="text-center">
            <span className="text-7xl font-bold text-forest-800">{value}</span>
            <p className="text-gray-500 text-sm mt-1">{value === 1 ? "person" : "people"}</p>
          </div>
          <button
            onClick={() => setValue(v => Math.min(20, v + 1))}
            className="w-16 h-16 rounded-full bg-white border-2 border-forest-200 text-forest-600 text-3xl font-bold flex items-center justify-center shadow-sm active:bg-forest-50"
          >+</button>
        </div>
      </div>
      <div className="px-4 pb-8">
        <NextButton onClick={() => onNext(value)} saving={saving} />
      </div>
    </div>
  );
}

function VillageStep({
  step, data, villages, onBack, onNext, saving, error,
}: {
  step: number;
  data: WizardData;
  villages: AuthorityVillage[];
  onBack: () => void;
  onNext: (villageId: string | undefined, villageName: string | undefined, siteDescription: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [selectedId, setSelectedId]     = useState(data.villageId ?? "");
  const [selectedName, setSelectedName] = useState(data.villageName ?? "");
  const [freeText, setFreeText]         = useState(data.siteDescription ?? "");
  const [useCustom, setUseCustom]       = useState(!data.villageId && !!data.siteDescription);

  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title="Where do you want the land?" subtitle="Select a village or describe the area." onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {villages.map(v => (
          <button
            key={v.id}
            onClick={() => { setSelectedId(v.id); setSelectedName(v.name); setUseCustom(false); }}
            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
              selectedId === v.id && !useCustom
                ? "bg-forest-600 text-white border-forest-600"
                : "bg-white border-forest-100 shadow-sm"
            }`}
          >
            <p className="font-semibold text-sm">{v.name}</p>
          </button>
        ))}
        <button
          onClick={() => { setUseCustom(true); setSelectedId(""); }}
          className={`w-full rounded-2xl border p-4 text-left transition-colors ${
            useCustom ? "bg-forest-600 text-white border-forest-600" : "bg-white border-forest-100 shadow-sm"
          }`}
        >
          <p className="font-semibold text-sm">✏️ Describe the area (other)</p>
        </button>
        {useCustom && (
          <textarea
            autoFocus
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
            placeholder="e.g. Near the school in Extension 5, north of the main road…"
          />
        )}
      </div>
      <div className="px-4 pb-8">
        <NextButton
          onClick={() => {
            if (useCustom) {
              onNext(undefined, undefined, freeText);
            } else {
              onNext(selectedId || undefined, selectedName || undefined, "");
            }
          }}
          disabled={useCustom ? !freeText.trim() : !selectedId}
          saving={saving}
        />
      </div>
    </div>
  );
}

function YesNoStep({
  step, title, subtitle, value, onBack, onYes, onNo, saving, error, extraWhenYes,
}: {
  step: number;
  title: string;
  subtitle?: string;
  value: boolean | undefined;
  onBack: () => void;
  onYes: () => void;
  onNo: () => void;
  saving: boolean;
  error: string | null;
  extraWhenYes?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<boolean | null>(value ?? null);
  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title={title} {...(subtitle !== undefined && { subtitle })} onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
        <div className="flex gap-3">
          {[{ val: true, label: "Yes" }, { val: false, label: "No" }].map(opt => (
            <button
              key={String(opt.val)}
              onClick={() => setPicked(opt.val)}
              className={`flex-1 py-6 rounded-2xl border-2 text-xl font-bold transition-colors ${
                picked === opt.val
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              {opt.val ? "✅ " : "❌ "}{opt.label}
            </button>
          ))}
        </div>
        {picked === true && extraWhenYes}
      </div>
      <div className="px-4 pb-8">
        <NextButton
          onClick={() => { if (picked === true) onYes(); else if (picked === false) onNo(); }}
          disabled={picked === null}
          saving={saving}
        />
      </div>
    </div>
  );
}

function TextareaExtra({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white"
        placeholder={placeholder}
      />
    </div>
  );
}

function ReviewStep({
  step, data, draftId, saving, error, onBack, onChange, onSubmit,
}: {
  step: number;
  data: WizardData;
  draftId: string | null;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onChange: (key: keyof WizardData, value: boolean) => void;
  onSubmit: () => void;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Province",       value: data.provinceName ?? data.provinceId ?? "—" },
    { label: "Authority",      value: data.authorityName ?? data.authorityId ?? "—" },
    { label: "Village / Area", value: data.villageName ?? data.siteDescription ?? "—" },
    { label: "Name",           value: [data.applicantFirstName, data.applicantLastName].filter(Boolean).join(" ") || "—" },
    { label: "Phone",          value: data.applicantPhone ?? "—" },
    { label: "Household",      value: data.householdSize ? `${data.householdSize} ${data.householdSize === 1 ? "person" : "people"}` : "—" },
    { label: "Land purpose",   value: LAND_PURPOSE_OPTIONS.find(o => o.value === data.landPurpose)?.label ?? "—" },
    { label: "Existing land",  value: data.hasExistingLand === true ? "Yes" : data.hasExistingLand === false ? "No" : "—" },
    { label: "Previous apps",  value: data.hasPreviousApplication === true ? "Yes" : data.hasPreviousApplication === false ? "No" : "—" },
    { label: "Dispute",        value: data.hasDispute === true ? "Yes" : data.hasDispute === false ? "No" : "—" },
  ];

  return (
    <div className="fixed inset-0 bg-forest-50 z-30 flex flex-col">
      <WizardHeader step={step} title="Review your application" subtitle="Check all details before submitting." onBack={onBack} />
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl border border-forest-100 shadow-sm divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.label} className="flex items-start justify-between px-4 py-3 gap-3">
              <span className="text-xs text-gray-500 shrink-0 w-28">{r.label}</span>
              <span className="text-sm text-gray-900 text-right">{r.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-forest-100 shadow-sm p-4 space-y-3">
          <p className="font-semibold text-sm text-gray-900">Consent declarations</p>
          {[
            { key: "consentTerms" as const, text: "I confirm that the information I have provided is true and correct to the best of my knowledge." },
            { key: "consentPopia" as const, text: "I consent to Land2Living and the land authority collecting and processing my personal information for the purposes of this application, in line with POPIA." },
          ].map(c => (
            <label key={c.key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data[c.key] ?? false}
                onChange={e => onChange(c.key, e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-forest-600 shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">{c.text}</span>
            </label>
          ))}
        </div>

        {draftId && (
          <p className="text-xs text-gray-400 text-center">Application ref: {draftId.slice(0, 8).toUpperCase()}</p>
        )}
      </div>
      <div className="px-4 pb-8">
        <NextButton
          onClick={onSubmit}
          disabled={!data.consentTerms || !data.consentPopia}
          saving={saving}
          label="Submit application"
        />
      </div>
    </div>
  );
}
