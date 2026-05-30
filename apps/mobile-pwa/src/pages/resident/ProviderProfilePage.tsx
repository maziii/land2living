import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchProvider,
  SERVICE_CATEGORIES,
  CATEGORY_LABELS,
  type Provider,
  type ServiceCategory,
} from "../../api/services.js";

// ── Category sub-services (mirrors ServicesPage) ──────────────────────────────

const CATEGORY_SERVICES: Record<ServiceCategory, string[]> = {
  building:     ["New home construction", "Room extensions", "Renovations", "Structural repairs", "Roofing"],
  bricklaying:  ["Brick walls", "Plastering & skimming", "Paving & pathways", "Retaining walls", "Pointing"],
  plumbing:     ["Pipe repairs & replacement", "Tap & toilet installation", "Drain unblocking", "Geyser repairs", "Water supply"],
  electrical:   ["Wiring & rewiring", "DB board installation", "Light & socket fitting", "Solar installation", "Fault finding"],
  repairs:      ["General maintenance", "Door & window repairs", "Roof patching", "Damp proofing", "Crack repairs"],
  gardening:    ["Lawn mowing & edging", "Tree & hedge trimming", "Landscaping & design", "Irrigation systems", "Garden cleanup"],
  cleaning:     ["Domestic cleaning", "Deep cleaning", "Post-construction cleanup", "Upholstery cleaning", "Window washing"],
  security:     ["Security gates & doors", "CCTV installation", "Alarm systems", "Burglar bars", "Electric fencing"],
  fencing:      ["Palisade fencing", "Wire & mesh fencing", "Wooden fencing", "Gate installation", "Concrete posts"],
  borehole:     ["Borehole drilling", "Pump installation & repair", "Water quality testing", "Tank & storage", "Maintenance contracts"],
  architecture: ["Building plans & drawings", "Council approval submissions", "House & extension designs", "Structural certificates", "Site supervision"],
};

const CAT_THEME: Record<ServiceCategory, { gradient: string; chip: string }> = {
  building:     { gradient: "from-forest-600 to-forest-800",   chip: "bg-forest-100 text-forest-700"   },
  bricklaying:  { gradient: "from-red-500 to-red-700",         chip: "bg-red-100 text-red-700"         },
  plumbing:     { gradient: "from-blue-500 to-blue-700",       chip: "bg-blue-100 text-blue-700"       },
  electrical:   { gradient: "from-amber-500 to-amber-700",     chip: "bg-amber-100 text-amber-700"     },
  repairs:      { gradient: "from-gray-500 to-gray-700",       chip: "bg-gray-100 text-gray-600"       },
  gardening:    { gradient: "from-emerald-500 to-emerald-700", chip: "bg-emerald-100 text-emerald-700" },
  cleaning:     { gradient: "from-sky-500 to-sky-700",         chip: "bg-sky-100 text-sky-700"         },
  security:     { gradient: "from-slate-600 to-slate-800",     chip: "bg-slate-100 text-slate-700"     },
  fencing:      { gradient: "from-orange-500 to-orange-700",   chip: "bg-orange-100 text-orange-700"   },
  borehole:     { gradient: "from-cyan-500 to-cyan-700",       chip: "bg-cyan-100 text-cyan-700"       },
  architecture: { gradient: "from-purple-500 to-purple-700",   chip: "bg-purple-100 text-purple-700"   },
};

