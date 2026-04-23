"use client";

import { SavedIndicator } from "./saved-indicator";
import type { EditableProfileField } from "@/lib/profile-types";

const MAX = 4000;
const WARN_AT = MAX - 200;

type Props = {
  notes: string | null;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

export function NotesForm({ notes, savedField, savedTrigger, onSave, errorByField }: Props) {
  const length = (notes ?? "").length;
  const showCounter = length >= WARN_AT;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <label className="block">
        <span className="flex items-center justify-between text-xs text-muted mb-1">
          <span className="flex items-center gap-2">
            Notes
            {savedField === "notes" && <SavedIndicator trigger={savedTrigger} />}
          </span>
          {showCounter && (
            <span aria-live="polite">
              {length} / {MAX}
            </span>
          )}
        </span>
        <textarea
          defaultValue={notes ?? ""}
          maxLength={MAX}
          rows={6}
          placeholder="Things about how you box — habits, injuries, what you're working on, anything."
          onBlur={(e) => onSave("notes", e.target.value)}
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.notes ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.notes && (
          <span className="text-xs text-red-500">{errorByField.notes}</span>
        )}
      </label>
    </section>
  );
}
