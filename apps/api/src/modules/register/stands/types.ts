export interface OccupantSummary {
  occupancyId: string;
  residentId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  startedAt: string;
  endedAt: string | null;
  ptoId: string | null;
}

export interface StandResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  localReference: string | null;
  gpsLatitude: number;
  gpsLongitude: number;
  boundaryGeojson: unknown | null;
  areaSquareMetres: number | null;
  addressDescription: string;
  villageOrSection: string;
  standType: string | null;
  photoS3Keys: string[];
  photoUrls: string[];
  priceZar: number | null;
  notes: string | null;
}

export interface StandDetailResponse extends StandResponse {
  occupants: OccupantSummary[];
}

export interface StandListResponse {
  stands: StandResponse[];
  total: number;
  page: number;
  pageSize: number;
}
