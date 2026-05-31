// Contract check: every process.env.X read by the app MUST be provided by
// k8s/deployment.yaml (literal, ${TEMPLATE_VAR}, or secretKeyRef). Prevents
// silent drift between what the app expects and what render-k8s emits.
// Copied from apps/order-api/scripts/contract-check.ts.

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..');
const SRC_DIR = path.join(REPO, 'src');
const DEPLOYMENT_YAML = path.join(REPO, 'k8s', 'deployment.yaml');

const IMPLICIT = new Set<string>([
  'NODE_ENV',
  'HOSTNAME',
  'PATH',
  'HOME',
  'PWD',
  'OTEL_LOG_LEVEL',
]);

function readAll(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readAll(p));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) files.push(p);
  }
  return files;
}

function extractEnvReads(files: string[]): Set<string> {
  const re = /process\.env\.([A-Z0-9_]+)/g;
  const names = new Set<string>();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(re)) {
      names.add(match[1]);
    }
  }
  return names;
}

function extractDeploymentEnvNames(yaml: string): Set<string> {
  const re = /^\s*-\s*name:\s*([A-Z0-9_]+)\s*$/gm;
  const names = new Set<string>();
  for (const match of yaml.matchAll(re)) {
    names.add(match[1]);
  }
  return names;
}

function main(): void {
  const srcFiles = readAll(SRC_DIR);
  const readsInApp = extractEnvReads(srcFiles);

  const deploymentYaml = fs.readFileSync(DEPLOYMENT_YAML, 'utf8');
  const providedInManifest = extractDeploymentEnvNames(deploymentYaml);

  const missing: string[] = [];
  for (const name of readsInApp) {
    if (IMPLICIT.has(name)) continue;
    if (providedInManifest.has(name)) continue;
    missing.push(name);
  }

  if (missing.length > 0) {
    console.error('Contract check FAILED.');
    console.error('The app reads these env vars that deployment.yaml does NOT set:');
    for (const name of missing.sort()) {
      console.error('  -', name);
    }
    process.exit(1);
  }

  console.log('Contract check OK —', readsInApp.size, 'env reads, all provided by deployment.yaml.');
}

main();
