"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { loading, currentUser, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && currentUser?.status === "approved") {
      router.replace("/dashboard");
    }
  }, [loading, currentUser, router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (mode === "login") {
      const result = login(email, password);
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

    const result = register({ name: name.trim(), email, password });
    setMessage(result.message ?? (result.ok ? "Registration submitted" : "Registration failed"));
    if (result.ok) {
      setMode("login");
      setPassword("");
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
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-8">
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

        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              mode === "login" ? "bg-white text-slate-900" : "text-slate-600"
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
              mode === "register" ? "bg-white text-slate-900" : "text-slate-600"
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
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
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
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none transition focus:border-accent"
            />
          </label>

          {message ? (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
          ) : null}

          <button
            type="submit"
            className="mt-2 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white transition hover:opacity-95"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

      </div>
    </main>
  );
}
