const API_BASE = "/api/v1";

let _getToken: (() => string | null) | null = null;

export function setTokenProvider(fn: () => string | null): void {
  _getToken = fn;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = _getToken?.();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Let the auth context handle logout via event
    window.dispatchEvent(new Event("l2l:unauthorized"));
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function syncItem(
  type: string,
  payload: unknown,
  token: string,
): Promise<void> {
  const pathMap: Record<string, string> = {
    create_resident: "/residents",
    create_stand: "/stands",
  };

  if (type === "submit_application") {
    const res = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
    return;
  }

  if (type === "link_occupancy") {
    const p = payload as { standId: string; residentId: string; relationship: string };
    const res = await fetch(`${API_BASE}/stands/${p.standId}/occupants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ residentId: p.residentId, relationship: p.relationship }),
    });
    if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
    return;
  }

  const path = pathMap[type];
  if (!path) throw new Error(`Unknown sync type: ${type}`);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
}
