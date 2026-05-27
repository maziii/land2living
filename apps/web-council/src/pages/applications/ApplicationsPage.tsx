import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchApplications,
  type ApplicationSummary,
  type ApplicationStatus,
} from "../../api/applications.js";
import { fetchStandVillages } from "../../api/stands.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { MultiSelect } from "../../components/MultiSelect.js";
import {
  FilterDropdown,
  FilterChip,
  FilterField,
} from "../../components/FilterDropdown.js";

type ViewMode = "card" | "list";

// ── Status dashboard config ───────────────────────────────────────────────────

interface StatusTab {
  value: ApplicationStatus;
  label: string;
  dot: string;
  ring: string;
  needsAction: boolean;
}

const STATUS_TABS: StatusTab[] = [
  { value: "submitted",         label: "Submitted",     dot: "bg-amber-400",  ring: "border-amber-400",  needsAction: true  },
  { value: "under_review",      label: "Under Review",  dot: "bg-blue-400",   ring: "border-blue-400",   needsAction: false },
  { value: "approved",          label: "Approved",      dot: "bg-indigo-400", ring: "border-indigo-400", needsAction: false },
  { value: "stand_offered",     label: "Stand Offered", dot: "bg-violet-400", ring: "border-violet-400", needsAction: false },
  { value: "viewing_requested", label: "Viewing",       dot: "bg-amber-400",  ring: "border-amber-400",  needsAction: true  },
  { value: "offer_rejected",    label: "Re-offer",      dot: "bg-orange-400", ring: "border-orange-400", needsAction: true  },
  { value: "offer_accepted",    label: "PTO Pending",   dot: "bg-green-400",  ring: "border-green-400",  needsAction: true  },
  { value: "active",            label: "Active PTO",    dot: "bg-forest-500", ring: "border-forest-500", needsAction: false },
  { value: "rejected",          label: "Not Approved",  dot: "bg-red-300",    ring: "border-red-300",    needsAction: false },
  { value: "withdrawn",         label: "Withdrawn",     dot: "bg-gray-300",   ring: "border-gray-300",   needsAction: false },
  { value: "deferred",          label: "Deferred",      dot: "bg-gray-300",   ring: "border-gray-300",   needsAction: false },
];

const STATUS_LABEL: Partial<Record<ApplicationStatus, string>> = Object.fromEntries(
  STATUS_TABS.map(t => [t.value, t.label]),
);

const STATUS_OPTIONS = STATUS_TABS.map(t => ({ value: t.value, label: t.label }));

const LAND_PURPOSE_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "business",    label: "Business" },
  { value: "farming",     label: "Farming" },
  { value: "community",   label: "Community" },
];

