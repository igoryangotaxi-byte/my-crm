type PageHeadingProps = {
  title: string;
  subtitle: string;
};

export function PageHeading({ title, subtitle }: PageHeadingProps) {
  return (
    <div className="glass-surface mb-4 rounded-3xl px-4 py-3">
      <h1 className="crm-title-xl">{title}</h1>
      <p className="crm-subtitle mt-0.5">{subtitle}</p>
    </div>
  );
}
