import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchApplications, type ApplicationSummary } from "../../api/applications.js";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function applicantName(a: ApplicationSummary) {
  if (a.applicantFirstName || a.applicantLastName)
    return [a.applicantFirstName, a.applicantLastName].filter(Boolean).join(" ");
  return `Ref ${a.id.slice(0, 6).toUpperCase()}`;
}

function initials(a: ApplicationSummary) {
  const first = a.applicantFirstName?.[0] ?? "";
  const last  = a.applicantLastName?.[0]  ?? "";
  return (first + last).toUpperCase() || "?";
}

// ── Allocated card ────────────────────────────────────────────────────────────

function AllocatedCard({ a }: { a: ApplicationSummary }) {
  return (
    <div className="group bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:border-forest-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-forest-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initials(a)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{applicantName(a)}</p>
          {a.applicantPhone && (
            <p className="text-xs text-gray-400 mt-0.5">{a.applicantPhone}</p>
          )}
        </div>
        <div className="ml-auto shrink-0">
          <StatusBadge status={a.status} />
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-gray-500">
        {a.villageName && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {a.villageName}
          </div>
        )}
        {a.allocatedStandId && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7l9-4 9 4v13H3V7z" />
            </svg>
            <Link
              to={`/dashboard/land/available/${a.allocatedStandId}`}
              className="text-forest-700 hover:underline font-mono"
              onClick={e => e.stopPropagation()}
            >
              {a.allocatedStandId.slice(0, 8).toUpperCase()}…
            </Link>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <Link
          to={`/dashboard/land/applications/${a.id}`}
          className="text-xs text-forest-600 hover:text-forest-800 font-medium transition-colors"
        >
          View application →
        </Link>
      </div>
    </div>
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

export function AllocatedLandPage() {
  const { apiFetch } = useAuth();
  const [applications, setApplications]     = useState<ApplicationSummary[]>([]);
  const [total, setTotal]                   = useState(0);
  const [page, setPage]                     = useState(1);
  const [search, setSearch]                 = useState("");
  const [searchInput, setSI]                = useState("");
  const [villageFilters, setVillages]       = useState<string[]>([]);
  const [view, setView]                     = useState<ViewMode>("list");
  const [filterOpen, setFO]                 = useState(false);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  // Village options from register
  const [villageOptions, setVillageOptions] = useState<string[]>([]);
  const [villagesLoading, setVL]            = useState(true);

  const activeFilterCount = villageFilters.length > 0 ? 1 : 0;

  // Fetch village options
  useEffect(() => {
    setVL(true);
    fetchStandVillages(apiFetch)
      .then(vs => setVillageOptions(vs))
      .catch(() => setVillageOptions([]))
      .finally(() => setVL(false));
  }, [apiFetch]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchApplications(apiFetch, {
      statuses: ["active"],
      page,
      pageSize: 20,
      ...(search                && { search }),
      ...(villageFilters.length && { villageNames: villageFilters }),
    })
      .then(({ applications: data, total: t }) => { setApplications(data); setTotal(t); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, search, villageFilters]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Allocated Land</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} {search || activeFilterCount > 0 ? "matching" : "active"} PTO{total !== 1 ? "s" : ""}
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSI(e.target.value)}
              placeholder="Search occupant name…"
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
          onClear={() => { setVillages([]); setPage(1); }}
        >
          <FilterField label="Village">
            <MultiSelect
              options={villageOptions.map(v => ({ value: v, label: v }))}
              selected={villageFilters}
              onChange={v => { setVillages(v); setPage(1); }}
              loading={villagesLoading}
              placeholder="No villages in register yet"
            />
          </FilterField>
        </FilterDropdown>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {villageFilters.map(v => (
            <FilterChip
              key={v}
              label={`Village: ${v}`}
              onRemove={() => { setVillages(prev => prev.filter(x => x !== v)); setPage(1); }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 font-medium text-sm">No active allocations found</p>
          <p className="text-gray-400 text-xs mt-1">
            {search || activeFilterCount > 0
              ? "Try adjusting your search or filter."
              : "PTOs appear here once payment is confirmed and the PTO is signed."}
          </p>
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map(a => <AllocatedCard key={a.id} a={a} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Occupant</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Village</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Stand</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{applicantName(a)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.villageName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.allocatedStandId ? (
                      <Link to={`/dashboard/land/available/${a.allocatedStandId}`}
                        className="text-forest-700 hover:underline text-xs font-mono">
                        {a.allocatedStandId.slice(0, 8).toUpperCase()}…
                      </Link>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/dashboard/land/applications/${a.id}`}
                      className="text-forest-600 hover:text-forest-800 font-medium">
                      View →
                    </Link>
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
