'use strict';

// Fail-closed auth check. Non-local envs must boot with an authentication
// config (API_KEY/API_KEY_SECRET_ARN OR an OIDC JWT verifier);
// local/test/dev keep the open behavior so the dev cluster and unit tests
// still run.
// Closes backlog #22, extended for #7 (accepts JWT verifier too).

const UNAUTHENTICATED_ENVS = new Set(['dev', 'test', 'local']);

function assertAuthConfigured({ apiKey, jwtVerifier = null, nodeEnv, logger }) {
  if (apiKey || jwtVerifier) return;
  if (UNAUTHENTICATED_ENVS.has(nodeEnv)) {
    logger.warn({ env: nodeEnv }, 'no auth configured — /order and /orders are unauthenticated');
    return;
  }
  throw new Error(
    `auth config required in NODE_ENV=${nodeEnv} — set API_KEY/API_KEY_SECRET_ARN or OIDC_ISSUER+OIDC_AUDIENCE+OIDC_JWKS_URL`,
  );
}

module.exports = { assertAuthConfigured, UNAUTHENTICATED_ENVS };
