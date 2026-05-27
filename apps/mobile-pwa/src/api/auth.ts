const API_BASE = "/api/v1";

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  challengeToken?: string;
}

export async function apiLogin(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Login failed");
  }
  return res.json() as Promise<LoginResponse>;
}

export async function apiRefresh(
  refreshToken: string,
  tenantSlug: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, tenantSlug }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}
