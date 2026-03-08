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
          className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Call info card */}
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-3 text-xs text-gray-500 shadow-sm">
        <div className="flex justify-between">
          <span>{direction === "inbound" ? "Inbound" : "Outbound"}</span>
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="font-mono mt-0.5 text-gray-700">
          {contactName ? `${contactName} (${phone})` : phone}
        </div>
      </div>

      {/* Disposition pills */}
      <label className="text-xs font-medium text-gray-500 mb-1.5">Outcome</label>
      <div className="flex gap-1.5 mb-3">
        {DISPOSITIONS.map((d) => (
          <button
            key={d.value}
            onClick={() => setDisposition(d.value)}
            className={`flex-1 py-1.5 text-xs rounded-md border transition-all ${
              disposition === d.value
                ? "bg-[#006cff] text-white border-[#006cff]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Notes textarea */}
      <label className="text-xs font-medium text-gray-500 mb-1.5">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add call notes..."
        rows={3}
        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#006cff]/30 focus:border-[#006cff] mb-3"
      />

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-[#006cff] hover:bg-[#0047ff] disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? "Saving..." : "Save & Close"}
      </button>
    </div>
  );
}
