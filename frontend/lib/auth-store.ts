import { create } from "zustand"
import { persist } from "zustand/middleware"
import Cookies from "js-cookie"

export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: string
  created_at: string
  is_active?: boolean
  capabilities?: string[]
  workspace_id?: number | null
  workspace_name?: string | null
}

export function hasCapability(user: AuthUser | null, cap: string): boolean {
  return !!user?.capabilities?.includes(cap)
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        Cookies.set("dm_token", token, { expires: 1 }) // 1 day
        set({ token, user })
      },
      clearAuth: () => {
        Cookies.remove("dm_token")
        set({ token: null, user: null })
      },
    }),
    { name: "datamind-auth" }
  )
)

// ── API helpers ────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL ?? ""

function handleResponse(res: Response, data: unknown) {
  if (res.status === 401) {
    // Clear session and let the dashboard layout's useEffect redirect to login
    useAuthStore.getState().clearAuth()
    throw new Error("Session expired. Please sign in again.")
  }
  if (!res.ok) {
    const detail = (data as { detail?: string })?.detail
    throw new Error(detail ?? "Request failed")
  }
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  handleResponse(res, data)
  return data as T
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  handleResponse(res, data)
  return data as T
}

export async function apiPut<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  handleResponse(res, data)
  return data as T
}

export async function apiUpload<T>(path: string, formData: FormData, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // browser sets multipart boundary
    body: formData,
  })
  const data = await res.json()
  handleResponse(res, data)
  return data as T
}

export async function apiDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204) return
  const data = await res.json().catch(() => ({}))
  handleResponse(res, data)
}
