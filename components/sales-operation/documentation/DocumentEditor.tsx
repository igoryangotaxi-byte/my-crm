"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Strikethrough,
  Table2,
  Underline,
  Upload,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import {
  DOCUMENTATION_FONTS,
  DOCUMENTATION_FONT_SIZES,
  DOCUMENTATION_HIGHLIGHTS,
  DOCUMENTATION_TEXT_COLORS,
  documentationExtensions,
} from "@/lib/sales-operation/documentation-schema";

type Props = {
  documentId: string;
  content: JSONContent;
  disabled?: boolean;
  onChange: (content: JSONContent) => void;
};

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "so-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
        active && "bg-[var(--so-surface-2)] text-[var(--so-text)]",
      )}
    >
      {children}
    </button>
  );
}

export function DocumentEditor({ documentId, content, disabled, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const onChangeRef = useRef(onChange);
  const acceptUpdates = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editable: !disabled,
      extensions: documentationExtensions(),
      content,
      editorProps: {
        attributes: {
          class: "tiptap",
        },
      },
      onCreate: () => {
        acceptUpdates.current = false;
        queueMicrotask(() => {
          acceptUpdates.current = true;
        });
      },
      onUpdate: ({ editor: instance }) => {
        if (!acceptUpdates.current) return;
        onChangeRef.current(instance.getJSON());
      },
    },
    [documentId],
  );

  if (!editor) {
    return <div className="min-h-[40vh] animate-pulse rounded-[10px] bg-[var(--so-surface-2)]" />;
  }

  const inTable = editor.isActive("table");

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/sales-operation/documentation/import", { method: "POST", body: form });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        kind?: "table" | "doc";
        content?: JSONContent;
      };
      if (!res.ok || !data.ok || !data.content) {
        toast.error(data.error ?? "Import failed");
        return;
      }
      if (data.kind === "doc") {
        const nodes = data.content.content ?? data.content;
        editor.chain().focus().insertContent(nodes).run();
      } else {
        editor.chain().focus().insertContent(data.content).run();
      }
      onChangeRef.current(editor.getJSON());
      toast.success("Imported into this document");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="documentation-editor flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-[var(--so-border)] bg-[var(--so-surface)] px-2 py-1.5">
        <select
          aria-label="Font"
          className="so-focus-ring mr-1 h-7 rounded-[6px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-1.5 text-[11px] text-[var(--so-text)]"
          value={editor.getAttributes("textStyle").fontFamily ?? DOCUMENTATION_FONTS[0].value}
          onChange={(event) => {
            const value = event.target.value;
            if (value) editor.chain().focus().setFontFamily(value).run();
          }}
        >
          {DOCUMENTATION_FONTS.map((font) => (
            <option key={font.label} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Size"
          className="so-focus-ring mr-1 h-7 rounded-[6px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-1.5 text-[11px] text-[var(--so-text)]"
          value={editor.getAttributes("textStyle").fontSize ?? "16px"}
          onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
        >
          {DOCUMENTATION_FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size.replace("px", "")}
            </option>
          ))}
        </select>
        <ToolButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" />
        {DOCUMENTATION_TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={`Text color ${color}`}
            onClick={() => editor.chain().focus().setColor(color).run()}
            className="so-focus-ring h-4 w-4 rounded-full border border-[var(--so-border)]"
            style={{ background: color }}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" />
        {DOCUMENTATION_HIGHLIGHTS.map((color) => (
          <button
            key={color}
            type="button"
            title={color === "transparent" ? "Clear highlight" : `Highlight ${color}`}
            aria-label={color === "transparent" ? "Clear highlight" : `Highlight ${color}`}
            onClick={() =>
              color === "transparent"
                ? editor.chain().focus().unsetHighlight().run()
                : editor.chain().focus().toggleHighlight({ color }).run()
            }
            className="so-focus-ring h-4 w-4 rounded-[3px] border border-[var(--so-border)]"
            style={{ background: color === "transparent" ? "var(--so-surface)" : color }}
          />
        ))}
        <Highlighter className="ml-0.5 h-3 w-3 text-[var(--so-muted-2)]" />
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" />
        <ToolButton
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Align center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" />
        <ToolButton
          label="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Table2 className="h-3.5 w-3.5" />
        </ToolButton>
        {inTable ? (
          <>
            <ToolButton label="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <Plus className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton label="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
              <Minus className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton label="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
              <Plus className="h-3 w-3 rotate-90" />
            </ToolButton>
            <ToolButton label="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
              <Minus className="h-3 w-3 rotate-90" />
            </ToolButton>
            <button
              type="button"
              className="so-focus-ring h-7 rounded-[6px] px-1.5 text-[11px] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            >
              Header
            </button>
            <button
              type="button"
              className="so-focus-ring h-7 rounded-[6px] px-1.5 text-[11px] text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              Delete table
            </button>
          </>
        ) : null}
        <span className="mx-1 h-4 w-px bg-[var(--so-border)]" />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="so-focus-ring inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[11px] font-medium text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)] disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {importing ? "Importing…" : "Import"}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,.docx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6 md:px-10">
        <div className="mx-auto min-h-[70vh] w-full max-w-[816px] rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] px-10 py-8 shadow-[var(--so-shadow-xs)]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
