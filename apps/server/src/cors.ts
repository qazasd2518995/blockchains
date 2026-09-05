import type { FastifyCorsOptions } from '@fastify/cors';

import { isAllowedOrigin } from './config.js';

export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 600;

export const corsOptions: FastifyCorsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  // @fastify/cors defaults to GET/HEAD/POST. Our separately hosted admin
  // needs PATCH/PUT/DELETE too; otherwise the browser blocks valid actions
  // before authentication/the route, so no failed DELETE reaches API logs.
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
};
