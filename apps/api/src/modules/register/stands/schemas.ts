import { z } from "zod";

export const STAND_TYPES = ["residential", "business", "farming", "community"] as const;
export type StandType = (typeof STAND_TYPES)[number];

export const createStandSchema = z.object({
  localReference:     z.string().max(100).optional(),
  gpsLatitude:        z.number().min(-90).max(90),
  gpsLongitude:       z.number().min(-180).max(180),
  boundaryGeojson:    z.record(z.unknown()).optional(),
  areaSquareMetres:   z.number().positive().optional(),
  addressDescription: z.string().min(1).max(500),
  villageOrSection:   z.string().min(1).max(200),
  standType:          z.enum(STAND_TYPES).optional(),
  photoS3Keys:        z.array(z.string()).max(10).optional(),
  priceZar:           z.number().positive().optional(),
  notes:              z.string().max(2000).optional(),
});
export type CreateStandRequest = z.infer<typeof createStandSchema>;

export const updateStandSchema = createStandSchema.partial();
export type UpdateStandRequest = z.infer<typeof updateStandSchema>;

export const listStandQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  villageOrSection: z.string().optional(),
  search: z.string().optional(),
  // Geo bounding box: minLat,minLng,maxLat,maxLng
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "bbox must be minLat,minLng,maxLat,maxLng")
    .optional(),
  // When true, exclude stands that are offered, accepted, or actively occupied
  availableOnly: z.coerce.boolean().optional().default(false),
});
export type ListStandQuery = z.infer<typeof listStandQuerySchema>;
