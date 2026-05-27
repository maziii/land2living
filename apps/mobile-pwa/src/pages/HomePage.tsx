import { Link } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { useSync } from "../context/sync.js";

export default function HomePage() {
  const { auth, logout } = useAuth();
  const { pendingCount, syncNow } = useSync();

  return (
    <div className="min-h-screen bg-forest-50">
      {/* Header */}
      <header className="bg-forest-700 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">L2L Field</h1>
          <p className="text-forest-300 text-xs">{auth?.tenantSlug}</p>
        </div>
        <button
          onClick={logout}
          className="text-forest-300 hover:text-white text-sm"
        >
          Sign out
        </button>
      </header>

      {/* Sync banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-amber-700 text-sm">
            {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending sync
          </span>
          {navigator.onLine ? (
            <button
              onClick={() => void syncNow()}
              className="text-amber-700 font-semibold text-sm underline"
            >
              Sync now
            </button>
          ) : (
            <span className="text-amber-500 text-xs">Offline</span>
          )}
        </div>
      )}

      {/* Action cards */}
      <main className="px-4 py-6 space-y-4">
        <h2 className="text-forest-800 font-semibold text-sm uppercase tracking-wide">
          Field Actions
        </h2>

        <Link
          to="/browse-listings"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              🏡
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Browse Listings</h3>
              <p className="text-gray-500 text-sm mt-0.5">Find stands and properties for sale</p>
            </div>
          </div>
        </Link>

        <Link
          to="/create-listing"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              🔖
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">List My Stand</h3>
              <p className="text-gray-500 text-sm mt-0.5">Create a resale listing for your stand</p>
            </div>
          </div>
        </Link>

        <Link
          to="/register-resident"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              👤
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Register Resident</h3>
              <p className="text-gray-500 text-sm mt-0.5">Capture a new resident record</p>
            </div>
          </div>
        </Link>

        <Link
          to="/register-stand"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              📍
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Register Stand</h3>
              <p className="text-gray-500 text-sm mt-0.5">Capture a new stand with GPS</p>
            </div>
          </div>
        </Link>

        <Link
          to="/link-occupancy"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              🔗
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Link Resident to Stand</h3>
              <p className="text-gray-500 text-sm mt-0.5">Connect a resident to their stand</p>
            </div>
          </div>
        </Link>

        <Link
          to="/submit-application"
          className="block bg-white rounded-2xl shadow-sm p-5 border border-forest-100 active:bg-forest-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-forest-100 rounded-xl flex items-center justify-center text-2xl">
              📋
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Submit Application</h3>
              <p className="text-gray-500 text-sm mt-0.5">Apply for a new or additional stand</p>
            </div>
          </div>
        </Link>
      </main>
    </div>
  );
}
