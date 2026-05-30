import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/auth.js";
import { listPTOs, openPTOPDF, type PTOSummary, type PTOStatus } from "../../api/ptos.js";
import { Pagination } from "../../components/Pagination.js";

const PAGE_SIZE = 20;

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:     { label: "Active",     cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  superseded: { label: "Superseded", cls: "bg-slate-100 text-slate-500 border-slate-200"       },
};

function PTOStatusBadge({ status }: { status: PTOStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG["active"]!;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-600 text-white text-xs font-bold uppercase">
      {letters || "?"}
    </div>
  );
}

export function PTOsPage() {
  const { apiFetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const search  = searchParams.get("search")  ?? "";
  const status  = (searchParams.get("status") ?? "all") as "active" | "superseded" | "all";
  const village = searchParams.get("village") ?? "";
  const page    = Number(searchParams.get("page") ?? "1");

  const [ptos, setPTOs]     = useState<PTOSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const [searchInput, setSearchInput]   = useState(search);
  const [villageInput, setVillageInput] = useState(village);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    listPTOs(apiFetch, { page, pageSize: PAGE_SIZE, search: search || undefined, status, village: village || undefined })
      .then(r => { setPTOs(r.ptos); setTotal(r.total); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [apiFetch, page, search, status, village]);

  function updateParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== "all") next.set(key, value); else next.delete(key);
      next.delete("page");
      return next;
    });
  }

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => updateParam("search", val), 350);
  }

  function handleVillageChange(val: string) {
    setVillageInput(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => updateParam("village", val), 350);
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PTO Register</h1>
          <p className="mt-0.5 text-sm text-gray-500">Permission to Occupy certificates — digital record of communal land allocations</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-4 py-2">
          <svg className="h-4 w-4 text-forest-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-semibold text-forest-700">{loading ? "…" : total} PTO{total !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name, stand ref, PTO ID…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
          />
        </div>

        <input
          type="text"
          value={villageInput}
          onChange={e => handleVillageChange(e.target.value)}
          placeholder="Filter by village…"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100 w-44"
        />

        <select
          value={status}
          onChange={e => updateParam("status", e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="superseded">Superseded / Revoked</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-9 w-9 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-2/5" />
                  <div className="h-3 bg-gray-50 rounded w-3/5" />
                </div>
                <div className="h-5 w-20 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        ) : ptos.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <svg className="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-600">No PTOs found</p>
            <p className="mt-1 text-xs text-gray-400">
              {search || village ? "Try adjusting your search or filters." : "PTOs are issued when land applications are approved."}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <div className="w-9" />
              <div>Occupant</div>
              <div>Stand / Location</div>
              <div>Issued</div>
              <div>Status</div>
              <div />
            </div>

            <div className="divide-y divide-gray-50">
              {ptos.map(pto => (
                <div key={pto.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-gray-50 transition-colors">
                  <Initials name={pto.residentName} />

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{pto.residentName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{pto.id.slice(0, 8).toUpperCase()}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">{pto.standRef ?? pto.standAddress}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">{pto.standVillage}</p>
                  </div>

                  <div className="text-xs text-gray-500 whitespace-nowrap">{formatDate(pto.createdAt)}</div>

                  <PTOStatusBadge status={pto.status} />

                  <div className="flex items-center gap-2">
                    <button
                      title="Download PDF"
                      onClick={e => { e.stopPropagation(); void openPTOPDF(apiFetch, pto.id); }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-forest-300 hover:text-forest-600 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    <Link
                      to={`/dashboard/land/ptos/${pto.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-forest-300 hover:text-forest-600 transition-colors"
                      title="View details"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 px-5 py-4">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPage={p => setSearchParams(prev => { const next = new URLSearchParams(prev); next.set("page", String(p)); return next; })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
