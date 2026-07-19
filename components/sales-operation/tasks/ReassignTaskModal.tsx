"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";

export function ReassignTaskModal({
  open,
  onOpenChange,
  currentDueAt,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDueAt: string | null;
  onSubmit: (input: {
    assignedToUserId: string;
    assignedToName: string;
    dueAt: string | null;
    comment: string;
  }) => Promise<void>;
  loading?: boolean;
}) {
  const t = useTranslations("salesOperation.taskHub");
  const { users } = useAuth();
  const [userId, setUserId] = useState("");
  const [dueAt, setDueAt] = useState(currentDueAt?.slice(0, 16) ?? "");
  const [comment, setComment] = useState("");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("reassign.title")}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            loading={loading}
            disabled={!userId || loading}
            onClick={() => {
              const user = users.find((u) => u.id === userId);
              if (!user) return;
              void onSubmit({
                assignedToUserId: user.id,
                assignedToName: user.name,
                dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                comment,
              });
            }}
          >
            {t("reassign.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="crm-label">{t("reassign.assignee")}</span>
          <select
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">—</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("reassign.due")}</span>
          <input
            type="datetime-local"
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("reassign.comment")}</span>
          <textarea
            className="crm-input mt-1 min-h-[72px] w-full px-3 py-2 text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("reassign.commentPlaceholder")}
          />
        </label>
      </div>
    </Modal>
  );
}
