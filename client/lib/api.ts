import type {
  AppState,
  DuplicatePlace,
  Place,
  QueryRecord,
} from "../../shared/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "请求没有成功，请稍后重试。";
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export const api = {
  session: () =>
    request<{ authenticated: boolean }>("/api/session"),
  state: () => request<AppState>("/api/state"),
  register: (input: { email: string; name: string; password: string }) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: { email: string; password: string }) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  createQuery: (input: string) =>
    request<{ query: QueryRecord; agentMode: "api" | "skill" }>(
      "/api/queries",
      {
        method: "POST",
        body: JSON.stringify({ input }),
      },
    ),
  loadDemo: () =>
    request<QueryRecord>("/api/demo", { method: "POST" }),
  addCandidate: (
    id: string,
    options: { mergePlaceId?: string; forceNew?: boolean } = {},
  ) =>
    request<Place | { duplicates: DuplicatePlace[] }>(
      `/api/candidates/${id}/add`,
      {
        method: "POST",
        body: JSON.stringify(options),
      },
    ),
  toggleLike: (id: string) =>
    request<Place>(`/api/places/${id}/like`, { method: "POST" }),
  deletePlace: (id: string) =>
    request<void>(`/api/places/${id}`, { method: "DELETE" }),
  createCategory: (name: string, color: string) =>
    request("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  toggleCategory: (placeId: string, categoryId: string) =>
    request<Place>(
      `/api/places/${placeId}/categories/${categoryId}`,
      { method: "POST" },
    ),
  decideRule: (id: string, accept: boolean) =>
    request<void>(`/api/rules/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    }),
};
