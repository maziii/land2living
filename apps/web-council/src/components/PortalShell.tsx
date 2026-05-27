import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

export function PortalShell() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-forest-50">
      <header className="bg-forest-800 text-white shadow-md">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-4 h-14">
          <Link to="/portal" className="text-base font-bold tracking-tight">
            L2L Resident Portal
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={handleLogout}
              className="text-forest-300 hover:text-white transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
