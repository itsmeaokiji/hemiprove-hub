import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(process.cwd(), "src");
const TS_EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveFileCandidate(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }
  if (!path.extname(basePath)) {
    for (const ext of TS_EXTENSIONS) {
      const candidate = basePath + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = resolveFileCandidate(path.resolve(SRC_DIR, specifier.slice(2)));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = resolveFileCandidate(path.resolve(parentDir, specifier));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json") && !context.importAttributes?.type) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
