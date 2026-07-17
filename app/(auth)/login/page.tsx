"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

type LoginErrorCode = "domain" | "oauth" | "config" | "rejected";

export default function LoginPage() {
  const router = useRouter();
  const { loading, currentUser, language } = useAuth();
  const [errorCode, setErrorCode] = useState<LoginErrorCode | null>(null);

  const copy =
    language === "he"
      ? {
          loading: "טוען...",
          brand: "Appli Taxi Oz",
          title: "כניסה ל-CRM",
          subtitle: "הכניסה מוגבלת לחשבונות Google של ‎@appli.taxi בלבד.",
          signInWithGoogle: "כניסה עם Google",
          errorDomain: "מותרים רק חשבונות ‎@appli.taxi.",
          errorOAuth: "הכניסה נכשלה. נסו שוב.",
          errorConfig: "כניסת Google אינה מוגדרת. פנו למנהל המערכת.",
          errorRejected: "הגישה לחשבון נדחתה על ידי מנהל.",
        }
      : {
          loading: "Loading...",
          brand: "Appli Taxi Oz",
          title: "Sign in to the CRM",
          subtitle: "Access is restricted to @appli.taxi Google accounts.",
          signInWithGoogle: "Sign in with Google",
          errorDomain: "Only @appli.taxi accounts are allowed.",
          errorOAuth: "Sign-in failed. Please try again.",
          errorConfig: "Google sign-in is not configured. Contact your administrator.",
          errorRejected: "Your account access was rejected by an admin.",
        };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("error");
    if (raw === "domain" || raw === "oauth" || raw === "config" || raw === "rejected") {
      setErrorCode(raw);
    }
  }, []);

  useEffect(() => {
    if (!loading && currentUser?.status === "approved") {
      router.replace("/dashboard");
    }
  }, [loading, currentUser, router]);

  const errorMessage =
    errorCode === "domain"
      ? copy.errorDomain
      : errorCode === "config"
        ? copy.errorConfig
        : errorCode === "rejected"
          ? copy.errorRejected
          : errorCode === "oauth"
            ? copy.errorOAuth
            : null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        {copy.loading}
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="glass-surface w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-accent">{copy.brand}</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted">{copy.subtitle}</p>
        </div>

        {errorMessage ? (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        <a
          href="/api/auth/google/start"
          className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:bg-slate-50"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
            <path
              fill="#4285F4"
              d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9086c1.7018-1.5668 2.6836-3.8741 2.6836-6.6151z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2582c-.8059.54-1.8368.859-3.0478.859-2.344 0-4.3282-1.5832-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"
            />
            <path
              fill="#EA4335"
              d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C15.4632.8918 13.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
            />
          </svg>
          {copy.signInWithGoogle}
        </a>
      </div>
    </main>
  );
}
