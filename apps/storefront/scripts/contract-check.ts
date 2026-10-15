//Contract check: every process.env.X read by the storefront source must be
//provided by deployment.yaml (literal, ${TEMPLATE_VAR}, or secretKeyRef).
//Prevents silent drift between what the app expects and what render-k8s
//emits at deploy time. Mirrors apps/order-api/scripts/contract-check.ts.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(here, "..");
const SRC_DIR = path.join(REPO, "src");
const DEPLOYMENT_YAML = path.join(REPO, "k8s", "deployment.yaml");

const IMPLICIT = new Set<string>([
  "NODE_ENV",
  "HOSTNAME",
  "PATH",
  "HOME",
  "PWD",
  "PORT",
  "OTEL_LOG_LEVEL",
  //next.js public env vars are baked at build time, not at deploy time.
  "NEXT_PUBLIC_DESIGN_PREVIEW",
  //next/font reads these to track usage during build.
  "NEXT_TELEMETRY_DISABLED",
]);

function readAll(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readAll(p));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(p);
    }
  }
  return files;
}

function extractEnvReads(files: string[]): Set<string> {
  const re = /process\.env\.([A-Z0-9_]+)/g;
  const names = new Set<string>();
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
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

  const deploymentYaml = fs.readFileSync(DEPLOYMENT_YAML, "utf8");
  const providedInManifest = extractDeploymentEnvNames(deploymentYaml);

  const missing: string[] = [];
  for (const name of readsInApp) {
    if (IMPLICIT.has(name)) continue;
    if (providedInManifest.has(name)) continue;
    missing.push(name);
  }

  if (missing.length > 0) {
    console.error("Contract check FAILED.");
    console.error("Storefront reads env vars that deployment.yaml does NOT set:");
    for (const name of missing.sort()) {
      console.error("  -", name);
    }
    console.error(
      "\nAdd them to apps/storefront/k8s/deployment.yaml (and wire through"
    );
    console.error(
      "scripts/render-k8s.ts + the deploy job if they need real values), or"
    );
    console.error("remove the process.env read from the source.");
    process.exit(1);
  }

  console.log(
    "Contract check OK —",
    readsInApp.size,
    "env reads, all provided by deployment.yaml."
  );
}

main();
