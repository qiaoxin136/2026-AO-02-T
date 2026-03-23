import { useState, useEffect } from 'react';
import type { Trip } from '../types';

const API_URL = 'https://ao5cz2bqph.execute-api.us-east-1.amazonaws.com/test/getData';

export function useTripsData() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 100]);

  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then((data: Trip[]) => {
        setTrips(data);
        const allTs = data.flatMap(t => t.timestamps);
        setTimeRange([Math.min(...allTs), Math.max(...allTs)]);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { trips, loading, error, timeRange };
}
