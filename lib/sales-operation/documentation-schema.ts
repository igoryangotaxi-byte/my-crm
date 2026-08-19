import type { Extensions } from "@tiptap/core";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

export function documentationExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    TextStyle,
    Underline,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TableKit.configure({
      table: {
        resizable: true,
        HTMLAttributes: { class: "documentation-table" },
      },
    }),
  ];
}

export const DOCUMENTATION_FONTS = [
  { label: "Yango Text", value: "var(--font-yango-text), Arial, Helvetica, sans-serif" },
  { label: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
] as const;

export const DOCUMENTATION_FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px"] as const;

export const DOCUMENTATION_TEXT_COLORS = [
  "#111827",
  "#6b7280",
  "#dc2626",
  "#d97706",
  "#059669",
  "#2563eb",
  "#7c3aed",
] as const;

export const DOCUMENTATION_HIGHLIGHTS = [
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#fecaca",
  "#e9d5ff",
  "transparent",
] as const;
