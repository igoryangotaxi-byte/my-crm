"use client";

const STORAGE_KEY = "gett-request-rides-first-order-done";

export function getGettFirstOrderDone(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function markGettFirstOrderDone(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
}

type GettFirstOrderOnboardingProps = {
  visible: boolean;
};

export function GettFirstOrderOnboarding({ visible }: GettFirstOrderOnboardingProps) {
  if (!visible) return null;

  return (
    <div className="crm-surface rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white p-4 shadow-sm">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-900/80">Your first Gett ride</p>
      <h3 className="mt-1 text-base font-semibold text-slate-900">How to book a taxi in the CRM</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
        <li>
          Under <strong>Passenger</strong>, enter the rider&apos;s name and phone (optional: tap <strong>Save person</strong> to store them).
        </li>
        <li>
          Under <strong>Route</strong>, fill in pickup (point A) and destination (point B). Optional: add stops with <strong>+ Add intermediate stop</strong>.
        </li>
        <li>
          For each stop, tap <strong>Geocode</strong> until coordinates appear below the field. Or choose <strong>Set on map</strong> for that stop and click the map.
        </li>
        <li>
          Tap <strong>Get Quote</strong> to load classes and prices, then pick a product from the list.
        </li>
        <li>
          Tap <strong>Create Order</strong> — an order ID appears. Use <strong>Refresh status</strong> for updates and <strong>Cancel order</strong> to cancel.
        </li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">
        This guide hides automatically after your first successful order.
      </p>
    </div>
  );
}
