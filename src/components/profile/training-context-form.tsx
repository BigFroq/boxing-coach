"use client";

import { SavedIndicator } from "./saved-indicator";
import type { ProfileTrainingContext, EditableProfileField } from "@/lib/profile-types";

type Props = {
  context: ProfileTrainingContext;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

/** Convert stored YYYY-MM-DD to the YYYY-MM the <input type="month"> expects. */
function toMonthValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

export function TrainingContextForm({
  context,
  savedField,
  savedTrigger,
  onSave,
  errorByField,
}: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-3">Training context</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          field="gym"
          label="Gym"
          value={context.gym}
          onSave={onSave}
          savedField={savedField}
          savedTrigger={savedTrigger}
          errorByField={errorByField}
          maxLength={80}
          placeholder="e.g. Silverback BC"
        />
        <TextField
          field="trainer"
          label="Trainer"
          value={context.trainer}
          onSave={onSave}
          savedField={savedField}
          savedTrigger={savedTrigger}
          errorByField={errorByField}
          maxLength={80}
          placeholder="e.g. Coach Joe"
        />
      </div>

      <label className="mt-3 block">
        <span className="flex items-center gap-2 text-xs text-muted mb-1">
          Started boxing
          {savedField === "started_boxing_at" && <SavedIndicator trigger={savedTrigger} />}
        </span>
        <input
          type="month"
          defaultValue={toMonthValue(context.started_boxing_at)}
          onBlur={(e) => onSave("started_boxing_at", e.target.value)}
          className={`rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.started_boxing_at ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.started_boxing_at && (
          <span className="mt-1 block text-xs text-red-500">{errorByField.started_boxing_at}</span>
        )}
      </label>

      <label className="mt-3 block">
        <span className="flex items-center gap-2 text-xs text-muted mb-1">
          Goals
          {savedField === "goals" && <SavedIndicator trigger={savedTrigger} />}
        </span>
        <textarea
          defaultValue={context.goals ?? ""}
          maxLength={500}
          rows={3}
          placeholder="What are you working toward?"
          onBlur={(e) => onSave("goals", e.target.value)}
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.goals ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.goals && (
          <span className="text-xs text-red-500">{errorByField.goals}</span>
        )}
      </label>
    </section>
  );
}

function TextField({
  field,
  label,
  value,
  onSave,
  savedField,
  savedTrigger,
  errorByField,
  maxLength,
  placeholder,
}: {
  field: EditableProfileField;
  label: string;
  value: string | null;
  onSave: (field: EditableProfileField, value: string) => void;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  errorByField: Partial<Record<EditableProfileField, string>>;
  maxLength: number;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs text-muted mb-1">
        {label}
        {savedField === field && <SavedIndicator trigger={savedTrigger} />}
      </span>
      <input
        type="text"
        defaultValue={value ?? ""}
        maxLength={maxLength}
        placeholder={placeholder}
        onBlur={(e) => onSave(field, e.target.value)}
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
          errorByField[field] ? "border-red-500" : "border-border"
        }`}
      />
      {errorByField[field] && (
        <span className="text-xs text-red-500">{errorByField[field]}</span>
      )}
    </label>
  );
}
