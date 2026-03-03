"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { BasicInfoStep } from "./steps/BasicInfoStep";
import { AuthSetupStep } from "./steps/AuthSetupStep";
import { ContactSearchStep } from "./steps/ContactSearchStep";
import { WriteBackStep } from "./steps/WriteBackStep";
import { WebhookStep } from "./steps/WebhookStep";
import { TestActivateStep } from "./steps/TestActivateStep";

const STEPS = [
  { id: 1, label: "Basic Info", component: BasicInfoStep },
  { id: 2, label: "Authentication", component: AuthSetupStep },
  { id: 3, label: "Contact Search", component: ContactSearchStep },
  { id: 4, label: "Write-Back", component: WriteBackStep },
  { id: 5, label: "Webhooks", component: WebhookStep },
  { id: 6, label: "Test & Activate", component: TestActivateStep },
];

export interface WizardState {
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  config: Record<string, unknown>;
  status: string;
  savedSlug: string | null; // null = not yet saved to DB
}

type WizardAction =
  | { type: "SET_FIELD"; field: keyof WizardState; value: unknown }
  | { type: "SET_CONFIG"; path: string; value: unknown }
  | { type: "LOAD"; state: Partial<WizardState> };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_CONFIG": {
      const keys = action.path.split(".");
      const config = { ...state.config };
      let current: Record<string, unknown> = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]] || typeof current[keys[i]] !== "object") {
          current[keys[i]] = {};
        }
        current[keys[i]] = { ...(current[keys[i]] as Record<string, unknown>) };
        current = current[keys[i]] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]] = action.value;
      return { ...state, config };
    }
    case "LOAD":
      return { ...state, ...action.state };
    default:
      return state;
  }
}

const INITIAL_STATE: WizardState = {
  slug: "",
  name: "",
  description: "",
  logoUrl: "",
  config: {},
  status: "DRAFT",
  savedSlug: null,
};

interface WizardShellProps {
  apiKey: string;
  editSlug?: string;
}

export function WizardShell({ apiKey, editSlug }: WizardShellProps) {
  const [step, setStep] = useState(1);
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load existing definition if editing
  useEffect(() => {
    if (!editSlug) return;
    fetch(`/api/v1/admin/connector-definitions/${editSlug}`, {
      headers: { "x-api-key": apiKey },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.slug) {
          dispatch({
            type: "LOAD",
            state: {
              slug: data.slug,
              name: data.name,
              description: data.description ?? "",
              logoUrl: data.logoUrl ?? "",
              config: data.config ?? {},
              status: data.status,
              savedSlug: data.slug,
            },
          });
        }
      })
      .catch(() => {});
  }, [editSlug, apiKey]);

  // Auto-save on step change
  const save = useCallback(async () => {
    if (!state.name || !state.slug) return;
    setSaving(true);
    setError("");

    try {
      if (state.savedSlug) {
        // Update existing
        await fetch(`/api/v1/admin/connector-definitions/${state.savedSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            name: state.name,
            description: state.description,
            logoUrl: state.logoUrl || undefined,
            config: state.config,
          }),
        });
      } else {
        // Create new
        const resp = await fetch("/api/v1/admin/connector-definitions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            slug: state.slug,
            name: state.name,
            description: state.description,
            logoUrl: state.logoUrl || undefined,
            config: state.config,
          }),
        });
        const data = await resp.json();
        if (data.slug) {
          dispatch({ type: "SET_FIELD", field: "savedSlug", value: data.slug });
        } else if (data.error) {
          setError(data.error.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [state, apiKey]);

  const goToStep = useCallback(
    (newStep: number) => {
      save();
      setStep(newStep);
    },
    [save]
  );

  const StepComponent = STEPS[step - 1].component;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">
        {editSlug ? `Edit: ${state.name}` : "Create Connector"}
      </h1>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex gap-1 mb-8">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => goToStep(s.id)}
            className={`flex-1 py-2 px-1 text-xs font-medium rounded transition-colors
              ${step === s.id
                ? "bg-blue-600 text-white"
                : s.id < step
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <StepComponent
        state={state}
        dispatch={dispatch as never}
        apiKey={apiKey}
      />

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t">
        <button
          onClick={() => goToStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30"
        >
          Previous
        </button>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-gray-400">Saving...</span>}
          <span className="text-xs text-gray-400">
            {state.savedSlug ? `Draft saved (${state.slug})` : "Not yet saved"}
          </span>
          {step < 6 ? (
            <button
              onClick={() => goToStep(step + 1)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
            >
              Next
            </button>
          ) : (
            <button
              onClick={save}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
