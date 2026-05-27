import { useLocation } from "react-router-dom";

export function PlaceholderPage() {
  const { pathname } = useLocation();
  const segment = pathname.split("/").filter(Boolean).pop() ?? "page";
  const name = segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-forest-900">{name}</h2>
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-gray-400">
        <p className="text-sm">This module will be built in a future work package.</p>
      </div>
    </div>
  );
}
