export type AuthUser = {
  id: number
  name: string
  email: string
}

export type AuthPayload = {
  token: string
  token_type: string
  user: AuthUser
}

type RegisterInput = {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}

type LoginInput = {
  email: string
  password: string
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)

  headers.set("Accept", "application/json")

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })

  const contentType = response.headers.get("content-type") ?? ""
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status))
  }

  return payload as T
}

function readErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const body = payload as {
      message?: unknown
      errors?: Record<string, unknown>
    }

    if (typeof body.message === "string" && body.message.trim() !== "") {
      return body.message
    }

    if (body.errors && typeof body.errors === "object") {
      for (const value of Object.values(body.errors)) {
        if (Array.isArray(value) && typeof value[0] === "string") {
          return value[0]
        }
      }
    }
  }

  return `Request failed with status ${status}.`
}

export async function registerAccount(
  input: RegisterInput
): Promise<AuthPayload> {
  return apiRequest<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
      password_confirmation: input.passwordConfirmation,
    }),
  })
}

export async function loginAccount(input: LoginInput): Promise<AuthPayload> {
  return apiRequest<AuthPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const payload = await apiRequest<{ user: AuthUser }>("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return payload.user
}

export async function logoutAccount(token: string): Promise<void> {
  await apiRequest<{ message: string }>("/api/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
