import { z } from "zod";

export const createOccupancySchema = z.object({
  residentId: z.string().uuid(),
  relationship: z.enum(["primary_occupant", "household_member", "historic_owner"]),
});
export type CreateOccupancyRequest = z.infer<typeof createOccupancySchema>;

export const updateOccupancySchema = z.object({
  relationship: z.enum(["primary_occupant", "household_member", "historic_owner"]).optional(),
  endedAt: z.string().datetime().optional(),
});
export type UpdateOccupancyRequest = z.infer<typeof updateOccupancySchema>;
