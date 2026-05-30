import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  SERVICE_CATEGORIES,
  CATEGORY_LABELS,
  fetchProviders,
  fetchMyBookings,
  createBooking,
  acceptQuote,
  type ServiceCategory,
  type Provider,
  type Booking,
} from "../../api/services.js";

// ── Category sub-services (shown on directory cards, like serv.co.za) ─────────

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

// ── Category colours & gradient backgrounds ───────────────────────────────────

const CAT_THEME: Record<ServiceCategory, {
  gradient: string; iconBg: string; icon: string; chip: string; border: string;
}> = {
  building:     { gradient: "from-forest-600  to-forest-800",  iconBg: "bg-white/20", icon: "text-white", chip: "bg-forest-100 text-forest-700",   border: "border-forest-200"  },
  bricklaying:  { gradient: "from-red-500     to-red-700",     iconBg: "bg-white/20", icon: "text-white", chip: "bg-red-100 text-red-700",         border: "border-red-200"     },
  plumbing:     { gradient: "from-blue-500    to-blue-700",    iconBg: "bg-white/20", icon: "text-white", chip: "bg-blue-100 text-blue-700",       border: "border-blue-200"    },
  electrical:   { gradient: "from-amber-500   to-amber-700",   iconBg: "bg-white/20", icon: "text-white", chip: "bg-amber-100 text-amber-700",     border: "border-amber-200"   },
  repairs:      { gradient: "from-gray-500    to-gray-700",    iconBg: "bg-white/20", icon: "text-white", chip: "bg-gray-100 text-gray-600",       border: "border-gray-200"    },
  gardening:    { gradient: "from-emerald-500 to-emerald-700", iconBg: "bg-white/20", icon: "text-white", chip: "bg-emerald-100 text-emerald-700", border: "border-emerald-200" },
  cleaning:     { gradient: "from-sky-500     to-sky-700",     iconBg: "bg-white/20", icon: "text-white", chip: "bg-sky-100 text-sky-700",         border: "border-sky-200"     },
  security:     { gradient: "from-slate-600   to-slate-800",   iconBg: "bg-white/20", icon: "text-white", chip: "bg-slate-100 text-slate-700",     border: "border-slate-200"   },
  fencing:      { gradient: "from-orange-500  to-orange-700",  iconBg: "bg-white/20", icon: "text-white", chip: "bg-orange-100 text-orange-700",   border: "border-orange-200"  },
  borehole:     { gradient: "from-cyan-500    to-cyan-700",    iconBg: "bg-white/20", icon: "text-white", chip: "bg-cyan-100 text-cyan-700",       border: "border-cyan-200"    },
  architecture: { gradient: "from-purple-500  to-purple-700",  iconBg: "bg-white/20", icon: "text-white", chip: "bg-purple-100 text-purple-700",   border: "border-purple-200"  },
};

// ── Category SVG icons ────────────────────────────────────────────────────────

