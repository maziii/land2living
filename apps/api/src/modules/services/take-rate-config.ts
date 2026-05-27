// Take-rate tiers locked at booking acceptance. Config changes do not affect existing bookings.
// Basis points: 100 bp = 1%

export const SERVICE_CATEGORIES = [
  "gardening",
  "cleaning",
  "security",
  "plumbing",
  "electrical",
  "repairs",
  "bricklaying",
  "fencing",
  "borehole",
  "architecture",
  "building",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

// Recurring small jobs: 11% (1100 bp)
const SMALL_RECURRING: ServiceCategory[] = ["gardening", "cleaning", "security"];
// Mid jobs: 7% (700 bp)
const MID_JOBS: ServiceCategory[] = ["plumbing", "electrical", "repairs"];
// Large jobs: 4% (400 bp)
const LARGE_JOBS: ServiceCategory[] = ["bricklaying", "fencing", "borehole", "building"];
// Architects: 6% (600 bp)
const ARCHITECTURE: ServiceCategory[] = ["architecture"];

const TIER_MAP: Map<ServiceCategory, number> = new Map([
  ...SMALL_RECURRING.map((c): [ServiceCategory, number] => [c, 1100]),
  ...MID_JOBS.map((c): [ServiceCategory, number] => [c, 700]),
  ...LARGE_JOBS.map((c): [ServiceCategory, number] => [c, 400]),
  ...ARCHITECTURE.map((c): [ServiceCategory, number] => [c, 600]),
]);

export function getTakeRateBasisPoints(category: string): number {
  return TIER_MAP.get(category as ServiceCategory) ?? 700;
}

export function calculateTakeAmount(quoteAmountZar: number, takeRateBasisPoints: number): number {
  return Math.round(quoteAmountZar * (takeRateBasisPoints / 10000));
}
