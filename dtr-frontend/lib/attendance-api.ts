import type { AuthUser } from "@/lib/auth-api"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export type BreakType = "morning_break" | "lunch" | "afternoon_break"

export type AttendanceAction =
  | "time_in"
  | "morning_break_out"
  | "morning_break_in"
  | "lunch_out"
  | "lunch_in"
  | "afternoon_break_out"
  | "afternoon_break_in"
  | "time_out"

export type AttendanceBreak = {
  type: BreakType
  label: string
  enabled: boolean
  allowed_minutes: number
  break_out: string | null
  break_in: string | null
  actual_minutes: number | null
  exceeded_minutes: number
  status: "disabled" | "not_started" | "on_break" | "completed"
  can_start: boolean
  can_end: boolean
}

export type AttendanceSettings = {
  configured: boolean
  morning_break_minutes: number
  lunch_break_minutes: number
  afternoon_break_minutes: number
  breaks: Array<{
    type: BreakType
    label: string
    allowed_minutes: number
    enabled: boolean
  }>
}

export type AttendanceToday = {
  date: string
  status: "not_started" | "in_progress" | "on_break" | "completed"
  setup_required: boolean
  time_in: string | null
  time_out: string | null
  can_clock_in: boolean
  can_clock_out: boolean
  breaks: AttendanceBreak[]
}

export type AttendanceSummary = {
  average_clock_in_minutes: number | null
  average_clock_out_minutes: number | null
  average_working_minutes: number
  absent_days: number
}

export type AttendanceRecord = {
  id: number
  date: string
  time_in: string | null
  time_out: string | null
  working_minutes: number
  break_exceeded_minutes: number
  breaks: Array<{
    type: BreakType
    label: string
    allowed_minutes: number
    actual_minutes: number | null
    exceeded_minutes: number
    break_out: string | null
    break_in: string | null
  }>
}

export type AttendanceDashboardPayload = {
  user: AuthUser
  month: string
  settings: AttendanceSettings
  today: AttendanceToday
  summary: AttendanceSummary
  records: AttendanceRecord[]
}

type AttendanceActionPayload = {
  message: string
  record: AttendanceRecord
  today: AttendanceToday
}

type UpdateAttendanceSettingsInput = {
  morning_break_minutes: number
  lunch_break_minutes: number
  afternoon_break_minutes: number
}

type UpdateAttendanceSettingsPayload = {
  message: string
  settings: AttendanceSettings
}

async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)

  headers.set("Accept", "application/json")
  headers.set("Authorization", `Bearer ${token}`)

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

export async function fetchAttendanceDashboard(
  token: string,
  month: string
): Promise<AttendanceDashboardPayload> {
  const searchParams = new URLSearchParams({ month })

  return apiRequest<AttendanceDashboardPayload>(
    `/api/attendance?${searchParams.toString()}`,
    token
  )
}

export async function updateAttendanceSettings(
  token: string,
  input: UpdateAttendanceSettingsInput
): Promise<UpdateAttendanceSettingsPayload> {
  return apiRequest<UpdateAttendanceSettingsPayload>(
    "/api/attendance/settings",
    token,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  )
}

export async function recordAttendanceAction(
  token: string,
  action: AttendanceAction
): Promise<AttendanceActionPayload> {
  return apiRequest<AttendanceActionPayload>(
    `/api/attendance/actions/${action}`,
    token,
    {
      method: "POST",
    }
  )
}
