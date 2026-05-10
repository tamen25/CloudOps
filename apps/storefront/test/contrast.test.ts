import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * WCAG AA contrast verification for the cloudops-dim palette.
 *
 * Pulls hex values straight out of tokens.css so the test fails the moment
 * a token is recoloured below the AA threshold.
 *
 * Rules (WCAG 2.1):
 *  - Normal text: contrast ratio >= 4.5:1
 *  - Large text (>= 18pt or >= 14pt bold) and UI components: >= 3.0:1
 *
 * We assert both bands depending on what each pair is intended to render.
 */

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = resolve(here, "..", "src", "styles", "tokens.css");
const tokensCss = readFileSync(tokensPath, "utf8");

function readToken(name: string): string {
  const re = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`);
  const match = tokensCss.match(re);
  if (!match) {
    throw new Error(`token --color-${name} not found in tokens.css`);
  }
  return match[1].toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const lf = relativeLuminance(hexToRgb(fg));
  const lb = relativeLuminance(hexToRgb(bg));
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const bgBase = readToken("bg-base");
const bgRaised = readToken("bg-raised");
const bgElev = readToken("bg-elev");
const fgBase = readToken("fg-base");
const fgMuted = readToken("fg-muted");
const fgInvert = readToken("fg-invert");
const brand500 = readToken("brand-500");
const brand400 = readToken("brand-400");
const success = readToken("success");
const danger = readToken("danger");
const info = readToken("info");

const NORMAL = 4.5;
const LARGE = 3.0;

test("fg.base on bg.base passes AA normal text", () => {
  const ratio = contrast(fgBase, bgBase);
  assert.ok(ratio >= NORMAL, `fg.base on bg.base = ${ratio.toFixed(2)}:1`);
});

test("fg.base on bg.raised passes AA normal text", () => {
  const ratio = contrast(fgBase, bgRaised);
  assert.ok(ratio >= NORMAL, `fg.base on bg.raised = ${ratio.toFixed(2)}:1`);
});

test("fg.base on bg.elev passes AA normal text", () => {
  const ratio = contrast(fgBase, bgElev);
  assert.ok(ratio >= NORMAL, `fg.base on bg.elev = ${ratio.toFixed(2)}:1`);
});

test("fg.muted on bg.base passes AA normal text", () => {
  const ratio = contrast(fgMuted, bgBase);
  assert.ok(ratio >= NORMAL, `fg.muted on bg.base = ${ratio.toFixed(2)}:1`);
});

test("fg.invert on brand.500 passes AA normal text (primary button)", () => {
  const ratio = contrast(fgInvert, brand500);
  assert.ok(ratio >= NORMAL, `fg.invert on brand.500 = ${ratio.toFixed(2)}:1`);
});

test("brand.400 on bg.base passes AA large text / UI threshold", () => {
  const ratio = contrast(brand400, bgBase);
  assert.ok(ratio >= LARGE, `brand.400 on bg.base = ${ratio.toFixed(2)}:1`);
});

test("brand.500 on bg.base passes AA large text / UI threshold", () => {
  const ratio = contrast(brand500, bgBase);
  assert.ok(ratio >= LARGE, `brand.500 on bg.base = ${ratio.toFixed(2)}:1`);
});

test("success on bg.base passes AA large text threshold", () => {
  const ratio = contrast(success, bgBase);
  assert.ok(ratio >= LARGE, `success on bg.base = ${ratio.toFixed(2)}:1`);
});

test("danger on bg.base passes AA large text threshold", () => {
  const ratio = contrast(danger, bgBase);
  assert.ok(ratio >= LARGE, `danger on bg.base = ${ratio.toFixed(2)}:1`);
});

test("info on bg.base passes AA large text threshold", () => {
  const ratio = contrast(info, bgBase);
  assert.ok(ratio >= LARGE, `info on bg.base = ${ratio.toFixed(2)}:1`);
});
