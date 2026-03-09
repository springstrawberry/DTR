"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { format, parse } from "date-fns"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleOff,
  Clock3,
  Coffee,
  Download,
  LogOut,
  Save,
  SunMedium,
  TimerReset,
} from "lucide-react"

import { logoutAccount } from "@/lib/auth-api"
import {
  fetchAttendanceDashboard,
  recordAttendanceAction,
  updateAttendanceSettings,
  type AttendanceAction,
  type AttendanceBreak,
  type AttendanceDashboardPayload,
  type AttendanceRecord,
  type AttendanceSummary,
  type BreakType,
} from "@/lib/attendance-api"
import {
  clearStoredSession,
  readStoredSession,
  type Session,
} from "@/lib/auth-session"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const currentMonthKey = format(new Date(), "yyyy-MM")
const breakSetupItemValue = "break-setup"

const initialSettingsForm = {
  morningBreakMinutes: "15",
  lunchBreakMinutes: "60",
  afternoonBreakMinutes: "15",
}

const statusLabels = {
  not_started: "Awaiting clock in",
  in_progress: "Currently on shift",
  on_break: "Break is active",
  completed: "Shift completed",
} as const

const statCards = [
  {
    key: "average_clock_in_minutes",
    label: "AVG Clock In",
    color:
      "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-[0_16px_40px_rgba(34,197,94,0.12)]",
    icon: ArrowDownLeft,
  },
  {
    key: "average_clock_out_minutes",
    label: "AVG Clock Out",
    color:
      "border-amber-100 bg-amber-50 text-amber-500 shadow-[0_16px_40px_rgba(245,158,11,0.12)]",
    icon: Clock3,
  },
  {
    key: "average_working_minutes",
    label: "AVG Working Hr",
    color:
      "border-violet-100 bg-violet-50 text-violet-600 shadow-[0_16px_40px_rgba(124,58,237,0.12)]",
    icon: TimerReset,
  },
  {
    key: "absent_days",
    label: "Absent/Leaves",
    color:
      "border-orange-100 bg-orange-50 text-orange-500 shadow-[0_16px_40px_rgba(249,115,22,0.12)]",
    icon: CircleOff,
  },
] as const

const breakIcons: Record<BreakType, typeof Coffee> = {
  morning_break: Coffee,
  lunch: Clock3,
  afternoon_break: SunMedium,
}

const breakActionMap: Record<
  BreakType,
  { start: AttendanceAction; end: AttendanceAction }
> = {
  morning_break: {
    start: "morning_break_out",
    end: "morning_break_in",
  },
  lunch: {
    start: "lunch_out",
    end: "lunch_in",
  },
  afternoon_break: {
    start: "afternoon_break_out",
    end: "afternoon_break_in",
  },
}

