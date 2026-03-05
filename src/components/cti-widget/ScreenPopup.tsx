"use client";

import { useState, useEffect } from "react";

export interface ScreenPopData {
  callId: string;
  correlationId: string;
  phone: string;
  direction: string;
  contact?: {
    name: string;
    recordId: string;
    module: string;
    company?: string;
    crmUrl?: string;
    crm: string;
  };
}

interface Props {
  data: ScreenPopData | null;
  onAnswer: () => void;
  onDecline: () => void;
  onOpenRecord: () => void;
  onDismiss: () => void;
}

export function ScreenPopup({
  data,
  onAnswer,
  onDecline,
  onOpenRecord,
  onDismiss,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (data) {
      setVisible(true);
    }
  }, [data]);

  if (!data || !visible) return null;

  const hasContact = !!data.contact;
  const isInbound = data.direction === "inbound";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-80 pointer-events-auto animate-slide-down">
        {/* Header */}
        <div
          className={`px-4 py-3 rounded-t-xl ${
            isInbound
              ? "bg-gradient-to-r from-blue-500 to-blue-600"
              : "bg-gradient-to-r from-green-500 to-green-600"
          } text-white`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {isInbound ? "📞" : "📱"}
              </span>
              <span className="text-sm font-semibold">
                {isInbound ? "Incoming Call" : "Outgoing Call"}
              </span>
            </div>
            <button
              onClick={() => {
                setVisible(false);
                onDismiss();
              }}
              className="text-white/70 hover:text-white text-lg leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Contact info */}
        <div className="px-4 py-4">
          {hasContact ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg font-bold">
                {data.contact!.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-800 truncate">
                  {data.contact!.name}
                </p>
                {data.contact!.company && (
                  <p className="text-sm text-gray-500 truncate">
                    {data.contact!.company}
                  </p>
                )}
                <p className="text-xs text-gray-400 font-mono">{data.phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {data.contact!.module} &middot; {data.contact!.crm}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg">
                ?
              </div>
              <div>
                <p className="text-base font-semibold text-gray-800">
                  Unknown Caller
                </p>
                <p className="text-sm text-gray-500 font-mono">{data.phone}</p>
                <p className="text-xs text-gray-400">No CRM match found</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* CRM record button */}
          {hasContact && data.contact!.recordId && (
            <button
              onClick={() => {
                onOpenRecord();
                setVisible(false);
              }}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              <span>🔗</span> Open CRM Record
            </button>
          )}

          {/* Call actions */}
          {isInbound && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onAnswer();
                  setVisible(false);
                }}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Answer
              </button>
              <button
                onClick={() => {
                  onDecline();
                  setVisible(false);
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
