import type { FormEvent } from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

interface LocationState {
  challengeToken?: string;
}

export function MfaChallengePage() {
  const { completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const challengeToken = (location.state as LocationState | null)?.challengeToken;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!challengeToken) {
    navigate("/login", { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await completeMfa(challengeToken, code);
      navigate("/dashboard");
    } catch {
      setError("Invalid code. Please try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-forest-800">L2L Council</h1>
          <p className="mt-1 text-forest-600">Two-factor authentication</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-8 shadow-md">
          <p className="text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app.
          </p>

          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-transparent focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          {error !== null && <p className="text-sm text-terracotta-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest-800 focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="w-full text-sm text-forest-600 hover:text-forest-800"
          >
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
}
