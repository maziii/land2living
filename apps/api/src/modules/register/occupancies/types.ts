export interface OccupancyResponse {
  id: string;
  createdAt: string;
  endedAt: string | null;
  standId: string;
  residentId: string;
  relationship: string;
  ptoId: string | null;
}

export interface OccupancyWithStandResponse extends OccupancyResponse {
  stand: {
    id: string;
    addressDescription: string;
    villageOrSection: string;
    localReference: string | null;
  };
}
