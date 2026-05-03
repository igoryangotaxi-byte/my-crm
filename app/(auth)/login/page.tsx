"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { loading, currentUser, login, register, lastLoginEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lastLoginEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && currentUser?.status === "approved") {
      router.replace("/dashboard");
    }
  }, [loading, currentUser, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const result = await login(email, password);
        if (result.ok) {
          router.replace("/dashboard");
        } else {
          setMessage(result.message ?? "Login failed");
        }
        return;
      }

      if (!name.trim()) {
        setMessage("Name is required for registration");
        return;
      }

      const result = await register({ name: name.trim(), email, password });
      setMessage(
        result.message ?? (result.ok ? "Registration submitted" : "Registration failed"),
      );
      if (result.ok) {
        setMode("login");
        setPassword("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        Loading...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="glass-surface w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-accent">Appli Taxi Oz</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Internal CRM access for operations team."
              : "New users require admin approval before sign in."}
          </p>
        </div>

        <div className="mb-4 inline-flex rounded-xl bg-white/60 p-1 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === "login" ? "crm-button-primary text-white" : "text-slate-600"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setMessage(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === "register" ? "crm-button-primary text-white" : "text-slate-600"
            }`}
          >
            Register
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                className="crm-input h-11 w-full px-3 text-sm"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="crm-input h-11 w-full px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="crm-input h-11 w-full px-3 text-sm"
            />
          </label>

          {message ? (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="crm-button-primary mt-2 h-11 w-full rounded-xl text-sm font-semibold transition hover:opacity-95"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

      </div>
    </main>
  );
}
