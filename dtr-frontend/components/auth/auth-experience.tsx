"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, ShieldCheck, UserPlus2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { fetchCurrentUser, loginAccount, registerAccount } from "@/lib/auth-api"
import {
  clearStoredSession,
  createSession,
  persistSession,
  readStoredSession,
} from "@/lib/auth-session"

type AuthMode = "login" | "register"

type FormState = {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}


const initialForm: FormState = {
  name: "",
  email: "",
  password: "",
  passwordConfirmation: "",
}

const stats = [
  { label: "Daily tracking", value: "Time in / out" },
  { label: "Month view", value: "Attendance page" },
  { label: "Auth surface", value: "Register + login" },
]

export function AuthExperience() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("login")
  const [form, setForm] = useState<FormState>(initialForm)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isRedirecting, setIsRedirecting] = useState(false)

  const submitLabel = useMemo(() => {
    if (isRedirecting) {
      return "Redirecting..."
    }

    if (isSubmitting) {
      return mode === "login" ? "Signing in..." : "Creating account..."
    }

    return mode === "login" ? "Sign in" : "Create account"
  }, [isRedirecting, isSubmitting, mode])

  useEffect(() => {
    let isActive = true

    async function restoreSession() {
      const restoredSession = readStoredSession()

      if (!restoredSession) {
        if (isActive) {
          setIsRestoring(false)
        }

        return
      }

      try {
        const user = await fetchCurrentUser(restoredSession.token)

        if (!isActive) {
          return
        }

        persistSession({
          token: restoredSession.token,
          user,
        })
        setIsRedirecting(true)
        router.replace("/attendance")
      } catch {
        clearStoredSession()

        if (isActive) {
          setNotice("Your previous session expired. Please sign in again.")
        }
      } finally {
        if (isActive) {
          setIsRestoring(false)
        }
      }
    }

    void restoreSession()

    return () => {
      isActive = false
    }
  }, [router])

  function updateMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError("")
    setNotice("")
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")

    if (mode === "register" && form.password !== form.passwordConfirmation) {
      setError("Password confirmation does not match.")
      return
    }

    setIsSubmitting(true)

    try {
      const payload =
        mode === "login"
          ? await loginAccount({
              email: form.email,
              password: form.password,
            })
          : await registerAccount({
              name: form.name,
              email: form.email,
              password: form.password,
              passwordConfirmation: form.passwordConfirmation,
            })

      persistSession(createSession(payload))
      setForm(initialForm)
      setIsRedirecting(true)
      router.replace("/attendance")
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while talking to the API."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.2),_transparent_28%),radial-gradient(circle_at_85%_15%,_rgba(14,165,233,0.18),_transparent_24%),linear-gradient(135deg,#fff7ed_0%,#fffbeb_42%,#ecfeff_100%)] px-5 py-10 text-slate-900 sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[12%] h-40 w-40 rounded-full bg-orange-300/25 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-52 w-52 rounded-full bg-sky-300/25 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-24 w-24 -translate-x-1/2 rounded-full border border-white/50 bg-white/30 blur-sm" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex flex-col justify-between rounded-[2rem] border border-white/60 bg-white/55 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-10">
          <div className="space-y-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-xs">
              <ShieldCheck className="size-4 text-sky-600" />
              DTR access portal
            </div>

            <div className="max-w-2xl space-y-5">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-500">
                Daily Time Record
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Sign in once, then continue straight into the attendance workspace.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                This flow now sends authenticated users to a dedicated attendance page with
                clock actions, monthly summaries, and a table of recorded logs.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-slate-200/70 bg-slate-950 px-5 py-5 text-slate-50 shadow-lg shadow-slate-950/10"
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-lg font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <Card className="w-full max-w-xl rounded-[2rem] border-white/70 bg-white/85 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <CardHeader className="gap-4 border-b border-slate-200/70 px-7 py-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl text-slate-950">
                    Account access
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                    Sign in or create an account, then continue to your attendance page.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 rounded-[1.25rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                <button
                  type="button"
                  onClick={() => updateMode("login")}
                  className={`text-sm font-semibold transition ${
                    mode === "login" ? "text-slate-950" : "text-slate-400"
                  }`}
                >
                  Login
                </button>

                <Switch
                  checked={mode === "register"}
                  onCheckedChange={(checked) =>
                    updateMode(checked ? "register" : "login")
                  }
                  aria-label="Switch between login and create account"
                />

                <button
                  type="button"
                  onClick={() => updateMode("register")}
                  className={`text-sm font-semibold transition ${
                    mode === "register" ? "text-slate-950" : "text-slate-400"
                  }`}
                >
                  Create account
                </button>
              </div>
            </CardHeader>

            <CardContent className="px-7 py-7">
              {isRestoring || isRedirecting ? (
                <div className="space-y-4">
                  <div className="h-3 w-28 rounded-full bg-slate-200/80" />
                  <div className="h-11 rounded-2xl bg-slate-200/70" />
                  <div className="h-11 rounded-2xl bg-slate-200/60" />
                  <p className="text-sm text-slate-500">
                    {isRedirecting
                      ? "Taking you to the attendance page..."
                      : "Checking for an existing session..."}
                  </p>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  {mode === "register" ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="name">
                        Full name
                      </label>
                      <Input
                        id="name"
                        placeholder="Full Name"
                        value={form.name}
                        onChange={(event) => updateField("name", event.target.value)}
                        required
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="email">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="sample@gmail.com"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      required
                    />
                  </div>

                  {mode === "register" ? (
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium text-slate-700"
                        htmlFor="passwordConfirmation"
                      >
                        Confirm password
                      </label>
                      <Input
                        id="passwordConfirmation"
                        type="password"
                        placeholder="Repeat your password"
                        value={form.passwordConfirmation}
                        onChange={(event) =>
                          updateField("passwordConfirmation", event.target.value)
                        }
                        required
                      />
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                    disabled={isSubmitting || isRedirecting}
                  >
                    {mode === "register" ? (
                      <UserPlus2 className="size-4" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {submitLabel}
                  </Button>
                </form>
              )}

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              {notice ? (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  {notice}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
