"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup" | "magic" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    if (mode === "forgot") {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
      return;
    }

    if (mode === "magic") {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
      return;
    }

    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // Auto sign-in after signup
        const signIn = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, mode: "password" }),
        });
        if (signIn.ok) {
          router.push("/");
          router.refresh();
          return;
        }
        setErrorMsg("Account created — please sign in.");
        setMode("signin");
        setStatus("idle");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Sign-up failed. Please try again.");
        setStatus("error");
      }
      return;
    }

    // signin
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mode: "password" }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? "Invalid email or password.");
      setStatus("error");
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#111827" />
            <path
              d="M8 10h16M8 16h10M8 22h13"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="login-title">AI Bid Manager</h1>
        <p className="login-subtitle">Sign in to your workspace</p>

        {status === "sent" ? (
          <div className="login-sent">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="19" stroke="#16a34a" strokeWidth="2" />
              <path
                d="M12 20l6 6 10-12"
                stroke="#16a34a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="login-sent-title">Check your email</p>
            <p className="login-sent-body">
              {mode === "forgot" ? (
                <>
                  We sent a password reset link to <strong>{email}</strong>. It
                  expires in 1 hour.
                </>
              ) : (
                <>
                  We sent a sign-in link to <strong>{email}</strong>. It expires
                  in 24 hours.
                </>
              )}
            </p>
            <button
              className="login-resend"
              onClick={() => {
                setStatus("idle");
                setMode("signin");
              }}
              type="button"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 24,
                background: "var(--surface)",
                borderRadius: 8,
                padding: 4,
                visibility:
                  mode === "magic" || mode === "forgot" ? "hidden" : "visible",
              }}
            >
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setStatus("idle");
                    setErrorMsg("");
                  }}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    fontSize: 13,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: mode === m ? "var(--card-bg)" : "transparent",
                    color: mode === m ? "var(--ink)" : "var(--muted)",
                    boxShadow:
                      mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {mode !== "magic" && mode !== "forgot" && (
              <form onSubmit={handleSubmit} className="login-form">
                <label htmlFor="email" className="login-label">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="you@company.com"
                  className="login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                />
                <label
                  htmlFor="password"
                  className="login-label"
                  style={{ marginTop: 12 }}
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  placeholder={
                    mode === "signup"
                      ? "Choose a password (8+ chars)"
                      : "Your password"
                  }
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === "loading"}
                />
                {status === "error" && (
                  <p className="login-error">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={status === "loading" || !email || !password}
                >
                  {status === "loading"
                    ? "Please wait…"
                    : mode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>
            )}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setStatus("idle");
                    setErrorMsg("");
                  }}
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode(
                    mode === "magic" || mode === "forgot" ? "signin" : "magic",
                  );
                  setStatus("idle");
                  setErrorMsg("");
                }}
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {mode === "magic" || mode === "forgot"
                  ? "← Back to sign in"
                  : "Use magic link instead"}
              </button>
            </div>

            {mode === "forgot" && (
              <form
                onSubmit={handleSubmit}
                className="login-form"
                style={{ marginTop: 12 }}
              >
                <label htmlFor="forgot-email" className="login-label">
                  Email address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="you@company.com"
                  className="login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                />
                {status === "error" && (
                  <p className="login-error">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={status === "loading" || !email}
                >
                  {status === "loading" ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}

            {mode === "magic" && (
              <form
                onSubmit={handleSubmit}
                className="login-form"
                style={{ marginTop: 12 }}
              >
                <label htmlFor="magic-email" className="login-label">
                  Email address
                </label>
                <input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="you@company.com"
                  className="login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                />
                {status === "error" && (
                  <p className="login-error">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  className="login-btn"
                  disabled={status === "loading" || !email}
                >
                  {status === "loading" ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
