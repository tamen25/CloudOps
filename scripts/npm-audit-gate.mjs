#!/usr/bin/env node
// npm audit as a CI gate: fails on any high or critical advisory, except the
// ones listed in .github/npm-audit-allowlist.json. npm itself cannot ignore a
// single advisory, and turning the gate off would hide the next one, so every
// exception is written down with its reason and an expiry date. An expired
// entry fails the gate again until someone re-checks the advisory.
//
// Run from a package directory: node ../../scripts/npm-audit-gate.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const allowlistPath = fileURLToPath(new URL('../.github/npm-audit-allowlist.json', import.meta.url));
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

let report;
try {
  report = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
} catch (err) {
  report = err.stdout; // npm audit exits non-zero when it finds anything
}
const { vulnerabilities = {} } = JSON.parse(report);

// The advisories themselves, not the packages flagged only because they
// depend on one (`via` holds a package name for those).
const advisories = new Map();
for (const vuln of Object.values(vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === 'object' && ['high', 'critical'].includes(via.severity)) {
      const id = via.url.split('/').pop();
      advisories.set(id, { id, severity: via.severity, title: via.title, pkg: via.name });
    }
  }
}

let failed = false;
for (const adv of advisories.values()) {
  const entry = allowlist.find((e) => e.id === adv.id);
  if (!entry) {
    console.error(`FAIL ${adv.severity} ${adv.id} ${adv.pkg}: ${adv.title}`);
    failed = true;
  } else if (entry.until < today) {
    console.error(`FAIL ${adv.id} is allowlisted only until ${entry.until}; re-check it: ${entry.reason}`);
    failed = true;
  } else {
    console.log(`allowed until ${entry.until}: ${adv.severity} ${adv.id} ${adv.pkg} (${entry.reason})`);
  }
}
if (!failed) console.log(`npm audit gate: no high or critical advisory outside the allowlist (${advisories.size} found)`);
process.exit(failed ? 1 : 0);
