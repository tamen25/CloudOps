'use strict';

// Contract check: every process.env.X read by the app MUST be provided by
// deployment.yaml (either as a literal value, a ${TEMPLATE_VAR}, or a
// secretKeyRef). Prevents silent drift between what server.js expects and
// what the render-k8s script actually emits.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SRC_DIR = path.join(REPO, 'src');
const DEPLOYMENT_YAML = path.join(REPO, 'k8s', 'deployment.yaml');

// Env vars the container runtime / Kubernetes / Node inject implicitly.
// These never appear in deployment.yaml and must be allow-listed.
const IMPLICIT = new Set([
  'NODE_ENV',                 // set via env block — but also has a default, keep allowed
  'HOSTNAME',                 // K8s injects automatically
  'PATH',
  'HOME',
  'PWD',
  'OTEL_LOG_LEVEL',           // read by opentelemetry SDK opportunistically
  'API_KEY',                  // local-dev override for API_KEY_SECRET_ARN; prod uses the ARN path
]);

function readAll(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readAll(p));
    else if (entry.name.endsWith('.js')) files.push(p);
  }
  return files;
}

function extractEnvReads(files) {
  const re = /process\.env\.([A-Z0-9_]+)/g;
  const names = new Set();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(re)) {
      names.add(match[1]);
    }
  }

  return names;
}

function extractDeploymentEnvNames(yaml) {
  // Very intentionally a regex scan, not a YAML parser — keeps this script
  // zero-dep. `- name: FOO` inside the container.env list is what we want.
  const re = /^\s*-\s*name:\s*([A-Z0-9_]+)\s*$/gm;
  const names = new Set();
  for (const match of yaml.matchAll(re)) {
    names.add(match[1]);
  }
  return names;
}

function main() {
  const srcFiles = readAll(SRC_DIR);
  const readsInApp = extractEnvReads(srcFiles);

  const deploymentYaml = fs.readFileSync(DEPLOYMENT_YAML, 'utf8');
  const providedInManifest = extractDeploymentEnvNames(deploymentYaml);

  const missing = [];
  for (const name of readsInApp) {
    if (IMPLICIT.has(name)) continue;
    if (providedInManifest.has(name)) continue;
    missing.push(name);
  }

  if (missing.length > 0) {
    console.error('Contract check FAILED.');
    console.error('The app reads these env vars that deployment.yaml does NOT set:');
    for (const name of missing.sort()) console.error('  -', name);
    console.error('\nEither add them to apps/order-api/k8s/deployment.yaml (and wire through');
    console.error('render-k8s.js + the deploy job if they need real values), or remove the');
    console.error('process.env read from the app.');
    process.exit(1);
  }

  console.log('Contract check OK —', readsInApp.size, 'env reads, all provided by deployment.yaml.');
}

main();
