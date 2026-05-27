import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin } from "../api/auth.js";
import { useAuth } from "../context/auth.js";

const TENANT_SLUG = import.meta.env["VITE_TENANT_SLUG"] as string ?? "ndebele";

export default function LoginPage() {
  const { setTokens } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin(email, password, TENANT_SLUG);
      if (res.mfaRequired && res.challengeToken) {
        navigate("/mfa", { state: { challengeToken: res.challengeToken } });
        return;
      }
      if (res.accessToken && res.refreshToken) {
        setTokens(res.accessToken, res.refreshToken);
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-forest-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-forest-600 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl font-bold">L</span>
          </div>
          <h1 className="text-2xl font-bold text-forest-800">L2L Field</h1>
          <p className="text-forest-600 text-sm mt-1">Land2Living — Field Registration</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-800 mb-2">Dev accounts — tap to fill email (pw: L2Ldev1234!)</p>
            {[
              { email: "soldier@ndebele.dev", role: "Foot Soldier" },
              { email: "resident@ndebele.dev", role: "Resident" },
              { email: "secretary@ndebele.dev", role: "Council Secretary" },
            ].map((h) => (
              <button
                key={h.email}
                type="button"
                onClick={() => setEmail(h.email)}
                className="block w-full text-left rounded px-2 py-1.5 text-xs hover:bg-amber-100 active:bg-amber-200 transition-colors"
              >
                <span className="font-semibold text-amber-900">{h.role}</span>
                <span className="text-amber-600 ml-2">{h.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