// Primary category = first one in the provider's list
function primaryCategory(provider: Provider): ServiceCategory {
  return (provider.categories[0] ?? "repairs") as ServiceCategory;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-52 bg-gray-300" />
      <div className="px-4 pt-5 pb-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/5" />
        <div className="h-4 bg-gray-100 rounded w-2/5" />
        <div className="h-4 bg-gray-100 rounded w-1/3" />
      </div>
      <div className="flex gap-3 px-4 pb-4">
        <div className="flex-1 h-11 bg-gray-100 rounded-xl" />
        <div className="flex-1 h-11 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ provider }: { provider: Provider }) {
  const primary = primaryCategory(provider);
  const serves  = provider.geographicCoverage.length > 0
    ? provider.geographicCoverage.map(s => s.replace(/_/g, " ")).join(", ")
    : "KwaNdebele area";

  const primary_label = CATEGORY_LABELS[primary] ?? primary;
  const others = provider.categories
    .filter(c => c !== primary)
    .slice(0, 2)
    .map(c => (CATEGORY_LABELS[c as ServiceCategory] ?? c).toLowerCase());

  const description = others.length === 0
    ? `${provider.businessName} is a specialist ${primary_label.toLowerCase()} contractor serving the ${serves} area. Available for residential and community projects.`
    : `${provider.businessName} provides ${primary_label.toLowerCase()} services, also covering ${others.join(" and ")}, serving the ${serves} area. Available for residential and community work.`;

  return (
    <div className="space-y-5 px-4 py-5">
      {/* About */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">About</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
      </section>

      {/* Business details */}
      <section className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-gray-500">Verification</span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            provider.verificationStatus === "verified"
              ? "bg-emerald-100 text-emerald-700"
              : provider.verificationStatus === "documents_submitted"
              ? "bg-amber-100 text-amber-700"
              : "bg-gray-100 text-gray-500"
          }`}>
            {provider.verificationStatus === "verified"
              ? "Verified Provider"
              : provider.verificationStatus === "documents_submitted"
              ? "Pending Verification"
              : provider.verificationStatus.replace(/_/g, " ")}
          </span>
        </div>

        {provider.cipcNumber && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500">CIPC Number</span>
            <span className="text-sm font-mono text-gray-800">{provider.cipcNumber}</span>
          </div>
        )}

        {provider.vatNumber && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500">VAT Number</span>
            <span className="text-sm font-mono text-gray-800">{provider.vatNumber}</span>
          </div>
        )}

        <div className="flex items-start gap-2 px-4 py-3">
          <span className="text-sm text-gray-500 shrink-0">Coverage Areas</span>
          <p className="text-sm text-gray-800 text-right capitalize ml-auto">{serves}</p>
        </div>
      </section>
    </div>
  );
}

// ── Tab: Services ─────────────────────────────────────────────────────────────

function ServicesTab({ provider }: { provider: Provider }) {
  return (
    <div className="space-y-4 px-4 py-5">
      <p className="text-xs text-gray-400">
        {provider.businessName} offers {provider.categories.length} service {provider.categories.length === 1 ? "category" : "categories"}.
      </p>
      {provider.categories.map(cat => {
        const theme = CAT_THEME[cat as ServiceCategory] ?? CAT_THEME.repairs;
        const subServices = CATEGORY_SERVICES[cat as ServiceCategory] ?? [];
        return (
          <div key={cat} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className={`bg-gradient-to-r ${theme.gradient} px-4 py-3 flex items-center gap-2`}>
              <span className="text-white font-bold text-sm">{CATEGORY_LABELS[cat as ServiceCategory] ?? cat}</span>
              {provider.categories[0] === cat && (
                <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">Primary</span>
              )}
            </div>
            <ul className="px-4 py-3 space-y-2">
              {subServices.map(s => (
                <li key={s} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="3" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Insights ─────────────────────────────────────────────────────────────

function InsightsTab({ provider }: { provider: Provider }) {
  const score = provider.verificationStatus === "verified" ? 85
    : provider.verificationStatus === "documents_submitted" ? 55
    : 30;

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-forest-700">{provider.categories.length}</p>
          <p className="text-xs text-gray-500 mt-1">Service {provider.categories.length === 1 ? "Category" : "Categories"}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-forest-700">{provider.geographicCoverage.length || 1}</p>
          <p className="text-xs text-gray-500 mt-1">Coverage {provider.geographicCoverage.length === 1 ? "Area" : "Areas"}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-sm font-bold text-gray-800">Within 24 hrs</p>
          <p className="text-xs text-gray-500 mt-1">Avg. Reply Time</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-forest-700">{score}<span className="text-sm text-gray-400">/100</span></p>
          <p className="text-xs text-gray-500 mt-1">Listing Score</p>
        </div>
      </div>

      {/* Industry classification */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-50">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Industry</p>
          <div className="flex flex-wrap gap-1.5">
            {provider.categories.map(c => {
              const theme = CAT_THEME[c as ServiceCategory];
              return (
                <span key={c} className={`text-xs px-2.5 py-1 rounded-full font-medium ${theme?.chip ?? "bg-gray-100 text-gray-600"}`}>
                  {CATEGORY_LABELS[c as ServiceCategory] ?? c}
                </span>
              );
            })}
          </div>
        </div>
        {(provider.cipcNumber || provider.vatNumber) && (
          <div className="px-4 py-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Compliance</p>
            <div className="flex flex-wrap gap-1.5">
              {provider.cipcNumber && <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700">CIPC Registered</span>}
              {provider.vatNumber  && <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-purple-50 text-purple-700">VAT Registered</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "services" | "insights";

export default function ProviderProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProvider(id)
      .then(setProvider)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load provider"))
      .finally(() => setLoading(false));
  }, [id]);

  const primary = provider ? primaryCategory(provider) : null;
  const theme   = primary ? CAT_THEME[primary] : null;
  const serves  = provider && provider.geographicCoverage.length > 0
    ? provider.geographicCoverage.slice(0, 2).map(s => s.replace(/_/g, " ")).join(", ")
    : "KwaNdebele area";

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* Back button — sticky over the hero */}
      <div className="sticky top-0 z-20 px-4 pt-4 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="pointer-events-auto flex items-center gap-1.5 bg-black/30 backdrop-blur-sm text-white text-sm font-semibold px-3 py-1.5 rounded-full"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {loading && (
        <div className="-mt-12">
          <ProfileSkeleton />
        </div>
      )}

      {error && (
        <div className="mx-4 mt-16 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {!loading && provider && theme && primary && (
        <>
          {/* ── Hero banner ─────────────────────────────────────────────── */}
          <div className={`-mt-12 bg-gradient-to-br ${theme.gradient} px-4 pt-16 pb-6`}>
            {/* Avatar + name row */}
            <div className="flex items-end gap-4 mb-4">
              <div className="w-20 h-20 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0 shadow-lg">
                <span className="text-white font-extrabold text-2xl tracking-tight">{initials(provider.businessName)}</span>
              </div>
              <div className="pb-1 min-w-0">
                <h1 className="text-white font-bold text-xl leading-snug break-words">{provider.businessName}</h1>
                {provider.verificationStatus === "verified" && (
                  <div className="flex items-center gap-1 mt-1">
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-white/90 text-xs font-semibold">Verified Provider</span>
                  </div>
                )}
              </div>
            </div>

            {/* Meta row — primary service + location */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/80 text-xs font-medium">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {CATEGORY_LABELS[primary]}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="capitalize">{serves}</span>
              </span>
            </div>
          </div>

          {/* ── Action buttons ───────────────────────────────────────────── */}
          <div className="flex gap-3 px-4 py-4 bg-white border-b border-gray-100 shadow-sm">
            <button
              onClick={() => navigate(`/resident/services`, { state: { openQuote: provider.id } })}
              className={`flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${theme.gradient} active:scale-[0.98] transition-all shadow-sm`}
            >
              Request Quote
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          </div>

          {/* ── Tab bar ──────────────────────────────────────────────────── */}
          <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
            {(["overview", "services", "insights"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
                  tab === t
                    ? "border-forest-600 text-forest-700"
                    : "border-transparent text-gray-400"
                }`}
              >
                {t === "overview" ? "Overview" : t === "services" ? `Services (${provider.categories.length})` : "Insights"}
              </button>
            ))}
          </div>

          {/* ── Tab content ──────────────────────────────────────────────── */}
          {tab === "overview"  && <OverviewTab  provider={provider} />}
          {tab === "services"  && <ServicesTab  provider={provider} />}
          {tab === "insights"  && <InsightsTab  provider={provider} />}

          <div className="h-6" />
        </>
      )}
    </div>
  );
}
