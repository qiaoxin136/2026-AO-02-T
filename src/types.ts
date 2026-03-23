export interface Trip {
  path: [number, number][];
  timestamps: number[];
  vendor: number;
}

export type AnimationSpeed = 0.125 | 0.25 | 0.5 | 1 | 2;
