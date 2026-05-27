import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth.js";

type Role = "founder" | "council_secretary" | "council_member" | "foot_soldier" | "land_officer";

interface NavItem  { to: string; label: string; roles: Role[]; }
interface NavGroup { id: string; label: string; prefix: string; roles: Role[]; items: NavItem[]; }

const LAND_ITEMS: NavItem[] = [
  { to: "/dashboard/land/overview",       label: "Dashboard",          roles: ["founder", "council_secretary", "council_member", "land_officer"] },
  { to: "/dashboard/land/residents",      label: "Residents",          roles: ["founder", "council_secretary", "council_member", "foot_soldier"] },
  { to: "/dashboard/land/available",      label: "Available Land",     roles: ["founder", "council_secretary", "council_member", "land_officer", "foot_soldier"] },
  { to: "/dashboard/land/applications",   label: "Land Applications",  roles: ["founder", "council_secretary", "council_member", "land_officer"] },
  { to: "/dashboard/land/allocated",      label: "Allocated Land",     roles: ["founder", "council_secretary", "council_member"] },
  { to: "/dashboard/land/configurations", label: "Configurations",     roles: ["founder", "council_secretary"] },
];

const MARKETPLACE_ITEMS: NavItem[] = [
  { to: "/dashboard/marketplace/resales",     label: "Land Resales", roles: ["founder", "council_secretary", "council_member"] },
  { to: "/dashboard/marketplace/house-sales", label: "House Sales",  roles: ["founder", "council_secretary"] },
  { to: "/dashboard/marketplace/services",    label: "Services",     roles: ["founder", "council_secretary"] },
  { to: "/dashboard/marketplace/suppliers",   label: "Suppliers",    roles: ["founder", "council_secretary"] },
];

const NAV_GROUPS: NavGroup[] = [
  { id: "land",        label: "Land Administration", prefix: "/dashboard/land",        roles: ["founder", "council_secretary", "council_member", "land_officer", "foot_soldier"], items: LAND_ITEMS },
  { id: "marketplace", label: "Marketplace",         prefix: "/dashboard/marketplace", roles: ["founder", "council_secretary", "council_member"],                                items: MARKETPLACE_ITEMS },
];

const FLAT_ITEMS: NavItem[] = [
  { to: "/dashboard/audit", label: "Audit Log", roles: ["founder", "council_secretary"] },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-forest-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function AppShell() {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = auth?.claims.role as Role | undefined;

  // A group is open by default if the current path falls inside it.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      init[g.id] = location.pathname.startsWith(g.prefix);
    }
    // If no group matched, open land admin by default.
    if (!Object.values(init).some(Boolean)) init["land"] = true;
    return init;
  });

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-screen bg-forest-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-forest-800 text-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center border-b border-forest-700 px-6">
          <span className="text-lg font-bold tracking-tight">L2L Council</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {NAV_GROUPS.map(group => {
            if (!role || !group.roles.includes(role)) return null;
            const visibleItems = group.items.filter(it => it.roles.includes(role));
            if (visibleItems.length === 0) return null;
            const isOpen = openGroups[group.id] ?? false;

            return (
              <div key={group.id}>
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between px-5 py-2 text-xs font-semibold uppercase tracking-widest text-forest-300 hover:text-white transition-colors"
                >
                  {group.label}
                  <ChevronIcon open={isOpen} />
                </button>

                {/* Group items */}
                {isOpen && (
                  <div className="mt-0.5 mb-2">
                    {visibleItems.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={closeSidebar}
                        className={({ isActive }) =>
                          `flex items-center pl-7 pr-4 py-2 text-sm transition-colors ${
                            isActive
                              ? "bg-forest-600 text-white font-medium"
                              : "text-forest-200 hover:bg-forest-700 hover:text-white"
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Flat items (Audit Log etc.) */}
          {FLAT_ITEMS.filter(it => role && it.roles.includes(role)).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-forest-600 text-white font-medium"
                    : "text-forest-200 hover:bg-forest-700 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-forest-700 px-6 py-3 text-xs text-forest-400">
          {auth?.claims.tenantSlug}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <button
            className="text-forest-700 hover:text-forest-900 lg:hidden"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex flex-1 items-center justify-end gap-4">
            <span className="text-sm text-gray-500 capitalize">
              {auth?.claims.role.replace(/_/g, " ")}
            </span>
            <button
              onClick={logout}
              className="text-sm font-medium text-terracotta-600 transition-colors hover:text-terracotta-800"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
