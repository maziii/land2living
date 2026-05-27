import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { apiSelfRegister } from "../api/auth.js";

const TENANT_SLUG = (import.meta.env["VITE_TENANT_SLUG"] as string | undefined) ?? "ndebele";

const LANGUAGE_OPTIONS = [
  { value: "ndebele", label: "Ndebele" },
  { value: "zulu",    label: "Zulu" },
  { value: "sotho",   label: "Sotho" },
  { value: "xhosa",   label: "Xhosa" },
  { value: "tswana",  label: "Tswana" },
  { value: "english", label: "English" },
];

type Step = "details" | "contact" | "consent";

export function RegisterPage() {
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();

  // Step tracking
  const [step, setStep] = useState<Step>("details");

  // Form fields
  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [idNumber,    setIdNumber]    = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [language,    setLanguage]    = useState("ndebele");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [consentPopia, setConsentPopia] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);

  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validateDetails(): string | null {
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim())  return "Last name is required";
    return null;
  }

  function validateContact(): string | null {
    if (!phoneNumber.trim()) return "Phone number is required";
    if (!email.trim())       return "Email address is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirm) return "Passwords do not match";
    return null;
  }

  function handleNextDetails(e: FormEvent) {
    e.preventDefault();
    const err = validateDetails();
    if (err) { setError(err); return; }
    setError(null);
    setStep("contact");
  }

  function handleNextContact(e: FormEvent) {
    e.preventDefault();
    const err = validateContact();
    if (err) { setError(err); return; }
    setError(null);
    setStep("consent");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consentPopia || !consentTerms) {
      setError("You must accept both consents to register");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await apiSelfRegister({
        email,
        password,
        tenantSlug:         TENANT_SLUG,
        firstName:          firstName.trim(),
        lastName:           lastName.trim(),
        phoneNumber:        phoneNumber.trim(),
        languagePreference: language,
        ...(idNumber.trim() && { idNumber: idNumber.trim() }),
        consentPopia: true,
        consentTerms: true,
      });
      loginWithTokens(result.accessToken, result.refreshToken);
      navigate("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const stepIndex = { details: 0, contact: 1, consent: 2 }[step];

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-50 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-forest-800">Create your account</h1>
          <p className="mt-1 text-forest-600">
            {TENANT_SLUG.replace(/_/g, " ")} Land Registry
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {["Your details", "Contact & login", "Consent"].map((label, i) => (
            <div key={label} className="flex items-center flex-1">
              <div className={`flex flex-col items-center flex-1 ${i < stepIndex ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (i === 0 && stepIndex > 0) setStep("details");
                  if (i === 1 && stepIndex > 1) setStep("contact");
                }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${i < stepIndex  ? "bg-forest-600 text-white"
                  : i === stepIndex ? "bg-forest-700 text-white ring-4 ring-forest-200"
                  : "bg-gray-200 text-gray-500"}`}>
                  {i < stepIndex ? "✓" : i + 1}
                </div>
                <p className={`text-xs mt-1 font-medium ${i === stepIndex ? "text-forest-700" : "text-gray-400"}`}>
                  {label}
                </p>
              </div>
              {i < 2 && (
                <div className={`h-0.5 flex-1 mx-1 mb-5 transition-colors ${i < stepIndex ? "bg-forest-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-md">
          {/* ── Step 1: Personal details ─────────────────────────────── */}
          {step === "details" && (
            <form onSubmit={handleNextDetails} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Themba"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Dlamini"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID number
                  <span className="ml-1 text-xs text-gray-400 font-normal">(optional — can be added later)</span>
                </label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  placeholder="e.g. 9001015009087"
                  maxLength={13}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred language <span className="text-red-500">*</span></label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                >
                  {LANGUAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button type="submit"
                className="w-full rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors focus:outline-none focus:ring-2 focus:ring-forest-500">
                Continue →
              </button>
            </form>
          )}

          {/* ── Step 2: Contact & login ───────────────────────────────── */}
          {step === "contact" && (
            <form onSubmit={handleNextContact} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  required
                  autoFocus
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+27 72 123 4567"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <p className="text-xs text-gray-400 mt-1">Used to log in — you'll also receive application updates here</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(null); setStep("details"); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button type="submit"
                  className="flex-1 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors focus:outline-none focus:ring-2 focus:ring-forest-500">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: Consent ──────────────────────────────────────── */}
          {step === "consent" && (
            <form onSubmit={e => void handleSubmit(e)} className="space-y-5">
              <div className="rounded-xl bg-forest-50 border border-forest-200 p-4 text-sm text-forest-800 space-y-1">
                <p className="font-semibold">Registering as:</p>
                <p>{firstName} {lastName}</p>
                <p className="text-forest-600">{email} · {phoneNumber}</p>
              </div>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={consentPopia}
                    onChange={e => setConsentPopia(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-forest-600 focus:ring-forest-500 shrink-0"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    <span className="font-medium">POPIA consent —</span> I consent to the council collecting
                    and processing my personal information for land administration purposes, in accordance
                    with the Protection of Personal Information Act (POPIA). I understand I can request
                    access to or deletion of my data at any time.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={consentTerms}
                    onChange={e => setConsentTerms(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-forest-600 focus:ring-forest-500 shrink-0"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    <span className="font-medium">Terms of use —</span> I confirm the information I have
                    provided is accurate and I understand that providing false information may result
                    in my application being rejected.
                  </span>
                </label>
              </div>

              {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(null); setStep("contact"); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !consentPopia || !consentTerms}
                  className="flex-1 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800 transition-colors focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-forest-700 hover:text-forest-900 hover:underline">
            Sign in
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-gray-400">
          Need help? Ask a council officer to register you in person.
        </p>
      </div>
    </div>
  );
}
