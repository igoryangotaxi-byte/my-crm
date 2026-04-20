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
          className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
            index === 0
              ? "bg-accent text-white"
              : "bg-[#f3f3f5] text-slate-700 hover:bg-slate-200"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
