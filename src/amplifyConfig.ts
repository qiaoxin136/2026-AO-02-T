import { Amplify } from 'aws-amplify';

const REGION   = import.meta.env.VITE_AMPLIFY_REGION          ?? 'us-east-1';
const ENDPOINT = import.meta.env.VITE_AMPLIFY_API_ENDPOINT    ?? '';
const API_KEY  = import.meta.env.VITE_AMPLIFY_API_KEY         ?? '';
const BUCKET   = import.meta.env.VITE_AMPLIFY_STORAGE_BUCKET  ?? '';
const POOL_ID  = import.meta.env.VITE_AMPLIFY_IDENTITY_POOL_ID ?? '';

Amplify.configure({
  Auth: POOL_ID
    ? {
        Cognito: {
          identityPoolId: POOL_ID,
          // no userPoolId — guest (unauthenticated) credentials only
          allowGuestAccess: true,
        },
      }
    : undefined,

  API: {
    GraphQL: {
      endpoint: ENDPOINT,
      region:   REGION,
      defaultAuthMode: 'apiKey',
      apiKey:   API_KEY,
    },
  },

  Storage: BUCKET
    ? {
        S3: {
          bucket: BUCKET,
          region: REGION,
        },
      }
    : undefined,
});
