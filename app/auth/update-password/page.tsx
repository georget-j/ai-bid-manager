"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      setStatus("error");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    const res = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      setStatus("done");
      setTimeout(() => router.push("/"), 1500);
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error ?? "Failed to update password.");
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
        <h1 className="login-title">Set new password</h1>
        <p className="login-subtitle">Choose a new password for your account</p>

        {status === "done" ? (
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
            <p className="login-sent-title">Password updated</p>
            <p className="login-sent-body">Redirecting you to the app…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="new-password" className="login-label">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              placeholder="At least 8 characters"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === "loading"}
            />
            <label
              htmlFor="confirm-password"
              className="login-label"
              style={{ marginTop: 12 }}
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Repeat your new password"
              className="login-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={status === "loading"}
            />
            {status === "error" && <p className="login-error">{errorMsg}</p>}
            <button
              type="submit"
              className="login-btn"
              disabled={status === "loading" || !password || !confirm}
            >
              {status === "loading" ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
