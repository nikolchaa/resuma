import { getVersion } from "@tauri-apps/api/app";

/** GitHub's newest published release: never a draft or a pre-release. */
const LATEST_RELEASE = "https://api.github.com/repos/nikolchaa/resuma/releases/latest";
const RELEASES_PAGE = "https://github.com/nikolchaa/resuma/releases";

export type UpdateCheck = {
  /** The running app's version, e.g. "1.1.2". */
  current: string;
  /** The newest release's version, without the "v". */
  latest: string;
  /** That release's page on GitHub. */
  url: string;
  /** Whether the newest release is newer than this app. */
  newer: boolean;
};

/** "v1.10.0-beta" → [1, 10, 0]. Anything after the numbers is ignored. */
const parts = (version: string) =>
  (version.trim().replace(/^v/i, "").match(/^\d+(\.\d+)*/)?.[0] ?? "")
    .split(".")
    .filter(Boolean)
    .map(Number);

/**
 * Whether `latest` is a newer version than `current`, comparing each number
 * in turn, so 1.10.0 is newer than 1.9.2 and a build newer than the latest
 * release isn't offered an "update" to an older one.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** The update toast's text in the app's language. */
export function updateMessage(check: UpdateCheck, t: (key: string) => string) {
  const fill = (s: string, vars: Record<string, string>) =>
    s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  return {
    title: fill(t("settings.updates.available"), { version: check.latest }),
    description: fill(t("settings.updates.availableBody"), { current: check.current }),
    action: t("settings.updates.view"),
    url: check.url,
  };
}

/**
 * Asks GitHub for the newest release and compares it with this app. The
 * request carries nothing about the user: no settings, resumes or IDs.
 */
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheck> {
  const current = await getVersion();
  const res = await fetch(LATEST_RELEASE, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const release = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
  if (typeof release.tag_name !== "string" || parts(release.tag_name).length === 0) {
    throw new Error("GitHub's latest release has no version.");
  }
  const url =
    typeof release.html_url === "string" && release.html_url.startsWith(`${RELEASES_PAGE}/`)
      ? release.html_url
      : RELEASES_PAGE;
  const latest = release.tag_name.trim().replace(/^v/i, "");
  return { current, latest, url, newer: isNewer(latest, current) };
}
