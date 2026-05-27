export interface JwtClaims {
  userId: string;
  tenantSlug: string;
  role: string;
  exp: number;
  iat: number;
  isMfaChallenge?: true;
}

export function parseJwt(token: string): JwtClaims {
  const parts = token.split(".");
  const payload = parts[1];
  if (!payload) throw new Error("Invalid JWT");
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as JwtClaims;
}
