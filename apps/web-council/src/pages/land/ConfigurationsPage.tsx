export function ConfigurationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurations</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Council settings — areas, villages, fees, and contact details
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <p className="text-amber-800 font-medium text-sm">Coming soon</p>
        <p className="text-amber-700 text-xs mt-1">
          This section will allow council administrators to configure covered villages, council contact details,
          standard allocation fees, and other tenant-level settings.
        </p>
      </div>
    </div>
  );
}
