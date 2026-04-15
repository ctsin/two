export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function apiFetch(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
