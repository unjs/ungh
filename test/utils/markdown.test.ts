import { describe, expect, it } from "vitest";
import { resolveMarkdownRelativeLinks } from "../../utils/markdown";

const GH_PATH_URL = "https://github.com";
const GH_RAW_URL = "https://raw.githubusercontent.com";

const linkOptions = {
  cdnBaseURL: `${GH_RAW_URL}/owner/repo/main`,
  githubBaseURL: `${GH_PATH_URL}/owner/repo/tree/main`,
};

describe("resolveMarkdownRelativeLinks", () => {
  it("markdown link", () => {
    const res = resolveMarkdownRelativeLinks(
      "[My link](./relative-path)",
      linkOptions,
    );

    expect(res).toMatchInlineSnapshot(
      `"[My link](https://github.com/owner/repo/tree/main/relative-path)"`,
    );
  });

  it("markdown link - relative path name", () => {
    const res = resolveMarkdownRelativeLinks(
      "[./relative-path](./relative-path)",
      linkOptions,
    );

    expect(res).toMatchInlineSnapshot(
      `"[./relative-path](https://github.com/owner/repo/tree/main/relative-path)"`,
    );
  });

  it("html link", () => {
    const res = resolveMarkdownRelativeLinks(
      '<img src="./assets/my-image.jpg" />',
      linkOptions,
    );

    expect(res).toMatchInlineSnapshot(
      `"<img src="https://raw.githubusercontent.com/owner/repo/main/assets/my-image.jpg" />"`,
    );
  });
});
