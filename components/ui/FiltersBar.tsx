type FiltersBarProps = {
  filters: string[];
};

export function FiltersBar({ filters }: FiltersBarProps) {
  return (
    <div className="glass-surface mb-4 flex flex-wrap items-center gap-2 rounded-3xl p-2.5">
      {filters.map((filter, index) => (
        <button
          key={filter}
          type="button"
          className={`crm-hover-lift rounded-xl px-3 py-1.5 text-sm font-medium transition ${
            index === 0
              ? "crm-button-primary text-white"
              : "bg-white/70 text-slate-700 hover:bg-white"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
