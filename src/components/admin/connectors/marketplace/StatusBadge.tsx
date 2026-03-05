"use client";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
  TESTING: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DISABLED: "bg-red-100 text-red-600 border-red-200",
  ARCHIVED: "bg-gray-100 text-gray-400 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Planned",
  TESTING: "Testing",
  DISABLED: "Disabled",
  ARCHIVED: "Archived",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500 border-gray-200";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      {label}
    </span>
  );
}
