export function HouseSalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">House Sales</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Listings for houses and structures on communal land
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <p className="text-amber-800 font-medium text-sm">Coming soon</p>
        <p className="text-amber-700 text-xs mt-1">
          House sales will be available once the land resale workflow is fully established.
          Residents will be able to list structures built on their allocated stands.
        </p>
      </div>
    </div>
  );
}