export function AttendanceDashboard() {
  const router = useRouter()
  const monthPickerRef = useRef<HTMLDivElement | null>(null)
  const hasInitializedBreakSetup = useRef(false)
  const [session, setSession] = useState<Session | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [pickerMonth, setPickerMonth] = useState(
    parse(`${currentMonthKey}-01`, "yyyy-MM-dd", new Date())
  )
  const [dashboard, setDashboard] = useState<AttendanceDashboardPayload | null>(
    null
  )
  const [settingsForm, setSettingsForm] = useState(initialSettingsForm)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false)
  const [isBreakSetupOpen, setIsBreakSetupOpen] = useState(true)
  const [pageError, setPageError] = useState("")
  const [pageNotice, setPageNotice] = useState("")
  const [settingsError, setSettingsError] = useState("")
  const [settingsNotice, setSettingsNotice] = useState("")

  useEffect(() => {
    const storedSession = readStoredSession()

    if (!storedSession) {
      router.replace("/")
      return
    }

    setSession(storedSession)
  }, [router])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 1000 * 30)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!isMonthPickerOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!monthPickerRef.current?.contains(event.target as Node)) {
        setIsMonthPickerOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMonthPickerOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleEscape)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isMonthPickerOpen])

  useEffect(() => {
    if (!session) {
      return
    }

    const activeSession = session
    let isActive = true

    async function loadDashboard() {
      setIsLoading(true)
      setPageError("")

      try {
        const payload = await fetchAttendanceDashboard(
          activeSession.token,
          selectedMonth
        )

        if (!isActive) {
          return
        }

        setDashboard(payload)
        syncSettingsForm(payload)

        if (!hasInitializedBreakSetup.current) {
          setIsBreakSetupOpen(!payload.settings.configured)
          hasInitializedBreakSetup.current = true
        }
      } catch (caughtError) {
        if (!isActive) {
          return
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load the attendance dashboard."

        if (message === "Unauthenticated." || message.includes("status 401")) {
          clearStoredSession()
          router.replace("/")
          return
        }

        setPageError(message)
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      isActive = false
    }
  }, [router, selectedMonth, session])

  function syncSettingsForm(payload: AttendanceDashboardPayload) {
    setSettingsForm({
      morningBreakMinutes: String(payload.settings.morning_break_minutes),
      lunchBreakMinutes: String(payload.settings.lunch_break_minutes),
      afternoonBreakMinutes: String(payload.settings.afternoon_break_minutes),
    })
  }

  async function refreshDashboard(activeSession: Session) {
    const payload = await fetchAttendanceDashboard(activeSession.token, selectedMonth)
    setDashboard(payload)
    syncSettingsForm(payload)

    return payload
  }

  async function handleAttendanceAction(action: AttendanceAction) {
    if (!session) {
      return
    }

    setIsActing(true)
    setPageError("")
    setPageNotice("")

    try {
      const response = await recordAttendanceAction(session.token, action)
      await refreshDashboard(session)
      setPageNotice(response.message)
    } catch (caughtError) {
      setPageError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to record attendance right now."
      )
    } finally {
      setIsActing(false)
    }
  }

  async function handleSaveBreakSetup() {
    if (!session) {
      return
    }

    const payload = {
      morning_break_minutes: parseMinutes(settingsForm.morningBreakMinutes),
      lunch_break_minutes: parseMinutes(settingsForm.lunchBreakMinutes),
      afternoon_break_minutes: parseMinutes(settingsForm.afternoonBreakMinutes),
    }

    if (
      payload.morning_break_minutes === null ||
      payload.lunch_break_minutes === null ||
      payload.afternoon_break_minutes === null
    ) {
      setSettingsError(
        "Break setup values must be whole numbers from 0 to 240 minutes."
      )
      setSettingsNotice("")
      return
    }

    setIsSavingSettings(true)
    setSettingsError("")
    setSettingsNotice("")

    try {
      const response = await updateAttendanceSettings(session.token, {
        morning_break_minutes: payload.morning_break_minutes,
        lunch_break_minutes: payload.lunch_break_minutes,
        afternoon_break_minutes: payload.afternoon_break_minutes,
      })
      await refreshDashboard(session)
      setSettingsNotice(response.message)
      setIsBreakSetupOpen(false)
    } catch (caughtError) {
      setSettingsError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save break setup right now."
      )
    } finally {
      setIsSavingSettings(false)
    }
  }

  function handleBreakSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSaveBreakSetup()
  }

  async function handleLogout() {
    if (!session) {
      return
    }

    setIsLeaving(true)

    try {
      await logoutAccount(session.token)
    } catch {
      // Local session cleanup is still correct if the token is already invalid.
    } finally {
      clearStoredSession()
      router.replace("/")
    }
  }

  function updateSelectedMonth(date: Date) {
    const nextMonth = format(date, "yyyy-MM")

    setSelectedMonth(nextMonth)
    setPickerMonth(date)
    setIsMonthPickerOpen(false)
  }

  function toggleMonthPicker() {
    if (!isMonthPickerOpen) {
      setPickerMonth(monthDate)
    }

    setIsMonthPickerOpen((current) => !current)
  }

  function handleBreakSetupOpenChange(value: string) {
    if (setupRequired) {
      setIsBreakSetupOpen(true)
      return
    }

    setIsBreakSetupOpen(value === breakSetupItemValue)
    setSettingsError("")
    setSettingsNotice("")
  }

  function handleBreakSetupFieldChange(
    field: keyof typeof initialSettingsForm,
    value: string
  ) {
    setSettingsForm((current) => ({
      ...current,
      [field]: sanitizeMinutesInput(value),
    }))
  }

  function handleExportMonthlyDtr() {
    if (!dashboard) {
      return
    }

    setIsExporting(true)
    setPageError("")
    setPageNotice("")

    try {
      const exportWindow = window.open("", "_blank", "width=1200,height=900")

      if (!exportWindow) {
        throw new Error("Allow pop-ups in your browser to export the monthly DTR.")
      }

      exportWindow.document.write(
        buildMonthlyDtrPrintDocument({
          monthLabel: format(monthDate, "MMMM yyyy"),
          userName: dashboard.user.name,
          userEmail: dashboard.user.email,
          summary: dashboard.summary,
          records: dashboard.records,
        })
      )
      exportWindow.document.close()

      setPageNotice(
        "Print view opened. Use your browser's Save as PDF option to export the monthly DTR."
      )
    } catch (caughtError) {
      setPageError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to export the monthly DTR right now."
      )
    } finally {
      setIsExporting(false)
    }
  }

  const monthDate = parse(`${selectedMonth}-01`, "yyyy-MM-dd", new Date())
  const firstName =
    dashboard?.user.name.split(" ")[0] ?? session?.user.name.split(" ")[0] ?? "there"
  const setupRequired = dashboard?.today.setup_required ?? true
  const hasConfiguredBreakSetup = dashboard?.settings.configured ?? false
  const breakSetupSummary = [
    {
      label: "Before lunch",
      minutes: settingsForm.morningBreakMinutes || "0",
    },
    {
      label: "Lunch",
      minutes: settingsForm.lunchBreakMinutes || "0",
    },
    {
      label: "After lunch",
      minutes: settingsForm.afternoonBreakMinutes || "0",
    },
  ]

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f4f8_0%,#f8f7fb_40%,#f3f6f9_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-slate-400 uppercase">
                Daily Time Record
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Todays Attendance
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span>Place your attendance</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-500">
                  <Clock3 className="size-4" />
                  {format(currentTime, "h:mm a")}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {dashboard ? statusLabels[dashboard.today.status] : "Loading status"}
                </span>
                {setupRequired ? (
                  <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-600">
                    Break setup required
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="h-[3.25rem] min-w-36 rounded-2xl bg-emerald-300 text-base font-semibold text-slate-900 shadow-[0_18px_36px_rgba(34,197,94,0.22)] hover:bg-emerald-200"
                disabled={
                  isLoading || isActing || setupRequired || !dashboard?.today.can_clock_in
                }
                onClick={() => handleAttendanceAction("time_in")}
              >
                <ArrowDownLeft className="size-4" />
                Clock In
              </Button>
              <Button
                type="button"
                className="h-[3.25rem] min-w-36 rounded-2xl bg-violet-200 text-base font-semibold text-slate-900 shadow-[0_18px_36px_rgba(139,92,246,0.18)] hover:bg-violet-100"
                disabled={
                  isLoading || isActing || setupRequired || !dashboard?.today.can_clock_out
                }
                onClick={() => handleAttendanceAction("time_out")}
              >
                <ArrowUpRight className="size-4" />
                Clock Out
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[3.25rem] rounded-2xl border-slate-200 bg-white px-5 text-slate-700"
                onClick={handleLogout}
                disabled={isLeaving}
              >
                <LogOut className="size-4" />
                Logout
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-100 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
            {setupRequired
              ? "Save your break setup first. The system will not allow clock in, lunch, or break punches until your before-lunch, lunch, and after-lunch durations are set."
              : "Configured breaks run in order. If a return punch exceeds the allowed minutes, the excess is recorded automatically and shown in today's break cards."}
          </div>

          {pageError ? (
            <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          ) : null}

          {pageNotice ? (
            <div className="mt-4 rounded-[1.25rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {pageNotice}
            </div>
          ) : null}
        </section>

        <section
          className={`rounded-[2rem] border bg-white/94 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6 ${
            setupRequired ? "border-rose-200" : "border-white/80"
          }`}
        >
          <Accordion
            type="single"
            collapsible={!setupRequired}
            value={isBreakSetupOpen ? breakSetupItemValue : undefined}
            onValueChange={handleBreakSetupOpenChange}
          >
            <AccordionItem value={breakSetupItemValue} className="border-none">
              <AccordionTrigger className="py-0 hover:no-underline">
                <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-sm font-medium tracking-[0.18em] text-slate-400 uppercase">
                      Break Setup
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                      Set your before-lunch, lunch, and after-lunch durations
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Use minutes. Set a slot to 0 if you do not use that break. This
                      setup must be saved before any attendance action can be recorded.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {breakSetupSummary.map((item) => (
                      <span
                        key={item.label}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700"
                      >
                        {item.label}: {item.minutes || "0"} min
                      </span>
                    ))}
                    <span
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                        setupRequired
                          ? "bg-rose-50 text-rose-600"
                          : "bg-violet-50 text-violet-600"
                      }`}
                    >
                      {setupRequired ? "Complete setup" : "Edit break setup"}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pt-5">
                <form onSubmit={handleBreakSetupSubmit}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <BreakMinutesInput
                      id="morningBreakMinutes"
                      label="Before lunch break"
                      value={settingsForm.morningBreakMinutes}
                      onChange={(value) =>
                        handleBreakSetupFieldChange("morningBreakMinutes", value)
                      }
                    />
                    <BreakMinutesInput
                      id="lunchBreakMinutes"
                      label="Lunch break"
                      value={settingsForm.lunchBreakMinutes}
                      onChange={(value) =>
                        handleBreakSetupFieldChange("lunchBreakMinutes", value)
                      }
                    />
                    <BreakMinutesInput
                      id="afternoonBreakMinutes"
                      label="After lunch break"
                      value={settingsForm.afternoonBreakMinutes}
                      onChange={(value) =>
                        handleBreakSetupFieldChange("afternoonBreakMinutes", value)
                      }
                    />
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-slate-500">
                      Updating this setup affects the next break punches. Breaks that
                      were already recorded keep their own saved allowance and excess
                      values.
                    </p>

                    <Button
                      type="submit"
                      className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                      disabled={isSavingSettings}
                    >
                      <Save className="size-4" />
                      {isSavingSettings
                        ? "Saving..."
                        : hasConfiguredBreakSetup
                          ? "Save changes"
                          : "Save break setup"}
                    </Button>
                  </div>
                </form>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {settingsError ? (
            <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {settingsError}
            </div>
          ) : null}

          {settingsNotice ? (
            <div className="mt-4 rounded-[1.25rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {settingsNotice}
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-white/80 bg-white/94 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-slate-400 uppercase">
                Todays Breaks
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                Track before-lunch, lunch, and after-lunch punches
              </h2>
            </div>
            <p className="text-sm leading-6 text-slate-500">
              Breaks are enforced in order. Excess minutes are calculated when you punch
              back in.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {(dashboard?.today.breaks ?? []).map((breakItem) => {
              const Icon = breakIcons[breakItem.type]
              const actions = breakActionMap[breakItem.type]
              const cardStyle = getBreakCardStyle(breakItem)
              const badgeStyle = getBreakBadgeStyle(breakItem.status)

              return (
                <article
                  key={breakItem.type}
                  className={`rounded-[1.75rem] border px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] ${cardStyle}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium tracking-[0.18em] text-slate-400 uppercase">
                        Break slot
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950">
                        {breakItem.label}
                      </h3>
                    </div>
                    <div className="rounded-full bg-white/85 p-3 text-slate-700 shadow-sm">
                      <Icon className="size-5" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>
                      {formatBreakStatus(breakItem.status)}
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      Allowed: {breakItem.allowed_minutes} min
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-[1.25rem] bg-white/80 px-4 py-4 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>Break out</span>
                      <span className="font-medium text-slate-900">
                        {formatClockTime(breakItem.break_out)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Break in</span>
                      <span className="font-medium text-slate-900">
                        {formatClockTime(breakItem.break_in)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Actual</span>
                      <span className="font-medium text-slate-900">
                        {breakItem.actual_minutes === null
                          ? "--"
                          : `${breakItem.actual_minutes} min`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Exceeded</span>
                      <span
                        className={`font-semibold ${
                          breakItem.exceeded_minutes > 0
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {breakItem.exceeded_minutes} min
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-2xl border-slate-200 bg-white"
                      disabled={isActing || setupRequired || !breakItem.can_start}
                      onClick={() => handleAttendanceAction(actions.start)}
                    >
                      Start
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                      disabled={isActing || setupRequired || !breakItem.can_end}
                      onClick={() => handleAttendanceAction(actions.end)}
                    >
                      End
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/94 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div
            ref={monthPickerRef}
            className="relative flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
          >
            <button
              type="button"
              onClick={toggleMonthPicker}
              className="inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-xl font-semibold text-violet-600 transition hover:bg-violet-50"
              aria-expanded={isMonthPickerOpen}
              aria-label="Open calendar month picker"
            >
              <CalendarDays className="size-5" />
              <span>{format(monthDate, "MMMM yyyy")}</span>
              <ChevronDown
                className={`size-4 transition ${isMonthPickerOpen ? "rotate-180" : ""}`}
              />
            </button>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-slate-700"
              onClick={handleExportMonthlyDtr}
              disabled={isLoading || !dashboard || isExporting}
            >
              <Download className="size-4" />
              {isExporting ? "Preparing..." : "Export PDF"}
            </Button>

            {isMonthPickerOpen ? (
              <div className="absolute left-5 top-[calc(100%-0.5rem)] z-20 w-fit rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)] sm:left-6">
                <Calendar
                  mode="single"
                  month={pickerMonth}
                  selected={pickerMonth}
                  onSelect={(date) => {
                    if (date) {
                      updateSelectedMonth(date)
                    }
                  }}
                  onMonthChange={setPickerMonth}
                  captionLayout="dropdown"
                  startMonth={new Date(2020, 0)}
                  endMonth={new Date()}
                  disabled={{ after: new Date() }}
                  className="rounded-[1.25rem] bg-white"
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 border-b border-slate-100 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon
              const rawValue = dashboard?.summary[card.key]
              const displayValue =
                card.key === "absent_days"
                  ? String(rawValue ?? 0)
                  : formatMinutes(rawValue as number | null | undefined)

              return (
                <article
                  key={card.key}
                  className={`rounded-[1.5rem] border px-4 py-4 ${card.color}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-white/80 p-2">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900">
                        {displayValue}
                      </p>
                      <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                        {card.label}
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="px-5 py-5 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Employee</p>
                <h2 className="text-xl font-semibold text-slate-950">
                  {dashboard?.user.name ?? session?.user.name}
                </h2>
              </div>
              <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 text-right">
                <p className="text-sm text-slate-500">Current shift</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {dashboard?.today.time_in
                    ? `${formatClockTime(dashboard.today.time_in)} to ${
                        dashboard.today.time_out
                          ? formatClockTime(dashboard.today.time_out)
                          : "Open"
                      }`
                    : "No attendance recorded yet"}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-slate-100">
              <Table className="min-w-full text-left text-sm">
                <TableHeader className="bg-slate-100/80 text-slate-500">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="px-4 py-3 font-semibold">Date</TableHead>
                    <TableHead className="px-4 py-3 font-semibold">Clock In</TableHead>
                    <TableHead className="px-4 py-3 font-semibold">Clock Out</TableHead>
                    <TableHead className="px-4 py-3 font-semibold">
                      Working Hr&apos;s
                    </TableHead>
                    <TableHead className="px-4 py-3 font-semibold whitespace-normal">
                      Breaks
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white">
                  {isLoading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        className="px-4 py-10 text-center text-slate-400"
                        colSpan={5}
                      >
                        Loading attendance for {firstName}...
                      </TableCell>
                    </TableRow>
                  ) : dashboard && dashboard.records.length > 0 ? (
                    dashboard.records.map((record) => (
                      <TableRow
                        key={record.id}
                        className="border-slate-100 hover:bg-slate-50/70"
                      >
                        <TableCell className="px-4 py-3 font-medium text-slate-700">
                          {formatDisplayDate(record.date)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
                            <ArrowDownLeft className="size-4" />
                            {formatClockTime(record.time_in)}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
                            <ArrowUpRight className="size-4" />
                            {formatClockTime(record.time_out)}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-semibold text-slate-900">
                          {formatDuration(record.working_minutes)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-slate-600 whitespace-normal">
                          {record.breaks.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {record.breaks.map((breakItem) => (
                                <span key={breakItem.type}>
                                  {breakItem.label}:{" "}
                                  {breakItem.actual_minutes === null
                                    ? "--"
                                    : `${breakItem.actual_minutes} min`}
                                  {breakItem.exceeded_minutes > 0
                                    ? ` (+${breakItem.exceeded_minutes} excess)`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">No breaks recorded</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        className="px-4 py-10 text-center text-slate-400"
                        colSpan={5}
                      >
                        No attendance entries yet for {format(monthDate, "MMMM yyyy")}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function BreakMinutesInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function sanitizeMinutesInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 3)
}

function parseMinutes(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null
  }

  const minutes = Number(value)

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
    return null
  }

  return minutes
}

function getBreakCardStyle(breakItem: AttendanceBreak): string {
  if (!breakItem.enabled) {
    return "border-slate-200 bg-slate-50/80"
  }

  if (breakItem.exceeded_minutes > 0) {
    return "border-rose-200 bg-rose-50/85"
  }

  if (breakItem.status === "completed") {
    return "border-emerald-200 bg-emerald-50/85"
  }

  if (breakItem.status === "on_break") {
    return "border-amber-200 bg-amber-50/85"
  }

  return "border-violet-200 bg-violet-50/70"
}

function getBreakBadgeStyle(status: AttendanceBreak["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700"
    case "on_break":
      return "bg-amber-100 text-amber-700"
    case "not_started":
      return "bg-violet-100 text-violet-700"
    default:
      return "bg-slate-200 text-slate-500"
  }
}

function formatBreakStatus(status: AttendanceBreak["status"]): string {
  switch (status) {
    case "completed":
      return "Completed"
    case "on_break":
      return "On break"
    case "not_started":
      return "Pending"
    default:
      return "Disabled"
  }
}

function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return "--:--"
  }

  return formatDuration(minutes)
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  return `${hours}:${String(remainder).padStart(2, "0")}`
}

function formatClockTime(value: string | null): string {
  if (!value) {
    return "--:--"
  }

  return format(new Date(value), "h:mm a")
}

function formatDisplayDate(value: string): string {
  return format(new Date(`${value}T00:00:00`), "EEE, dd MMM, yyyy")
}

function buildMonthlyDtrPrintDocument({
  monthLabel,
  userName,
  userEmail,
  summary,
  records,
}: {
  monthLabel: string
  userName: string
  userEmail: string
  summary: AttendanceSummary
  records: AttendanceRecord[]
}): string {
  const summaryMarkup = statCards
    .map((card) => {
      const rawValue = summary[card.key]
      const displayValue =
        card.key === "absent_days"
          ? String(rawValue ?? 0)
          : formatMinutes(rawValue as number | null | undefined)

      return `
        <div class="summary-card">
          <div class="summary-label">${escapeHtml(card.label)}</div>
          <div class="summary-value">${escapeHtml(displayValue)}</div>
        </div>
      `
    })
    .join("")

  const rowsMarkup =
    records.length > 0
      ? records
          .map((record) => {
            const breaksMarkup =
              record.breaks.length > 0
                ? record.breaks
                    .map((breakItem) => {
                      const actual =
                        breakItem.actual_minutes === null
                          ? "--"
                          : `${breakItem.actual_minutes} min`
                      const excess =
                        breakItem.exceeded_minutes > 0
                          ? ` (+${breakItem.exceeded_minutes} excess)`
                          : ""

                      return `${escapeHtml(breakItem.label)}: ${escapeHtml(actual + excess)}`
                    })
                    .join("<br />")
                : "No breaks recorded"

            return `
              <tr>
                <td>${escapeHtml(formatDisplayDate(record.date))}</td>
                <td>${escapeHtml(formatClockTime(record.time_in))}</td>
                <td>${escapeHtml(formatClockTime(record.time_out))}</td>
                <td>${escapeHtml(formatDuration(record.working_minutes))}</td>
                <td>${breaksMarkup}</td>
              </tr>
            `
          })
          .join("")
      : `
        <tr>
          <td colspan="5" class="empty-state">No attendance entries for ${escapeHtml(monthLabel)}.</td>
        </tr>
      `

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(monthLabel)} DTR</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 32px;
        font-family: Poppins, Arial, sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }

      .sheet {
        margin: 0 auto;
        max-width: 980px;
        border-radius: 24px;
        background: #ffffff;
        padding: 32px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
      }

      .eyebrow {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #64748b;
      }

      h1 {
        margin: 12px 0 8px;
        font-size: 32px;
        line-height: 1.1;
      }

      .meta {
        margin: 0;
        color: #475569;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 28px 0;
      }

      .summary-card {
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        padding: 16px;
        background: #f8fafc;
      }

      .summary-label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
      }

      .summary-value {
        margin-top: 8px;
        font-size: 26px;
        font-weight: 700;
        color: #0f172a;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
        border-radius: 18px;
      }

      thead {
        background: #f1f5f9;
      }

      th,
      td {
        padding: 14px 16px;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }

      th {
        font-weight: 700;
        color: #475569;
      }

      td {
        color: #0f172a;
      }

      .empty-state {
        text-align: center;
        color: #64748b;
        padding: 32px 16px;
      }

      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }

        .sheet {
          max-width: none;
          border-radius: 0;
          box-shadow: none;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <p class="eyebrow">Daily Time Record</p>
      <h1>${escapeHtml(monthLabel)} Attendance Report</h1>
      <p class="meta"><strong>Employee:</strong> ${escapeHtml(userName)}</p>
      <p class="meta"><strong>Email:</strong> ${escapeHtml(userEmail)}</p>

      <section class="summary-grid">
        ${summaryMarkup}
      </section>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Working Hr's</th>
            <th>Breaks</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMarkup}
        </tbody>
      </table>
    </main>

    <script>
      window.addEventListener("load", function () {
        window.setTimeout(function () {
          window.print();
        }, 150);
      });
    </script>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
