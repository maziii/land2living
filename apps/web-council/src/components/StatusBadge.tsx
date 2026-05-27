const STATUS_COLOURS: Record<string, string> = {
  // Resident verification
  unverified: "bg-gray-100 text-gray-700",
  identity_verified: "bg-blue-100 text-blue-700",
  council_verified: "bg-green-100 text-green-700",
  // Occupancy relationships
  primary_occupant: "bg-forest-100 text-forest-700",
  household_member: "bg-amber-100 text-amber-700",
  historic_owner: "bg-gray-100 text-gray-500",
  // Application statuses
  submitted:         "bg-blue-100 text-blue-700",
  under_review:      "bg-amber-100 text-amber-700",
  approved:          "bg-green-100 text-green-700",
  stand_offered:     "bg-purple-100 text-purple-700",
  viewing_requested: "bg-purple-100 text-purple-600",
  offer_rejected:    "bg-orange-100 text-orange-700",
  offer_accepted:    "bg-green-100 text-green-700",
  active:            "bg-forest-100 text-forest-700",
  rejected:          "bg-red-100 text-red-700",
  deferred:          "bg-orange-100 text-orange-600",
  withdrawn:         "bg-gray-100 text-gray-500",
  // Resale listing statuses
  draft: "bg-gray-100 text-gray-600",
  pending_council_approval: "bg-amber-100 text-amber-700",
  live: "bg-green-100 text-green-700",
  under_offer: "bg-blue-100 text-blue-700",
  transfer_pending: "bg-purple-100 text-purple-700",
  transferred: "bg-forest-100 text-forest-700",
  expired: "bg-gray-100 text-gray-400",
  // Offer statuses
  accepted: "bg-green-100 text-green-700",
  // Service booking statuses
  quote_requested: "bg-amber-100 text-amber-700",
  quoted: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
  // Supplier quote request statuses
  pending: "bg-amber-100 text-amber-700",
  receiving: "bg-blue-100 text-blue-700",
  selected: "bg-green-100 text-green-700",
  // Commission / sale statuses
  pending_invoice: "bg-amber-100 text-amber-700",
  invoiced: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  // Provider verification
  verified: "bg-green-100 text-green-700",
};

export function StatusBadge({ status }: { status: string }) {
  const colour = STATUS_COLOURS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colour}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
