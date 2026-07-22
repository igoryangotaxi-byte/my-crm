"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";

export function FollowUpTaskModal({
  open,
  onOpenChange,
  defaultTitle,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  onSubmit: (input: {
    title: string;
    description: string;
    dueAt: string | null;
    assignedToUserId: string;
    assignedToName: string;
  }) => Promise<void>;
  loading?: boolean;
}) {
  const t = useTranslations("salesOperation.taskHub");
  const { users, currentUser } = useAuth();
  const staffOptions = useMemo(() => getPlatformStaffUserOptions(users), [users]);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [userId, setUserId] = useState(currentUser?.id ?? "");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("followUp.title")}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            loading={loading}
            disabled={!title.trim() || !userId || loading}
            onClick={() => {
              const user = users.find((u) => u.id === userId);
              if (!user) return;
              void onSubmit({
                title: title.trim(),
                description,
                dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                assignedToUserId: user.id,
                assignedToName: user.name,
              });
            }}
          >
            {t("followUp.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="crm-label">{t("followUp.name")}</span>
          <input
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("followUp.description")}</span>
          <textarea
            className="crm-input mt-1 min-h-[72px] w-full px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("followUp.due")}</span>
          <input
            type="datetime-local"
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="crm-label">{t("followUp.assignee")}</span>
          <select
            className="crm-input mt-1 h-10 w-full px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {staffOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
