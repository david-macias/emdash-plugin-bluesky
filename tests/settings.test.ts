import { describe, expect, it } from "vitest";
import { cronExpressionFor, readSettings } from "../src/settings.js";

describe("readSettings", () => {
  it("applies defaults when nothing is stored", () => {
    expect(readSettings(null)).toEqual({
      handle: "",
      postCount: 5,
      includeReposts: false,
      filter: "posts_no_replies",
      refreshMinutes: 15,
      showCounts: true,
      showImages: true,
    });
    expect(readSettings({})).toEqual(readSettings(null));
  });

  it("keeps stored values and trims the handle", () => {
    const settings = readSettings({
      handle: "  dmacias.bsky.social ",
      postCount: 8,
      includeReposts: true,
      filter: "posts_with_media",
      refreshMinutes: 30,
      showCounts: false,
      showImages: false,
    });
    expect(settings).toEqual({
      handle: "dmacias.bsky.social",
      postCount: 8,
      includeReposts: true,
      filter: "posts_with_media",
      refreshMinutes: 30,
      showCounts: false,
      showImages: false,
    });
  });

  it("clamps numbers and falls back on wrong types or bad filters", () => {
    const settings = readSettings({
      handle: 42,
      postCount: 99,
      includeReposts: "yes",
      filter: "not-a-filter",
      refreshMinutes: 0,
      showCounts: 1,
    });
    expect(settings.handle).toBe("");
    expect(settings.postCount).toBe(20);
    expect(settings.includeReposts).toBe(false);
    expect(settings.filter).toBe("posts_no_replies");
    expect(settings.refreshMinutes).toBe(1);
    expect(settings.showCounts).toBe(true);
  });
});

describe("cronExpressionFor", () => {
  it("builds a per-N-minutes cron expression", () => {
    expect(cronExpressionFor(15)).toBe("*/15 * * * *");
    expect(cronExpressionFor(1)).toBe("*/1 * * * *");
    expect(cronExpressionFor(0)).toBe("*/1 * * * *"); // clamped to the 1-minute minimum
    expect(cronExpressionFor(2000)).toBe("*/1440 * * * *"); // clamped to the maximum
  });
});