function CategoryIcon({ category, className = "w-6 h-6" }: { category: ServiceCategory; className?: string }) {
  const iconCls = `${className} ${CAT_THEME[category]?.icon ?? "text-gray-600"}`;
  switch (category) {
    case "building":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 22V12h6v10"/></svg>;
    case "bricklaying":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="9" height="4" rx="0.5" strokeWidth={1.75}/><rect x="13" y="7" width="9" height="4" rx="0.5" strokeWidth={1.75}/><rect x="6" y="13" width="9" height="4" rx="0.5" strokeWidth={1.75}/><rect x="2" y="13" width="2" height="4" rx="0.5" strokeWidth={1.75}/><rect x="17" y="13" width="5" height="4" rx="0.5" strokeWidth={1.75}/></svg>;
    case "plumbing":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 2C8 7 6 10 6 13a6 6 0 0012 0c0-3-2-6-6-11z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 19v3M9 22h6"/></svg>;
    case "electrical":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case "repairs":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>;
    case "gardening":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 22V12M12 12C12 7 7 3 3 3c0 4 2.5 8 6 9.5M12 12c0-5 5-9 9-9-1 5-4 8-9 9"/></svg>;
    case "cleaning":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 3l14 9-14 9V3z"/></svg>;
    case "security":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "fencing":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 21V10M4 7V3M8 21V10M8 7V3M4 10h4M12 21V10M12 7V3M16 21V10M16 7V3M12 10h4M20 21V10M20 7V3M16 10h4"/></svg>;
    case "borehole":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 2v12M9 9l3 3 3-3M5 19c0-2.2 3.1-4 7-4s7 1.8 7 4"/></svg>;
    case "architecture":
      return <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  quote_requested: "Requested",
  quoted:          "Quote received",
  accepted:        "Confirmed",
  in_progress:     "In progress",
  completed:       "Completed",
  disputed:        "Disputed",
  cancelled:       "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  quote_requested: "bg-blue-100 text-blue-700",
  quoted:          "bg-amber-100 text-amber-700",
  accepted:        "bg-forest-100 text-forest-700",
  in_progress:     "bg-purple-100 text-purple-700",
  completed:       "bg-emerald-100 text-emerald-700",
  disputed:        "bg-red-100 text-red-700",
  cancelled:       "bg-gray-100 text-gray-400",
};

const ACTIVE_STEPS = ["quote_requested", "quoted", "accepted", "in_progress", "completed"];

function formatZar(n: number) {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Category directory card (serv.co.za style) ────────────────────────────────

function CategoryCard({
  category, providerCount, onBrowse,
}: {
  category: ServiceCategory;
  providerCount: number;
  onBrowse: () => void;
}) {
  const theme = CAT_THEME[category];
  const services = CATEGORY_SERVICES[category];

  return (
    <div className={`bg-white rounded-2xl border ${theme.border} shadow-sm overflow-hidden`}>
      {/* Gradient header with icon */}
      <div className={`bg-gradient-to-br ${theme.gradient} px-4 pt-5 pb-4`}>
        <div className={`w-12 h-12 ${theme.iconBg} rounded-xl flex items-center justify-center mb-3`}>
          <CategoryIcon category={category} className="w-6 h-6" />
        </div>
        <h3 className="text-white font-bold text-base leading-tight">{CATEGORY_LABELS[category]}</h3>
        <p className="text-white/70 text-xs mt-0.5 font-medium">
          {providerCount > 0
            ? `${providerCount} verified provider${providerCount !== 1 ? "s" : ""}`
            : "Providers coming soon"}
        </p>
      </div>

      {/* Sub-services list */}
      <div className="px-4 py-3">
        <ul className="space-y-1.5 mb-4">
          {services.slice(0, 5).map(s => (
            <li key={s} className="flex items-start gap-2 text-sm text-gray-600">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="3" />
              </svg>
              {s}
            </li>
          ))}
        </ul>

        <button
          onClick={onBrowse}
          disabled={providerCount === 0}
          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
            providerCount > 0
              ? `bg-gradient-to-r ${theme.gradient} text-white active:scale-[0.98]`
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {providerCount > 0 ? "View providers →" : "No providers yet"}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function providerDescription(provider: Provider, primaryCategory: ServiceCategory): string {
  const primary = CATEGORY_LABELS[primaryCategory] ?? primaryCategory;
  const others = provider.categories
    .filter(c => c !== primaryCategory)
    .slice(0, 2)
    .map(c => (CATEGORY_LABELS[c as ServiceCategory] ?? c).toLowerCase());
  const coverage = provider.geographicCoverage.slice(0, 2)
    .map(s => s.replace(/_/g, " "))
    .join(" and ");
  const tail = coverage ? `, serving the ${coverage} area` : "";
  if (others.length === 0) {
    return `${provider.businessName} is a specialist ${primary.toLowerCase()} contractor${tail}. Available for residential and community projects.`;
  }
  return `${provider.businessName} provides ${primary.toLowerCase()} services, also covering ${others.join(" and ")}${tail}. Available for residential and community work.`;
}

// ── Provider card — serv.co.za style ─────────────────────────────────────────

function ProviderCard({ provider, category, onBook }: {
  provider: Provider;
  category: ServiceCategory;
  onBook: () => void;
}) {
  const navigate = useNavigate();
  const theme = CAT_THEME[category];
  const isPrimary = provider.categories[0] === category;
  const focusPct = Math.round((1 / provider.categories.length) * 100);
  const serves = provider.geographicCoverage.slice(0, 2).map(s => s.replace(/_/g, " ")).join(", ") || "KwaNdebele area";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Response-time bar — mirrors serv.co.za top indicator */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-xs text-gray-500 font-medium">
          {provider.verificationStatus === "verified" ? "Verified provider · Quick response" : "Documents submitted · Pending verification"}
        </span>
        {provider.cipcNumber && (
          <span className="ml-auto text-xs text-gray-400 font-medium">CIPC Registered</span>
        )}
      </div>

      {/* Main card body */}
      <div className="p-4">
        <div className="flex items-start gap-4">

          {/* Square avatar — ~80px, gradient background with initials */}
          <div className={`w-20 h-20 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-white font-extrabold text-xl tracking-tight">{initials(provider.businessName)}</span>
          </div>

          {/* Header info */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-bold text-gray-900 text-base leading-snug">{provider.businessName}</h3>

            {/* Service focus line — "Plumbing 80%" */}
            <p className="text-sm text-gray-600 mt-0.5">
              <span className="font-semibold">{CATEGORY_LABELS[category]}</span>
              <span className="text-gray-400"> {focusPct}%</span>
              {isPrimary && <span className="ml-1.5 text-xs text-forest-600 font-semibold">· Primary focus</span>}
            </p>

            {/* Location — "Serves: KwaMhlanga, Hammanskraal" */}
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span>Serves: <span className="text-gray-700 font-medium capitalize">{serves}</span></span>
            </div>

            {/* VAT badge if applicable */}
            {provider.vatNumber && (
              <span className="inline-block mt-1.5 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">VAT Registered</span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-3 text-sm text-gray-600 leading-relaxed line-clamp-3">
          {providerDescription(provider, category)}
        </p>

        {/* Also covers chips */}
        {provider.categories.length > 1 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            <span className="text-xs text-gray-400 self-center mr-0.5">Also covers:</span>
            {provider.categories.filter(c => c !== category).slice(0, 4).map(c => (
              <span key={c} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_THEME[c as ServiceCategory]?.chip ?? "bg-gray-100 text-gray-600"}`}>
                {CATEGORY_LABELS[c as ServiceCategory] ?? c}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons — side by side like serv.co.za */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => navigate(`/resident/provider/${provider.id}`)}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View Profile
          </button>
          <button
            onClick={onBook}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${theme.gradient} active:scale-[0.98] transition-all`}
          >
            Request Quote
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Provider skeleton ─────────────────────────────────────────────────────────

function ProviderSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <div className="h-8 bg-gray-50 border-b border-gray-100" />
      <div className="p-4 flex items-start gap-4">
        <div className="w-20 h-20 rounded-xl bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-gray-200 rounded w-3/5" />
          <div className="h-3 bg-gray-100 rounded w-2/5" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
        <div className="flex gap-2 mt-3">
          <div className="flex-1 h-10 bg-gray-100 rounded-xl" />
          <div className="flex-1 h-10 bg-gray-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ booking, onAccept }: { booking: Booking; onAccept: () => void }) {
  const stepIndex = ACTIVE_STEPS.indexOf(booking.status);
  const cat = booking.category as ServiceCategory;
  const theme = CAT_THEME[cat] ?? CAT_THEME.repairs;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center shrink-0`}>
            <CategoryIcon category={cat} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-gray-900 text-sm">{CATEGORY_LABELS[cat] ?? booking.category}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${STATUS_COLOR[booking.status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABEL[booking.status] ?? booking.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{booking.description}</p>
          </div>
        </div>

        {stepIndex >= 0 && booking.status !== "cancelled" && (
          <div className="flex items-center gap-1 mt-3">
            {ACTIVE_STEPS.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i <= stepIndex ? "bg-forest-500" : "bg-gray-200"}`} />
            ))}
          </div>
        )}
      </div>

      {booking.status === "quoted" && booking.quoteAmountZar !== null && (
        <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-amber-900">Quote received</p>
            <p className="text-lg font-bold text-amber-900">{formatZar(booking.quoteAmountZar)}</p>
          </div>
          <button onClick={onAccept} className="w-full bg-forest-600 hover:bg-forest-700 text-white font-bold py-2.5 rounded-xl text-sm">
            Accept &amp; confirm
          </button>
          <p className="text-xs text-amber-700 text-center mt-1.5">Payment only after the job is done.</p>
        </div>
      )}

      {booking.status === "completed" && (
        <div className="mx-4 mb-4 flex items-center gap-2 bg-emerald-50 rounded-xl p-3">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-emerald-700 font-semibold">Job completed</p>
        </div>
      )}

      <div className="px-4 pb-3">
        <p className="text-xs text-gray-400">
          {new Date(booking.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
          {booking.requestedDate && ` · For ${new Date(booking.requestedDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "browse" | "jobs";

export default function ServicesPage() {
  const { auth } = useAuth();
  const userId = auth?.userId ?? "";

  const [tab, setTab]                           = useState<Tab>("browse");
  const [activeCategory, setActiveCategory]     = useState<ServiceCategory | null>(null);
  const [sort, setSort]                         = useState<"best_match" | "name_az" | "most_services">("best_match");
  const [quoteProvider, setQuoteProvider]       = useState<Provider | null>(null);

  const [providers, setProviders]   = useState<Provider[]>([]);
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loadingP, setLoadingP]     = useState(true);
  const [loadingB, setLoadingB]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Quote form
  const [description, setDescription]     = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [saving, setSaving]               = useState(false);
  const [quoteSuccess, setQuoteSuccess]   = useState(false);

  // Load all verified providers once
  useEffect(() => {
    setLoadingP(true);
    fetchProviders()
      .then(r => setProviders(r.providers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load providers"))
      .finally(() => setLoadingP(false));
  }, []);

  // Load bookings when switching to jobs tab
  useEffect(() => {
    if (tab !== "jobs" || !userId) return;
    setLoadingB(true);
    fetchMyBookings(userId)
      .then(r => setBookings(r.bookings))
      .catch(() => { /* silent */ })
      .finally(() => setLoadingB(false));
  }, [tab, userId]);

  // Provider count per category
  const countByCategory = (cat: ServiceCategory) =>
    providers.filter(p => p.categories.includes(cat)).length;

  // Providers filtered and sorted for the active category drill-down
  const categoryProviders = (() => {
    if (!activeCategory) return [];
    const filtered = providers.filter(p => p.categories.includes(activeCategory));
    if (sort === "name_az") return [...filtered].sort((a, b) => a.businessName.localeCompare(b.businessName));
    if (sort === "most_services") return [...filtered].sort((a, b) => b.categories.length - a.categories.length);
    // best_match: verified first, then primary-category first
    return [...filtered].sort((a, b) => {
      if (a.verificationStatus === "verified" && b.verificationStatus !== "verified") return -1;
      if (b.verificationStatus === "verified" && a.verificationStatus !== "verified") return 1;
      const aPrimary = a.categories[0] === activeCategory ? 0 : 1;
      const bPrimary = b.categories[0] === activeCategory ? 0 : 1;
      return aPrimary - bPrimary;
    });
  })();

  function handleBrowseCategory(cat: ServiceCategory) {
    setActiveCategory(cat);
    setSort("best_match");
    setError(null);
  }

  function openQuoteForm(provider: Provider) {
    setQuoteProvider(provider);
    setDescription("");
    setRequestedDate("");
    setQuoteSuccess(false);
    setError(null);
  }

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!quoteProvider || !activeCategory) return;
    setSaving(true);
    setError(null);
    try {
      await createBooking({
        providerId: quoteProvider.id,
        category: activeCategory,
        description,
        ...(requestedDate ? { requestedDate: new Date(requestedDate).toISOString() } : {}),
      });
      setQuoteSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptQuote(bookingId: string) {
    setError(null);
    try {
      const updated = await acceptQuote(bookingId);
      setBookings(prev => prev.map(b => b.id === bookingId ? updated : b));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept quote");
    }
  }

  // ── Quote request / success screen ───────────────────────────────────────

  if (quoteProvider && activeCategory) {
    const theme = CAT_THEME[activeCategory];

    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
          <button
            onClick={() => { setQuoteProvider(null); setQuoteSuccess(false); }}
            className="flex items-center gap-1.5 text-forest-600 text-sm font-semibold mb-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <h2 className="text-xl font-bold text-gray-900">Request a quote</h2>
        </div>

        <div className="flex-1 px-4 py-5">
          {quoteSuccess ? (
            <div className="text-center pt-10 pb-6">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${theme.gradient} flex items-center justify-center mx-auto mb-5`}>
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Request sent!</h3>
              <p className="text-gray-500 mt-2 leading-relaxed max-w-xs mx-auto">
                <span className="font-semibold text-gray-800">{quoteProvider.businessName}</span> will review your request and send a quote shortly.
              </p>
              <div className="mt-6 space-y-2 text-sm text-gray-500 text-left bg-white rounded-2xl border border-gray-100 p-4 max-w-sm mx-auto">
                <div className="flex items-center gap-2"><svg className="w-4 h-4 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>You'll be notified when they respond</div>
                <div className="flex items-center gap-2"><svg className="w-4 h-4 text-forest-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Only pay after accepting the quote</div>
              </div>
              <div className="flex flex-col gap-3 mt-6 max-w-sm mx-auto">
                <button onClick={() => { setTab("jobs"); setQuoteProvider(null); setQuoteSuccess(false); }} className={`bg-gradient-to-r ${theme.gradient} text-white font-bold px-6 py-3.5 rounded-xl text-sm`}>Track my request</button>
                <button onClick={() => { setQuoteProvider(null); setQuoteSuccess(false); }} className="text-forest-600 font-semibold text-sm">Browse more providers</button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void handleBook(e)} className="space-y-4 max-w-lg">
              {/* Provider summary */}
              <div className={`bg-gradient-to-r ${theme.gradient} rounded-2xl p-4 flex items-center gap-3`}>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <CategoryIcon category={activeCategory} className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-white">{quoteProvider.businessName}</p>
                  <p className="text-white/70 text-xs mt-0.5">{CATEGORY_LABELS[activeCategory]} service</p>
                </div>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">Describe what you need <span className="text-red-500">*</span></label>
                <textarea
                  required minLength={10} maxLength={2000}
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white resize-none"
                  placeholder="Be specific — size of the area, what needs to be done, any access constraints, and how urgently…"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{description.length} / 2000</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">Preferred date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white" />
              </div>

              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-amber-800">The provider will send a quote first — you only pay after reviewing and accepting it.</p>
              </div>

              <button type="submit" disabled={saving || description.trim().length < 10} className={`w-full bg-gradient-to-r ${theme.gradient} disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base`}>
                {saving ? "Sending…" : "Send quote request"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Category drill-down: provider list ────────────────────────────────────

  if (activeCategory) {
    const theme = CAT_THEME[activeCategory];

    return (
      <div className="flex flex-col min-h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className={`bg-gradient-to-r ${theme.gradient} px-4 pt-4 pb-4`}>
            <button
              onClick={() => setActiveCategory(null)}
              className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-semibold mb-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All services
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <CategoryIcon category={activeCategory} className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{CATEGORY_LABELS[activeCategory]}</h2>
                <p className="text-white/70 text-xs">
                  {categoryProviders.length} verified provider{categoryProviders.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

        {/* Sort bar — mirrors serv.co.za "Recently Active / Highest Rated / Most Reviews" */}
        {!loadingP && categoryProviders.length > 0 && (
          <div className="px-4 pt-3 pb-0 flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium shrink-0">Sort by:</span>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {(["best_match", "name_az", "most_services"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    sort === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {s === "best_match" ? "Best Match" : s === "name_az" ? "Name A–Z" : "Most Services"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 px-4 py-3 space-y-3">
          {loadingP && <><ProviderSkeleton /><ProviderSkeleton /></>}

          {!loadingP && categoryProviders.length === 0 && (
            <div className="text-center py-16">
              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${theme.gradient} flex items-center justify-center mx-auto mb-4 opacity-40`}>
                <CategoryIcon category={activeCategory} className="w-8 h-8" />
              </div>
              <p className="font-semibold text-gray-700 text-lg">No providers yet</p>
              <p className="text-gray-400 text-sm mt-1">Verified {CATEGORY_LABELS[activeCategory].toLowerCase()} providers will appear here soon.</p>
            </div>
          )}

          {!loadingP && categoryProviders.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <div className="h-px bg-transparent" />}
              <ProviderCard provider={p} category={activeCategory} onBook={() => openQuoteForm(p)} />
            </div>
          ))}

          <div className="h-4" />
        </div>
      </div>
    );
  }

  // ── Main marketplace: directory grid ─────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* Sticky header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Services</h1>
              <p className="text-xs text-gray-500 mt-0.5">Find trusted local contractors</p>
            </div>
            {!loadingP && (
              <span className="text-xs text-gray-400 font-medium">{providers.length} providers</span>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(["browse", "jobs"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === t ? "bg-white text-forest-700 shadow-sm" : "text-gray-500"
                }`}
              >
                {t === "browse" ? "Browse" : "My Jobs"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {/* ── Browse: category directory grid ─────────────────────────────────── */}
      {tab === "browse" && (
        <div className="flex-1 px-4 py-4">
          {loadingP ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                  <div className="h-28 bg-gray-200" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                    <div className="h-3 bg-gray-100 rounded w-3/5" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                    <div className="h-9 bg-gray-100 rounded-xl mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_CATEGORIES.map(cat => (
                <CategoryCard
                  key={cat}
                  category={cat}
                  providerCount={countByCategory(cat)}
                  onBrowse={() => handleBrowseCategory(cat)}
                />
              ))}
            </div>
          )}
          <div className="h-4" />
        </div>
      )}

      {/* ── My Jobs tab ──────────────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div className="flex-1 px-4 py-4 space-y-3">
          {loadingB && <div className="text-center py-10 text-gray-400 text-sm">Loading your jobs…</div>}

          {!loadingB && bookings.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-forest-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="font-bold text-gray-700 text-lg">No jobs yet</p>
              <p className="text-gray-400 text-sm mt-1">Request a quote from any provider and it'll appear here.</p>
              <button onClick={() => setTab("browse")} className="mt-5 bg-forest-600 text-white text-sm font-bold px-6 py-3 rounded-xl">
                Browse services
              </button>
            </div>
          )}

          {!loadingB && bookings.map(b => (
            <JobCard key={b.id} booking={b} onAccept={() => void handleAcceptQuote(b.id)} />
          ))}

          <div className="h-4" />
        </div>
      )}
    </div>
  );
}
