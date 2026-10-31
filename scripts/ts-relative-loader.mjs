// Minimal Node ESM loader used by the scripts/test-*.mjs integration tests to
// import real app/lib TypeScript files directly (no bundler). Next.js
// resolves two things automatically that Node's native loader does not:
//   1. Extensionless relative TS imports (e.g. `./supabase`) -> append `.ts`.
//   2. The `@/*` -> `./*` path alias from tsconfig.json's `compilerOptions.paths`.
// Does not touch any app source file.
const PROJECT_ROOT = new URL('../', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = new URL(specifier.slice(2), PROJECT_ROOT).href;
    const withExt = /\.[a-zA-Z0-9]+$/.test(target) ? target : target + '.ts';
    return nextResolve(withExt, context);
  }
  if (specifier.startsWith('.') && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      // fall through to default resolution / its error
    }
  }
  return nextResolve(specifier, context);
}
