import type { FastifyCorsOptions } from '@fastify/cors';

import { isAllowedOrigin } from './config.js';

export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 600;

export const corsOptions: FastifyCorsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
};
