"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AgentProfile,
  AgentProfileSchema,
  ProfileField,
} from "@/lib/anthropic/types";

type FieldValue = string | boolean | string[] | null;

interface AgentOnboardingWizardProps {
  agentName: string;
  schema: AgentProfileSchema;
  initialValues?: AgentProfile;
  /** Called on the final step's "Save" click. Resolves before the wizard hides. */
  onSave: (profile: AgentProfile) => Promise<void> | void;
  /** Called when the user backs out of the wizard with no save. */
  onCancel?: () => void;
  /** When editing an existing profile, label the primary button "Save". */
  editing?: boolean;
}

function defaultValueFor(field: ProfileField): FieldValue {
  if (field.defaultValue !== undefined)
    return field.defaultValue as FieldValue;
  // For required booleans, leave the value null so the user must actively
  // pick Yes/No rather than accepting a default that may not be theirs.
  if (field.type === "boolean") return field.required ? null : false;
  if (field.type === "multiselect") return [];
  return "";
}

function buildInitialValues(
  schema: AgentProfileSchema,
  initial: AgentProfile | undefined
): AgentProfile {
  const values: AgentProfile = {};
  for (const step of schema.steps) {
    for (const field of step.fields) {
      if (initial && field.key in initial) {
        values[field.key] = initial[field.key] as FieldValue;
      } else {
        values[field.key] = defaultValueFor(field);
      }
    }
  }
  return values;
}

function fieldVisible(field: ProfileField, values: AgentProfile): boolean {
  if (!field.showIf) return true;
  const current = values[field.showIf.field];
  return current === field.showIf.equals;
}

function stepValid(
  fields: ProfileField[],
  values: AgentProfile
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    if (!fieldVisible(field, values)) continue;
    const v = values[field.key];
    const empty =
      v === null ||
      v === undefined ||
      v === "" ||
      (Array.isArray(v) && v.length === 0);
    if (empty) missing.push(field.label);
  }
  return { ok: missing.length === 0, missing };
}

export function AgentOnboardingWizard({
  agentName,
  schema,
  initialValues,
  onSave,
  onCancel,
  editing = false,
}: AgentOnboardingWizardProps) {
  const [values, setValues] = useState<AgentProfile>(() =>
    buildInitialValues(schema, initialValues)
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const step = schema.steps[stepIndex];
  const isLastStep = stepIndex === schema.steps.length - 1;
  const totalSteps = schema.steps.length;

  function setField(key: string, value: FieldValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function next() {
    const { ok, missing } = stepValid(step.fields, values);
    if (!ok) {
      setStepError(`Please complete: ${missing.join(", ")}`);
      return;
    }
    setStepError(null);
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }

  function back() {
    setStepError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function save() {
    const { ok, missing } = stepValid(step.fields, values);
    if (!ok) {
      setStepError(`Please complete: ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(() => {
    if (!isLastStep) return null;
    const lines: { label: string; value: string }[] = [];
    for (const s of schema.steps) {
      for (const field of s.fields) {
        if (!fieldVisible(field, values)) continue;
        const v = values[field.key];
        if (v === null || v === undefined || v === "") continue;
        if (Array.isArray(v) && v.length === 0) continue;
        lines.push({
          label: field.label,
          value: formatValue(field, v),
        });
      }
    }
    return lines;
  }, [isLastStep, schema, values]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {editing ? `Edit ${agentName} settings` : `Set up ${agentName}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {editing
            ? "Update the details the agent uses on every conversation."
            : "A two-minute setup so the agent knows who it's helping from message one."}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2">
        {schema.steps.map((s, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 w-12 rounded-full transition-colors",
              i < stepIndex
                ? "bg-primary"
                : i === stepIndex
                ? "bg-primary/70"
                : "bg-muted"
            )}
            title={s.title}
          />
        ))}
      </div>

      <Card>
        <CardContent className="space-y-5 py-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{step.title}</h2>
              <Badge variant="secondary" className="text-[10px]">
                Step {stepIndex + 1} of {totalSteps}
              </Badge>
            </div>
            {step.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {step.description}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {step.fields
              .filter((f) => fieldVisible(f, values))
              .map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? null}
                  onChange={(v) => setField(field.key, v)}
                />
              ))}
          </div>

          {isLastStep && summary && summary.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </div>
              <ul className="space-y-1 text-xs">
                {summary.map((line) => (
                  <li key={line.label} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{line.label}</span>
                    <span className="text-right font-medium">{line.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stepError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {stepError}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={saving}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          ) : onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          ) : (
            <span />
          )}
        </div>
        <div>
          {isLastStep ? (
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {editing ? "Save changes" : "Activate agent"}
                </>
              )}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(field: ProfileField, value: FieldValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (field.options) {
      const labels = value.map(
        (v) => field.options?.find((o) => o.value === v)?.label ?? v
      );
      return labels.join(", ");
    }
    return value.join(", ");
  }
  if (field.options) {
    return (
      field.options.find((o) => o.value === value)?.label ?? String(value)
    );
  }
  return String(value);
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ProfileField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const id = `field-${field.key}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>
          {field.label}
          {field.required && (
            <span className="ml-1 text-destructive">*</span>
          )}
        </Label>
      </div>

      {field.type === "text" && (
        <Input
          id={id}
          type="text"
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          id={id}
          value={(value as string) ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )}

      {field.type === "date" && (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "select" && (
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === "multiselect" && field.options && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {field.options.map((opt) => {
            const arr = (value as string[]) ?? [];
            const checked = arr.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...arr, opt.value]);
                    } else {
                      onChange(arr.filter((x) => x !== opt.value));
                    }
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}

      {field.type === "boolean" && (
        <div
          role="radiogroup"
          aria-label={field.label}
          className="inline-flex rounded-md border bg-background p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value === true}
            onClick={() => onChange(true)}
            className={cn(
              "min-w-[80px] rounded px-4 py-1.5 text-sm font-medium transition-colors",
              value === true
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            Yes
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value === false}
            onClick={() => onChange(false)}
            className={cn(
              "min-w-[80px] rounded px-4 py-1.5 text-sm font-medium transition-colors",
              value === false
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            No
          </button>
        </div>
      )}

      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