const NEEDS_ACTION = new Set(["submitted", "viewing_requested", "offer_rejected", "offer_accepted"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function applicantName(a: ApplicationSummary): string {
  if (a.applicantFirstName || a.applicantLastName)
    return [a.applicantFirstName, a.applicantLastName].filter(Boolean).join(" ");
  return a.applicantResidentId.slice(0, 8);
}

function landLabel(a: ApplicationSummary): string {
  const labels: Record<string, string> = {
    residential: "Residential", business: "Business",
    farming: "Farming", community: "Community",
  };
  if (a.landPurpose) return labels[a.landPurpose] ?? a.landPurpose;
  if (a.applicationType) return a.applicationType.replace(/_/g, " ");
  return "—";
}

// ── Status chip (dashboard row) ───────────────────────────────────────────────

function StatusChip({
  tab, count, active, onClick,
}: {
  tab: StatusTab; count: number | null; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap
        ${active
          ? `${tab.ring} bg-white shadow text-gray-900`
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800 hover:shadow-sm"
        }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${tab.dot} ${tab.needsAction && (count ?? 0) > 0 ? "animate-pulse" : ""}`} />
      <span>{tab.label}</span>
      <span className={`text-xs font-semibold tabular-nums ${active ? "text-gray-900" : "text-gray-400"}`}>
        {count === null ? "—" : count}
      </span>
    </button>
  );
}

// ── Application card ──────────────────────────────────────────────────────────

function ApplicationCard({ a }: { a: ApplicationSummary }) {
  const needsAction = NEEDS_ACTION.has(a.status);
  return (
    <Link
      to={a.id}
      className={`group flex flex-col gap-3 bg-white rounded-xl border shadow-sm p-5 hover:shadow-md transition-all
        ${needsAction ? "border-amber-200 hover:border-amber-300" : "border-gray-200 hover:border-forest-300"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 group-hover:text-forest-700 transition-colors leading-snug">
          {applicantName(a)}
        </p>
        {needsAction && (
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5 animate-pulse" title="Needs action" />
        )}
      </div>
      <div className="space-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">{a.villageName ?? a.requestedLocationDescription ?? "No location"}</span>
        </div>
        <p>{landLabel(a)} · {a.householdSize} household{a.householdSize !== 1 ? "s" : ""}</p>
        {a.submittedAt && (
          <p className="text-gray-400">Submitted {new Date(a.submittedAt).toLocaleDateString()}</p>
        )}
      </div>
      <div className="pt-2 border-t border-gray-100">
        <StatusBadge status={a.status} />
      </div>
    </Link>
  );
}

// ── View toggle ───────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
      <button onClick={() => onChange("card")} title="Card view"
        className={`px-3 py-1.5 text-sm transition-colors ${view === "card" ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>⊞</button>
      <button onClick={() => onChange("list")} title="List view"
        className={`px-3 py-1.5 text-sm transition-colors ${view === "list" ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>≡</button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ApplicationsPage() {
  const { apiFetch } = useAuth();

  // Status counts for the dashboard row
  const [counts, setCounts]    = useState<Partial<Record<ApplicationStatus, number>>>({});
  const [countsLoading, setCL] = useState(true);

  // Filters (all multi-select)
  const [statusFilters,  setStatuses]  = useState<ApplicationStatus[]>([]);
  const [villageFilters, setVillages]  = useState<string[]>([]);
  const [purposeFilters, setPurposes]  = useState<string[]>([]);
  const [search,         setSearch]    = useState("");
  const [searchInput,    setSI]        = useState("");
  const [filterOpen,     setFO]        = useState(false);

  // Village options from register
  const [villageOptions, setVillageOptions] = useState<string[]>([]);
  const [villagesLoading, setVL]            = useState(true);

  // List
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [view, setView]                 = useState<ViewMode>("list");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const activeFilterCount =
    (statusFilters.length > 0 ? 1 : 0) +
    (villageFilters.length > 0 ? 1 : 0) +
    (purposeFilters.length > 0 ? 1 : 0);

  function clearAllFilters() {
    setStatuses([]);
    setVillages([]);
    setPurposes([]);
    setPage(1);
  }

  // Fetch village options
  useEffect(() => {
    setVL(true);
    fetchStandVillages(apiFetch)
      .then(vs => setVillageOptions(vs))
      .catch(() => setVillageOptions([]))
      .finally(() => setVL(false));
  }, [apiFetch]);

  // Fetch per-status counts
  useEffect(() => {
    setCL(true);
    Promise.all(
      STATUS_TABS.map(tab =>
        fetchApplications(apiFetch, { statuses: [tab.value], pageSize: 1 })
          .then(({ total: t }) => ({ status: tab.value, count: t }))
          .catch(() => ({ status: tab.value, count: 0 })),
      ),
    ).then(results => {
      const map: Partial<Record<ApplicationStatus, number>> = {};
      for (const { status, count } of results) map[status] = count;
      setCounts(map);
    }).finally(() => setCL(false));
  }, [apiFetch]);

  // Fetch list
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchApplications(apiFetch, {
      page,
      pageSize: 20,
      ...(statusFilters.length  && { statuses:     statusFilters  }),
      ...(villageFilters.length && { villageNames: villageFilters }),
      ...(purposeFilters.length && { landPurposes: purposeFilters }),
      ...(search                && { search }),
    })
      .then(({ applications: data, total: t }) => { setApplications(data); setTotal(t); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, statusFilters, search, villageFilters, purposeFilters]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function toggleStatus(value: ApplicationStatus) {
    setStatuses(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value],
    );
    setPage(1);
  }

  const totalAll = countsLoading ? null
    : Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Land Applications</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} {activeFilterCount > 0 || search ? "matching" : "total"}
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* ── Status counts (dashboard row) ────────────────────────────── */}
      <div className="overflow-x-auto pb-0.5">
        <div className="flex gap-2 min-w-max">
          <button
            type="button"
            onClick={() => { setStatuses([]); setPage(1); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap
              ${statusFilters.length === 0
                ? "border-forest-400 bg-white shadow text-gray-900"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:shadow-sm"
              }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
            All
            <span className={`text-xs font-semibold tabular-nums ${statusFilters.length === 0 ? "text-gray-900" : "text-gray-400"}`}>
              {totalAll ?? "—"}
            </span>
          </button>
          {STATUS_TABS.map(tab => (
            <StatusChip
              key={tab.value}
              tab={tab}
              count={countsLoading ? null : (counts[tab.value] ?? 0)}
              active={statusFilters.includes(tab.value)}
              onClick={() => toggleStatus(tab.value)}
            />
          ))}
        </div>
      </div>

      {/* ── Toolbar: search + filter dropdown ────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSI(e.target.value)}
              placeholder="Search applicant name…"
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 w-56"
            />
          </div>
          <button type="submit"
            className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Search
          </button>
          {search && (
            <button type="button"
              onClick={() => { setSearch(""); setSI(""); setPage(1); }}
              className="text-gray-500 hover:text-gray-700 text-sm px-2 transition-colors">
              Clear
            </button>
          )}
        </form>

        <FilterDropdown
          open={filterOpen}
          onOpenChange={setFO}
          activeCount={activeFilterCount}
          onClear={clearAllFilters}
        >
          <FilterField label="Status">
            <MultiSelect
              options={STATUS_OPTIONS}
              selected={statusFilters}
              onChange={v => { setStatuses(v as ApplicationStatus[]); setPage(1); }}
            />
          </FilterField>

          <FilterField label="Village">
            <MultiSelect
              options={villageOptions.map(v => ({ value: v, label: v }))}
              selected={villageFilters}
              onChange={v => { setVillages(v); setPage(1); }}
              loading={villagesLoading}
              placeholder="No villages in register yet"
            />
          </FilterField>

          <FilterField label="Land purpose">
            <MultiSelect
              options={LAND_PURPOSE_OPTIONS}
              selected={purposeFilters}
              onChange={v => { setPurposes(v); setPage(1); }}
            />
          </FilterField>
        </FilterDropdown>
      </div>

      {/* Active filter chips */}
      {(activeFilterCount > 0 || search) && (
        <div className="flex flex-wrap gap-2">
          {statusFilters.map(s => (
            <FilterChip
              key={s}
              label={`Status: ${STATUS_LABEL[s] ?? s}`}
              onRemove={() => { setStatuses(prev => prev.filter(x => x !== s)); setPage(1); }}
            />
          ))}
          {villageFilters.map(v => (
            <FilterChip
              key={v}
              label={`Village: ${v}`}
              onRemove={() => { setVillages(prev => prev.filter(x => x !== v)); setPage(1); }}
            />
          ))}
          {purposeFilters.map(p => (
            <FilterChip
              key={p}
              label={`Purpose: ${LAND_PURPOSE_OPTIONS.find(o => o.value === p)?.label ?? p}`}
              onRemove={() => { setPurposes(prev => prev.filter(x => x !== p)); setPage(1); }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No applications found</div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map(a => <ApplicationCard key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Applicant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Land use</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Village</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Household</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map((a) => (
                <tr key={a.id}
                  className={`hover:bg-gray-50 ${NEEDS_ACTION.has(a.status) ? "bg-amber-50/40" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Link to={a.id} className="text-forest-700 hover:underline font-medium">
                      {applicantName(a)}
                    </Link>
                    {NEEDS_ACTION.has(a.status) && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-400" title="Needs action" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{landLabel(a)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.villageName ?? a.requestedLocationDescription ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{a.householdSize}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={20} total={total} onPage={setPage} />
    </div>
  );
}
