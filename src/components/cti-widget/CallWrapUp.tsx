"use client";

import { useState } from "react";

interface Props {
  correlationId: string;
  direction: string;
  phone: string;
  contactName?: string;
  duration: number;
  onSave: (notes: string, disposition: string) => void;
  onDismiss: () => void;
}

const DISPOSITIONS = [
  { value: "answered", label: "Answered" },
  { value: "missed", label: "Missed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export function CallWrapUp({
  correlationId,
  direction,
  phone,
  contactName,
  duration,
  onSave,
  onDismiss,
}: Props) {
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState("answered");
  const [saving, setSaving] = useState(false);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(notes, disposition);
    setSaving(false);
  };

  return (
    <div className="flex flex-col px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Call Wrap-Up</h3>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          Skip
        </button>
      </div>

      {/* Call info */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>{direction === "inbound" ? "Inbound" : "Outbound"}</span>
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="font-mono mt-0.5">
          {contactName ? `${contactName} (${phone})` : phone}
        </div>
      </div>

      {/* Disposition */}
      <label className="text-xs font-medium text-gray-600 mb-1">Outcome</label>
      <div className="flex gap-1.5 mb-3">
        {DISPOSITIONS.map((d) => (
          <button
            key={d.value}
            onClick={() => setDisposition(d.value)}
            className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${
              disposition === d.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Notes */}
      <label className="text-xs font-medium text-gray-600 mb-1">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add call notes..."
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
      />

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? "Saving..." : "Save & Close"}
      </button>
    </div>
  );
}
