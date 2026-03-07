"use client";

import { useState } from "react";

interface Props {
  onDial: (number: string) => void;
  onDtmf: (digits: string) => void;
  hasActiveCall: boolean;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

const SUB_LABELS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
  "0": "+",
};

export function DialPad({ onDial, onDtmf, hasActiveCall }: Props) {
  const [number, setNumber] = useState("");

  const handleKeyPress = (key: string) => {
    if (hasActiveCall) {
      onDtmf(key);
    }
    setNumber((prev) => prev + key);
  };

  const handleBackspace = () => {
    setNumber((prev) => prev.slice(0, -1));
  };

  const handleDial = () => {
    const cleaned = number.replace(/[^0-9+*#]/g, "");
    if (cleaned.length >= 3) {
      onDial(cleaned);
      setNumber("");
    }
  };

  return (
    <div className="flex flex-col items-center px-6 py-5">
      {/* Number display — glass input */}
      <div className="w-full mb-5">
        <div className="flex items-center justify-between backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl px-4 py-3 min-h-[52px]">
          <input
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter number..."
            className="bg-transparent text-xl font-mono text-white w-full outline-none placeholder:text-white/20 tracking-wider"
          />
          {number && (
            <button
              onClick={handleBackspace}
              className="text-white/30 hover:text-white/60 ml-2 transition-colors"
              title="Backspace"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Dial pad grid — glass buttons */}
      <div className="grid grid-cols-3 gap-3 mb-5 w-full max-w-[240px]">
        {KEYS.map((row) =>
          row.map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className="flex flex-col items-center justify-center w-16 h-16 mx-auto rounded-full bg-white/8 hover:bg-white/15 active:bg-white/20 border border-white/10 transition-all duration-150"
            >
              <span className="text-xl font-medium text-white/90">{key}</span>
              {SUB_LABELS[key] && (
                <span className="text-[9px] text-white/30 tracking-wider">
                  {SUB_LABELS[key]}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Call button — green glow */}
      <button
        onClick={handleDial}
        disabled={number.replace(/[^0-9+]/g, "").length < 3}
        className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:border-white/5 disabled:shadow-none disabled:cursor-not-allowed text-white text-2xl flex items-center justify-center transition-all shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/40 border border-emerald-400/30"
        title="Call"
      >
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
      </button>
    </div>
  );
}
