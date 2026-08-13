import { cn } from "@/lib/ui/cn";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials =
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  const sizes = { sm: "h-6 w-6 text-[0.6rem]", md: "h-8 w-8 text-xs", lg: "h-9 w-9 text-xs" };
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[var(--so-accent-soft)] font-medium text-[var(--so-accent-strong)]",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
