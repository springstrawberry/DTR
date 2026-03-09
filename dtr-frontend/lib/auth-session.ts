import type { AuthPayload, AuthUser } from "@/lib/auth-api"

export type Session = {
  token: string
  user: AuthUser
}

export const authStorageKey = "dtr-auth-session"

export function createSession(payload: AuthPayload): Session {
  return {
    token: payload.token,
    user: payload.user,
  }
}

export function readStoredSession(): Session | null {
  if (typeof window === "undefined") {
    return null
  }

  const rawSession = window.localStorage.getItem(authStorageKey)

  if (!rawSession) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<Session>

    if (
      typeof parsed.token !== "string" ||
      !parsed.user ||
      typeof parsed.user.id !== "number" ||
      typeof parsed.user.name !== "string" ||
      typeof parsed.user.email !== "string"
    ) {
      window.localStorage.removeItem(authStorageKey)
      return null
    }

    return {
      token: parsed.token,
      user: parsed.user,
    }
  } catch {
    window.localStorage.removeItem(authStorageKey)
    return null
  }
}

export function persistSession(session: Session): void {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(authStorageKey, JSON.stringify(session))
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(authStorageKey)
}
