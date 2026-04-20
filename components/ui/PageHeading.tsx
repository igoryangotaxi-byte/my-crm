type PageHeadingProps = {
  title: string;
  subtitle: string;
};

export function PageHeading({ title, subtitle }: PageHeadingProps) {
  return (
    <div className="glass-surface mb-4 rounded-3xl px-4 py-3">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
    </div>
  );
}
