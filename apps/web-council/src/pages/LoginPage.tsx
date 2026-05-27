import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth.js";

const TENANT_SLUG = (import.meta.env["VITE_TENANT_SLUG"] as string | undefined) ?? "ndebele";

const DEV_HINTS =
  import.meta.env.DEV
    ? [
        { email: "secretary@ndebele.dev", role: "Council Secretary" },
        { email: "founder@ndebele.dev",   role: "Founder"           },
        { email: "member@ndebele.dev",    role: "Council Member"    },
        { email: "soldier@ndebele.dev",   role: "Foot Soldier"      },
        { email: "resident@ndebele.dev",  role: "Resident"          },
      ]
    : [];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectError = (location.state as { error?: string } | null)?.error ?? null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(redirectError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const mfaPending = await login(email, password);
      if (mfaPending) {
        navigate("/mfa-challenge", { state: { challengeToken: mfaPending.challengeToken } });
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError("Invalid email or password. Make sure the dev server is running and the database is seeded (npm run dev:seed).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-forest-800">L2L Council</h1>
          <p className="mt-1 text-forest-600">Sign in to your account</p>
          <span className="mt-2 inline-block rounded-full bg-forest-100 px-3 py-0.5 text-xs font-medium text-forest-700">
            Tenant: {TENANT_SLUG}
          </span>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 rounded-2xl bg-white p-8 shadow-md">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          {error !== null && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-800 focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          New resident?{" "}
          <Link to="/register" className="font-medium text-forest-700 hover:text-forest-900 hover:underline">
            Create an account
          </Link>
        </p>

        {DEV_HINTS.length > 0 && (
          <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs font-semibold text-amber-800 mb-2">Dev accounts (password: L2Ldev1234!)</p>
            <div className="space-y-1">
              {DEV_HINTS.map((h) => (
                <button
                  key={h.email}
                  type="button"
                  onClick={() => setEmail(h.email)}
                  className="block w-full text-left rounded px-2 py-1 text-xs hover:bg-amber-100 transition-colors"
                >
                  <span className="font-medium text-amber-900">{h.role}</span>
                  <span className="text-amber-600 ml-2">{h.email}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2">Run <code className="bg-amber-100 px-1 rounded">npm run dev:seed</code> if accounts don't exist yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
