const BASE = "/api/v1/auth";

export type LoginResult =
  | { mfaRequired: true; challengeToken: string }
  | { accessToken: string; refreshToken: string };

export async function apiLogin(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<LoginResult> {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<LoginResult>;
}

export async function apiMfaChallenge(
  challengeToken: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${BASE}/mfa/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken, code }),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

export async function apiRefresh(
  refreshToken: string,
  tenantSlug: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, tenantSlug }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

export interface SelfRegisterData {
  email: string;
  password: string;
  tenantSlug: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  languagePreference: string;
  idNumber?: string;
  consentPopia: true;
  consentTerms: true;
}

export async function apiSelfRegister(
  data: SelfRegisterData,
): Promise<{ accessToken: string; refreshToken: string; residentId: string }> {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
    throw new Error(err.detail ?? err.title ?? "Registration failed");
  }
  return res.json() as Promise<{ accessToken: string; refreshToken: string; residentId: string }>;
}

export async function apiLogout(refreshToken: string): Promise<void> {
  await fetch(`${BASE}/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
