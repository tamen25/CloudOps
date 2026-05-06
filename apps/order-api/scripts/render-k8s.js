'use strict';

const fs = require('fs/promises');
const path = require('path');

const [inputDir, outputDir] = process.argv.slice(2);

if (!inputDir || !outputDir) {
  console.error('Usage: node render-k8s.js <input-dir> <output-dir>');
  process.exit(1);
}

const missingVariables = new Set();

function renderTemplate(content) {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (match, variableName) => {
    const value = process.env[variableName];
    if (value === undefined) {
      missingVariables.add(variableName);
      return match;
    }

    return value;
  });
}

async function renderDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await renderDirectory(sourcePath, targetPath);
      continue;
    }

    const content = await fs.readFile(sourcePath, 'utf8');
    const rendered = renderTemplate(content);
    await fs.writeFile(targetPath, rendered, 'utf8');
  }
}

(async () => {
  await renderDirectory(path.resolve(inputDir), path.resolve(outputDir));

  if (missingVariables.size > 0) {
    throw new Error(`Missing template variables: ${Array.from(missingVariables).sort().join(', ')}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
