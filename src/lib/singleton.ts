/**
 * One instance per window, even when a module is loaded again (the dev
 * server reloads changed modules in place). Shared state such as the
 * proposal store must not split into an old copy that receives updates and a
 * new copy that the screen shows.
 */
export function windowSingleton<T>(key: string, make: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const name = `__resuma_${key}`;
  if (!(name in g)) g[name] = make();
  return g[name] as T;
}
