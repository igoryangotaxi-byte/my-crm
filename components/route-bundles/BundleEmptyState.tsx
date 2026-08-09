export function BundleEmptyState({ onGenerate }: { onGenerate?: () => void }) {
  return (
    <div className="px-3 py-10 text-center">
      <div className="text-sm font-semibold text-[var(--so-text)]">No bundles available</div>
      <p className="mt-2 text-sm text-[var(--so-muted)]">
        We couldn&apos;t safely combine the current pre-orders yet. New routes will appear when
        compatible orders become available.
      </p>
      {onGenerate ? (
        <button
          type="button"
          onClick={onGenerate}
          className="mt-4 rounded-xl bg-[var(--so-accent)] px-3.5 py-2 text-xs font-bold text-white"
        >
          Generate routes
        </button>
      ) : null}
    </div>
  );
}
