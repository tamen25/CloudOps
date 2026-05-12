//Renders apps/storefront/k8s templates by substituting ${VAR} placeholders
//with values from the current environment. Mirrors order-api's render-k8s.ts
//pattern (closes backlog #79).
import * as fs from "fs/promises";
import * as path from "path";

const [inputDir, outputDir] = process.argv.slice(2);

if (!inputDir || !outputDir) {
  console.error("Usage: tsx render-k8s.ts <input-dir> <output-dir>");
  process.exit(1);
}

const missingVariables = new Set<string>();

function renderTemplate(content: string): string {
  return content.replace(
    /\$\{([A-Z0-9_]+)\}/g,
    (match, variableName: string) => {
      const value = process.env[variableName];
      if (value === undefined) {
        missingVariables.add(variableName);
        return match;
      }
      return value;
    }
  );
}

async function renderDirectory(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await renderDirectory(sourcePath, targetPath);
      continue;
    }

    const content = await fs.readFile(sourcePath, "utf8");
    const rendered = renderTemplate(content);
    await fs.writeFile(targetPath, rendered, "utf8");
  }
}

(async () => {
  await renderDirectory(path.resolve(inputDir), path.resolve(outputDir));

  if (missingVariables.size > 0) {
    throw new Error(
      `Missing template variables: ${Array.from(missingVariables)
        .sort()
        .join(", ")}`
    );
  }
})().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
