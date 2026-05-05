'use strict';

// Fail-closed auth check. Only local unit/integration test runners boot with
// no auth; every deployed environment (dev, staging, prod) must present
// either an API key or an OIDC JWT verifier.
// Closes backlog #22, extended for #7 (accepts JWT verifier too) and #50
// (dev removed from the unauthenticated set so dev clusters cannot deploy
// open data routes — covers the "real OIDC in dev/staging/prod" contract in
// docs/environment-contract.md).

const UNAUTHENTICATED_ENVS = new Set(['test', 'local']);

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
