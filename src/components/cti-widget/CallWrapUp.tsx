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
        <h3 className="text-sm font-semibold text-white/80">Call Wrap-Up</h3>
        <button
          onClick={onDismiss}
          className="text-white/30 hover:text-white/60 text-sm transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Call info — glass card */}
      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 mb-3 text-xs text-white/50">
        <div className="flex justify-between">
          <span>{direction === "inbound" ? "Inbound" : "Outbound"}</span>
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="font-mono mt-0.5 text-white/70">
          {contactName ? `${contactName} (${phone})` : phone}
        </div>
      </div>

      {/* Disposition — glass pills */}
      <label className="text-xs font-medium text-white/50 mb-1.5">Outcome</label>
      <div className="flex gap-1.5 mb-3">
        {DISPOSITIONS.map((d) => (
          <button
            key={d.value}
            onClick={() => setDisposition(d.value)}
            className={`flex-1 py-1.5 text-xs rounded-xl border transition-all ${
              disposition === d.value
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/8 hover:border-white/15"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Notes — glass textarea */}
      <label className="text-xs font-medium text-white/50 mb-1.5">Notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add call notes..."
        rows={3}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/30 mb-3"
      />

      {/* Save — glass button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-white/5 disabled:text-white/20 text-blue-400 text-sm font-medium rounded-xl border border-blue-500/20 disabled:border-white/5 transition-colors"
      >
        {saving ? "Saving..." : "Save & Close"}
      </button>
    </div>
  );
}
