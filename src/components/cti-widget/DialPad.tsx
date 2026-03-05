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
    <div className="flex flex-col items-center px-6 py-4">
      {/* Number display */}
      <div className="w-full mb-4">
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 min-h-[48px]">
          <input
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter number..."
            className="bg-transparent text-lg font-mono text-gray-800 w-full outline-none placeholder:text-gray-300"
          />
          {number && (
            <button
              onClick={handleBackspace}
              className="text-gray-400 hover:text-gray-600 ml-2 text-lg"
              title="Backspace"
            >
              &#9003;
            </button>
          )}
        </div>
      </div>

      {/* Dial pad grid */}
      <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-[240px]">
        {KEYS.map((row) =>
          row.map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className="flex flex-col items-center justify-center w-16 h-16 mx-auto rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              <span className="text-xl font-medium text-gray-800">{key}</span>
              {SUB_LABELS[key] && (
                <span className="text-[9px] text-gray-400 tracking-wider">
                  {SUB_LABELS[key]}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Call button */}
      <button
        onClick={handleDial}
        disabled={number.replace(/[^0-9+]/g, "").length < 3}
        className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-2xl flex items-center justify-center transition-colors shadow-lg"
        title="Call"
      >
        &#128222;
      </button>
    </div>
  );
}
