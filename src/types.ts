export interface Trip {
  path: [number, number][];
  timestamps: number[];
  vendor: number;
}

export type AnimationSpeed = 0.125 | 0.25 | 0.5 | 1 | 2;

/** Matches the Location model in photo-008/amplify/data/resource.ts */
export interface LocationRecord {
  id: string;
  lat: number;
  lng: number;
  date?: string;
  track?: number;
  diameter?: number;
  time?: string;
  type?: string;
  length?: number;
  username?: string;
  description?: string;
  joint?: boolean;
  photos?: string[];   // array of image URLs
  [key: string]: unknown;
}

/** Backwards-compat alias */
export type PhotoRecord = LocationRecord;
