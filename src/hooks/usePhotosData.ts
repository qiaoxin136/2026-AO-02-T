import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { LocationRecord } from '../types';

const client = generateClient();

const LIST_LOCATIONS = /* GraphQL */ `
  query ListLocations {
    listLocations {
      items {
        id
        date
        track
        diameter
        lat
        lng
        time
        type
        length
        username
        description
        joint
        photos
      }
    }
  }
`;

interface GqlResponse {
  listLocations: {
    items: LocationRecord[];
  };
}

export function usePhotosData() {
  const [photos, setPhotos] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const raw = await client.graphql({ query: LIST_LOCATIONS });
        // client.graphql returns GraphQLResult | GraphqlSubscriptionResult;
        // for a query it is always GraphQLResult which has a .data property.
        const result = raw as unknown as { data: GqlResponse };
        const items: LocationRecord[] = result.data?.listLocations?.items ?? [];

        const valid = items.filter(
          (p) =>
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            !isNaN(p.lat) &&
            !isNaN(p.lng),
        );

        setPhotos(valid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load location data');
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  return { photos, loading, error };
}
