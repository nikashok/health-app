// Node ESM resolve hook: lets the headless verifiers import app source that uses
// extensionless relative specifiers (the convention Metro/TS use), e.g. migrate.ts's
// `import './m0Sql'`. Maps `./foo` → `./foo.ts` when that file exists. Used only by
// the verify:* scripts (via --import ./scripts/ts-register.mjs); the app is unaffected.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.([mc]?[jt]sx?|json|node|wasm)$/.test(specifier)) {
    try {
      const candidate = fileURLToPath(new URL(specifier, context.parentURL)) + '.ts';
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
