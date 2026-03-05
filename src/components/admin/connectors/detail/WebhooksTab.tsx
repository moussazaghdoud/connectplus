"use client";

import type { ConnectorDetail } from "@/app/admin/connectors/[slug]/page";

interface Props {
  detail: ConnectorDetail;
}

export function WebhooksTab({ detail }: Props) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${baseUrl}/api/v1/webhooks/${detail.slug}`;

  // Try to extract webhook config
  const config = (detail as unknown as { config?: Record<string, unknown> }).config;
  const webhook = (config as Record<string, unknown>)?.webhook as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Webhook URL */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Webhook Endpoint</h3>
        <p className="text-xs text-gray-400 mb-2">
          Register this URL in your {detail.name} webhook settings to receive real-time events.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono bg-gray-50 px-3 py-2 rounded-lg border text-gray-700 break-all">
            {webhookUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="text-xs px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex-shrink-0"
          >
            Copy
          </button>
        </div>
      </section>

      {/* Webhook status */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Last Event</p>
            <p className="text-sm font-medium text-gray-700">
              {detail.lastWebhookAt ? new Date(detail.lastWebhookAt).toLocaleString() : "Never received"}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Verification</p>
            <p className="text-sm font-medium text-gray-700">
              {webhook?.signatureMethod ? String(webhook.signatureMethod).replace("_", "-").toUpperCase() : "Not configured"}
            </p>
          </div>
        </div>
      </section>

      {/* Webhook config details */}
      {webhook && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Configuration</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {webhook.signatureHeader ? (
                  <Row label="Signature Header" value={String(webhook.signatureHeader)} />
                ) : null}
                {webhook.signatureMethod ? (
                  <Row label="Signature Method" value={String(webhook.signatureMethod)} />
                ) : null}
                {webhook.timestampHeader ? (
                  <Row label="Timestamp Header" value={String(webhook.timestampHeader)} />
                ) : null}
                {webhook.eventTypeField ? (
                  <Row label="Event Type Field" value={String(webhook.eventTypeField)} />
                ) : null}
                {webhook.externalIdField ? (
                  <Row label="External ID Field" value={String(webhook.externalIdField)} />
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!webhook && (
        <div className="text-sm text-gray-400">
          {detail.tier === "CODE_BASED"
            ? "Webhook configuration is handled in the connector source code."
            : "No webhook configuration defined. Configure webhooks in the connector definition."}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium text-gray-600 w-48">{label}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-700">{value}</td>
    </tr>
  );
}
