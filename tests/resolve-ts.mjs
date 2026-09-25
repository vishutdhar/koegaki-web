import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);

export async function resolve(specifier, context, next) {
  let target = specifier;
  if (target.startsWith("@/")) target = new URL(target.slice(2), root).href;
  const isRelative = target.startsWith("./") || target.startsWith("../") || target.startsWith("file:");
  if (isRelative && !/\.[cm]?[jt]sx?$/.test(target)) {
    const base = target.startsWith("file:") ? target : new URL(target, context.parentURL).href;
    for (const ext of [".ts", ".tsx"]) {
      const candidate = fileURLToPath(base) + ext;
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(target, context);
}
