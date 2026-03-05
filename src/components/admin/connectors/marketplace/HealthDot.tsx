"use client";

interface HealthDotProps {
  status: boolean | null;
  label?: string;
}

export function HealthDot({ status, label }: HealthDotProps) {
  const color =
    status === true
      ? "bg-green-400"
      : status === false
        ? "bg-red-400"
        : "bg-gray-300";

  const title =
    status === true
      ? "Healthy"
      : status === false
        ? "Unhealthy"
        : "Unknown";

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={title} />
      {label && <span>{label}</span>}
    </span>
  );
}
