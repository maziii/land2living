import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { fetchResidents, type ResidentSummary } from "../../api/residents.js";
import { Pagination } from "../../components/Pagination.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { MultiSelect } from "../../components/MultiSelect.js";
import {
  FilterDropdown,
  FilterChip,
  FilterField,
} from "../../components/FilterDropdown.js";

type ViewMode = "card" | "list";

const VERIFICATION_OPTIONS = [
  { value: "unverified",        label: "Unverified" },
  { value: "identity_verified", label: "Identity verified" },
  { value: "council_verified",  label: "Council verified" },
];

const LANGUAGE_OPTIONS = [
  { value: "zulu",    label: "Zulu" },
  { value: "ndebele", label: "Ndebele" },
  { value: "sotho",   label: "Sotho" },
  { value: "xhosa",   label: "Xhosa" },
  { value: "tswana",  label: "Tswana" },
  { value: "english", label: "English" },
];

// ── Resident card ─────────────────────────────────────────────────────────────

function initials(r: ResidentSummary) {
  return [r.firstName[0], r.lastName[0]].filter(Boolean).join("").toUpperCase();
}

function maskId(id: string) {
  return id.length > 6 ? `${id.slice(0, 6)}${"*".repeat(Math.min(id.length - 6, 4))}` : id;
}

function ResidentCard({ resident }: { resident: ResidentSummary }) {
  return (
    <Link
      to={resident.id}
      className="group flex flex-col gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-forest-300 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-forest-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initials(resident)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 group-hover:text-forest-700 transition-colors truncate">
            {resident.firstName} {resident.lastName}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{resident.languagePreference}</p>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {resident.phoneNumber}
        </div>
        <div className="flex items-center gap-2 text-gray-500 font-mono text-xs">
          <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
          </svg>
          {maskId(resident.idNumber)}
        </div>
      </div>
      <div className="pt-2 border-t border-gray-100">
        <StatusBadge status={resident.verificationStatus} />
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

export function ResidentsPage() {
  const { apiFetch } = useAuth();
  const [residents, setResidents]         = useState<ResidentSummary[]>([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(1);
  const [search, setSearch]               = useState("");
  const [searchInput, setSI]              = useState("");
  const [vStatuses, setVStatuses]         = useState<string[]>([]);
  const [languages, setLanguages]         = useState<string[]>([]);
  const [view, setView]                   = useState<ViewMode>("list");
  const [filterOpen, setFO]               = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  const activeFilterCount = (vStatuses.length > 0 ? 1 : 0) + (languages.length > 0 ? 1 : 0);

  function clearAllFilters() {
    setVStatuses([]);
    setLanguages([]);
    setPage(1);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchResidents(apiFetch, {
      page, pageSize: 20,
      ...(search              && { search }),
      // API accepts single verificationStatus; send first selected value
      ...(vStatuses.length    && { verificationStatus: vStatuses[0] }),
    })
      .then(({ residents: data, total: t }) => { setResidents(data); setTotal(t); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, search, vStatuses]);

  // Client-side language filter (API does not yet support language filter)
  const visibleResidents = languages.length
    ? residents.filter(r => languages.includes(r.languagePreference ?? ""))
    : residents;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Residents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} {activeFilterCount > 0 || search ? "matching" : "total"}</p>
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
              placeholder="Search name or phone…"
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 w-60"
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
          <FilterField label="Verification status">
            <MultiSelect
              options={VERIFICATION_OPTIONS}
              selected={vStatuses}
              onChange={v => { setVStatuses(v); setPage(1); }}
            />
          </FilterField>

          <FilterField label="Language">
            <MultiSelect
              options={LANGUAGE_OPTIONS}
              selected={languages}
              onChange={v => { setLanguages(v); setPage(1); }}
            />
          </FilterField>
        </FilterDropdown>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {vStatuses.map(s => (
            <FilterChip
              key={s}
              label={`Status: ${VERIFICATION_OPTIONS.find(o => o.value === s)?.label ?? s}`}
              onRemove={() => { setVStatuses(prev => prev.filter(x => x !== s)); setPage(1); }}
            />
          ))}
          {languages.map(l => (
            <FilterChip
              key={l}
              label={`Language: ${LANGUAGE_OPTIONS.find(o => o.value === l)?.label ?? l}`}
              onRemove={() => setLanguages(prev => prev.filter(x => x !== l))}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : visibleResidents.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No residents found</div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleResidents.map(r => <ResidentCard key={r.id} resident={r} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">ID Number</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleResidents.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={r.id} className="text-forest-700 hover:underline font-medium">
                      {r.firstName} {r.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.phoneNumber}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.idNumber}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.verificationStatus} /></td>
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
