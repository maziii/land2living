import { useEffect, useRef, type ReactNode } from "react";

// ── Active filter chip ────────────────────────────────────────────────────────

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-forest-50 text-forest-700 border border-forest-200 rounded-full text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="text-forest-400 hover:text-forest-700 leading-none transition-colors"
      >
        ×
      </button>
    </span>
  );
}

// ── Filter field wrappers ─────────────────────────────────────────────────────

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

export const filterSelectClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 bg-white";

export const filterInputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500";

// ── Filter dropdown panel ─────────────────────────────────────────────────────

interface FilterDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}

export function FilterDropdown({
  open,
  onOpenChange,
  activeCount,
  onClear,
  children,
}: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors
          ${activeCount > 0
            ? "border-forest-400 bg-forest-50 text-forest-700"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          }`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-forest-600 text-white text-xs flex items-center justify-center font-bold leading-none">
            {activeCount}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-20">
          <div className="p-4 space-y-4">
            {children}
          </div>
          {activeCount > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-400">{activeCount} active filter{activeCount !== 1 ? "s" : ""}</span>
              <button
                type="button"
                onClick={() => { onClear(); onOpenChange(false); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
