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
      position: "right",
      postsPosition: "below",
      postPosition: "right",
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
      position: "right",
      postsPosition: "below",
      postPosition: "right",
    });
  });

  it("strips a leading @ from the handle", () => {
    expect(readSettings({ handle: "@dmacias.bsky.social" }).handle).toBe("dmacias.bsky.social");
    expect(readSettings({ handle: "@@dmacias.bsky.social" }).handle).toBe("dmacias.bsky.social");
    expect(readSettings({ handle: "  @dmacias.bsky.social " }).handle).toBe("dmacias.bsky.social");
    expect(readSettings({ handle: "@" }).handle).toBe("");
  });

  it("defaults the feed position to right and rejects unknown values", () => {
    expect(readSettings({}).position).toBe("right");
    expect(readSettings({ position: "left" }).position).toBe("left");
    expect(readSettings({ position: "below" }).position).toBe("below");
    expect(readSettings({ position: "top" }).position).toBe("right");
    expect(readSettings({ position: 42 }).position).toBe("right");
  });

  it("defaults the per-page positions and rejects unknown values", () => {
    expect(readSettings({}).postsPosition).toBe("below");
    expect(readSettings({}).postPosition).toBe("right");
    expect(readSettings({ postsPosition: "left" }).postsPosition).toBe("left");
    expect(readSettings({ postPosition: "below" }).postPosition).toBe("below");
    expect(readSettings({ postsPosition: "top" }).postsPosition).toBe("below");
    expect(readSettings({ postPosition: 42 }).postPosition).toBe("right");
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
