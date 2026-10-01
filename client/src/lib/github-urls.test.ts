import { describe, it, expect } from "vitest";
import { githubBlobUrl, githubTreeUrl } from "./github-urls";

describe("githubTreeUrl", () => {
  it("pins a directory to the sha with per-segment encoding", () => {
    expect(githubTreeUrl("o/r", "abc123", "src/my dir/a#b")).toBe(
      "https://github.com/o/r/tree/abc123/src/my%20dir/a%23b",
    );
  });

  it("uses the tree route, unlike the blob route for files", () => {
    expect(githubTreeUrl("o/r", "abc", "src")).toContain("/tree/abc/src");
    expect(githubBlobUrl("o/r", "abc", "src/a.ts")).toContain("/blob/abc/src/a.ts");
  });
});
