import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "1.1.2" }));

import { checkForUpdate, isNewer } from "./updates";

describe("isNewer", () => {
  it("compares each number, not the text", () => {
    expect(isNewer("1.1.3", "1.1.2")).toBe(true);
    expect(isNewer("1.10.0", "1.9.2")).toBe(true);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
    expect(isNewer("v1.2.0", "1.1.9")).toBe(true);
  });

  it("offers nothing for the same or an older release", () => {
    expect(isNewer("1.1.2", "1.1.2")).toBe(false);
    expect(isNewer("v1.1.2", "1.1.2")).toBe(false);
    expect(isNewer("1.1.0", "1.1.2")).toBe(false);
    expect(isNewer("1.1", "1.1.0")).toBe(false);
  });

  it("ignores what isn't a version", () => {
    expect(isNewer("nightly", "1.1.2")).toBe(false);
    expect(isNewer("1.1.3", "")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );

  it("reports a newer release and its page", async () => {
    answer(200, {
      tag_name: "v1.2.0",
      html_url: "https://github.com/nikolchaa/resuma/releases/tag/v1.2.0",
    });
    expect(await checkForUpdate()).toEqual({
      current: "1.1.2",
      latest: "1.2.0",
      url: "https://github.com/nikolchaa/resuma/releases/tag/v1.2.0",
      newer: true,
    });
  });

  it("links only to the project's own releases", async () => {
    answer(200, { tag_name: "v1.2.0", html_url: "https://example.com/" });
    expect((await checkForUpdate()).url).toBe("https://github.com/nikolchaa/resuma/releases");
  });

  it("fails on an error or a release without a version", async () => {
    answer(403, { message: "rate limited" });
    await expect(checkForUpdate()).rejects.toThrow("403");
    answer(200, { name: "no tag" });
    await expect(checkForUpdate()).rejects.toThrow();
  });
});
