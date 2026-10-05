// Backend secrets never belong here. Only the public API address is configured.
const base = (import.meta.env["VITE_API_URL"] || "http://127.0.0.1:8000").replace(/\/$/, "");
type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};
let tokens: Tokens | null = null;
let refreshing: Promise<void> | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function restoreTokens() {
  if (typeof window === "undefined") return false;
  try {
    tokens = JSON.parse(sessionStorage.getItem("monaqesh-tokens") || "null");
  } catch {
    tokens = null;
  }
  return !!tokens;
}
export function clearTokens() {
  tokens = null;
  if (typeof window !== "undefined") sessionStorage.removeItem("monaqesh-tokens");
}
function storeTokens(value: Tokens) {
  tokens = value;
  sessionStorage.setItem("monaqesh-tokens", JSON.stringify(value));
}
async function decode(response: Response) {
  if (response.status === 204) return undefined;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new ApiError(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((v: { loc: string[]; msg: string }) => `${v.loc.join(".")}: ${v.msg}`)
              .join("; ")
          : `Request failed (${response.status})`,
      response.status,
    );
  }
  return data;
}
async function raw(path: string, init: RequestInit = {}, authenticated = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (authenticated && tokens) headers.set("Authorization", `Bearer ${tokens.access_token}`);
  try {
    return await fetch(base + path, { ...init, headers });
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Check that FastAPI is running and the API address is correct.",
      0,
    );
  }
}
async function refreshTokens() {
  if (!tokens) throw new ApiError("Please sign in again.", 401);
  const value = await decode(
    await raw(
      "/api/auth/refresh",
      { method: "POST", body: JSON.stringify({ refresh_token: tokens.refresh_token }) },
      false,
    ),
  );
  storeTokens(value);
}
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await raw(path, init);
  if (response.status === 401 && tokens) {
    try {
      if (!refreshing)
        refreshing = refreshTokens().finally(() => {
          refreshing = null;
        });
      await refreshing;
      response = await raw(path, init);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearTokens();
        window.dispatchEvent(new Event("monaqesh-signed-out"));
      }
      throw error;
    }
  }
  if (response.status === 401) {
    clearTokens();
    window.dispatchEvent(new Event("monaqesh-signed-out"));
  }
  return decode(response);
}
export async function signIn(identifier: string, password: string) {
  const value = await decode(
    await raw(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ identifier, password }) },
      false,
    ),
  );
  storeTokens(value);
}
export async function signOut() {
  try {
    if (tokens)
      await api("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });
  } finally {
    clearTokens();
  }
}
export async function downloadFile(path: string, name: string) {
  let response = await raw(path);
  if (response.status === 401) {
    if (!refreshing)
      refreshing = refreshTokens().finally(() => {
        refreshing = null;
      });
    await refreshing;
    response = await raw(path);
  }
  if (!response.ok) {
    await decode(response);
    return;
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
export const patch = (path: string, body: unknown) =>
  api(path, { method: "PATCH", body: JSON.stringify(body) });
export const remove = (path: string) => api(path, { method: "DELETE" });
