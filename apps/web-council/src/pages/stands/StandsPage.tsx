import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import {
  fetchStands,
  fetchStandVillages,
  STAND_TYPE_LABEL,
  STAND_TYPES,
  type StandSummary,
} from "../../api/stands.js";
import { Pagination } from "../../components/Pagination.js";
import { MultiSelect } from "../../components/MultiSelect.js";
import {
  FilterDropdown,
  FilterChip,
  FilterField,
} from "../../components/FilterDropdown.js";

type ViewMode = "card" | "list";

const STAND_TYPE_OPTIONS = STAND_TYPES.map(t => ({ value: t, label: STAND_TYPE_LABEL[t] }));

// ── Stand type badge colours ──────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  residential: "bg-blue-100 text-blue-700",
  business:    "bg-purple-100 text-purple-700",
  farming:     "bg-green-100 text-green-700",
  community:   "bg-amber-100 text-amber-700",
};

// ── Stand card ────────────────────────────────────────────────────────────────

function StandCard({ stand }: { stand: StandSummary }) {
  const [imgIdx, setImgIdx] = useState(0);
  const hasPhotos = stand.photoUrls.length > 0;
  const label = stand.standType
    ? (STAND_TYPE_LABEL[stand.standType as keyof typeof STAND_TYPE_LABEL] ?? stand.standType)
    : null;

  return (
    <Link
      to={stand.id}
      className="group block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-forest-300 transition-all"
    >
      {/* Photo area */}
      <div className="relative h-44 bg-gray-100">
        {hasPhotos ? (
          <>
            <img src={stand.photoUrls[imgIdx]} alt={stand.addressDescription}
              className="w-full h-full object-cover" />
            {stand.photoUrls.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {stand.photoUrls.map((_, i) => (
                  <button key={i} type="button"
                    onClick={e => { e.preventDefault(); setImgIdx(i); }}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIdx ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7l9-4 9 4v13H3V7z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20V12h6v8" />
            </svg>
            <span className="text-xs">No photos yet</span>
          </div>
        )}
        {label && (
          <span className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[stand.standType!] ?? "bg-gray-100 text-gray-600"}`}>
            {label}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-forest-700 leading-snug line-clamp-2">
            {stand.addressDescription}
          </p>
          {stand.priceZar != null ? (
            <span className="text-sm font-bold text-forest-700 shrink-0">
              R {stand.priceZar.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          ) : stand.areaSquareMetres ? (
            <span className="text-sm font-semibold text-gray-500 shrink-0">
              {stand.areaSquareMetres.toLocaleString()} m²
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{stand.villageOrSection}</span>
          </p>
          {stand.areaSquareMetres && stand.priceZar != null && (
            <span className="text-xs text-gray-400 shrink-0">{stand.areaSquareMetres.toLocaleString()} m²</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400 font-mono">
            {stand.localReference ?? stand.id.slice(0, 8).toUpperCase()}
          </span>
          {stand.photoUrls.length > 0 && (
            <span className="text-xs text-gray-400">
              {stand.photoUrls.length} photo{stand.photoUrls.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
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

export function StandsPage() {
  const { apiFetch, auth } = useAuth();
  const [stands, setStands]             = useState<StandSummary[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState("");
  const [searchInput, setSI]            = useState("");
  const [villageFilters, setVillages]   = useState<string[]>([]);
  const [typeFilters, setTypes]         = useState<string[]>([]);
  const [view, setView]                 = useState<ViewMode>("card");
  const [filterOpen, setFO]             = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Village options from register
  const [villageOptions, setVillageOptions] = useState<string[]>([]);
  const [villagesLoading, setVL]            = useState(true);

  const canCreate = ["council_secretary", "founder", "land_officer", "foot_soldier"].includes(auth?.claims.role ?? "");
  const activeFilterCount = (villageFilters.length > 0 ? 1 : 0) + (typeFilters.length > 0 ? 1 : 0);

  function clearAllFilters() {
    setVillages([]);
    setTypes([]);
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

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStands(apiFetch, {
      page, pageSize: 20,
      ...(search                && { search }),
      // API accepts single villageOrSection; send first selected value
      ...(villageFilters.length && { villageOrSection: villageFilters[0] }),
    })
      .then(({ stands: data, total: t }) => { setStands(data); setTotal(t); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, search, villageFilters]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  // Client-side stand type filter
  const visibleStands = typeFilters.length
    ? stands.filter(s => s.standType !== null && typeFilters.includes(s.standType))
    : stands;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Available Land</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {typeFilters.length ? visibleStands.length : total} {activeFilterCount > 0 || search ? "matching" : "total"} in register
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {canCreate && (
            <Link to="new"
              className="bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add stand
            </Link>
          )}
        </div>
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
              placeholder="Search address or reference…"
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
          <FilterField label="Village / section">
            <MultiSelect
              options={villageOptions.map(v => ({ value: v, label: v }))}
              selected={villageFilters}
              onChange={v => { setVillages(v); setPage(1); }}
              loading={villagesLoading}
              placeholder="No villages in register yet"
            />
          </FilterField>

          <FilterField label="Stand type">
            <MultiSelect
              options={STAND_TYPE_OPTIONS}
              selected={typeFilters}
              onChange={v => { setTypes(v); setPage(1); }}
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
          {typeFilters.map(t => (
            <FilterChip
              key={t}
              label={`Type: ${STAND_TYPE_LABEL[t as keyof typeof STAND_TYPE_LABEL] ?? t}`}
              onRemove={() => setTypes(prev => prev.filter(x => x !== t))}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : visibleStands.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p>No stands found.</p>
          {canCreate && (
            <Link to="new" className="text-forest-600 hover:underline text-sm mt-2 inline-block">
              Add the first stand →
            </Link>
          )}
        </div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleStands.map(s => <StandCard key={s.id} stand={s} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Address</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Village</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Area (m²)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleStands.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={s.id} className="text-forest-700 hover:underline font-medium">
                      {s.addressDescription}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.villageOrSection}</td>
                  <td className="px-4 py-3">
                    {s.standType && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[s.standType] ?? "bg-gray-100 text-gray-600"}`}>
                        {STAND_TYPE_LABEL[s.standType as keyof typeof STAND_TYPE_LABEL] ?? s.standType}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.localReference ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-right">{s.areaSquareMetres?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700 text-right font-medium">
                    {s.priceZar != null
                      ? `R ${s.priceZar.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : "—"}
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
