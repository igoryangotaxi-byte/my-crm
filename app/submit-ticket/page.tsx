import type { Metadata } from "next";
import { PublicTicketSubmitForm } from "@/components/public/PublicTicketSubmitForm";

export const metadata: Metadata = {
  title: "Submit a request · Appli Taxi Oz",
  description: "Send a request to the Appli Taxi Oz operations team.",
  robots: { index: false, follow: false },
};

export default function SubmitTicketPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--so-bg)] px-4 py-10">
      <div className="w-full max-w-lg rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-6 shadow-[var(--so-shadow-md)] sm:p-8">
        <div className="mb-6">
          <p className="ycds-label text-[var(--primary)]">Appli Taxi Oz</p>
          <h1 className="ycds-display mt-2 text-[var(--so-text)]">Submit a request</h1>
          <p className="mt-1.5 text-sm text-[var(--so-muted)]">
            No account needed. Your request goes to our Tracker queue (To Do).
          </p>
        </div>
        <PublicTicketSubmitForm />
      </div>
    </main>
  );
}
