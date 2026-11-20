import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import readmeHandler from "~/routes/repos/[owner]/[repo]/readme";
import * as ghUtils from "~/utils/github";

describe("readme route handler", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("fetches README using global fetch with CDN URL", async () => {
    vi.spyOn(ghUtils, "ghRepo").mockResolvedValue({ default_branch: "main" } as any);
    vi.spyOn(ghUtils, "ghMarkdown").mockImplementation(async (md: string) => `<p>${md}</p>`);

    fetchSpy.mockResolvedValueOnce(
      new Response("# ofetch\n\nA better fetch.", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const event = {
      url: new URL("/repos/unjs/ofetch/readme", "https://ungh.cc"),
      req: { headers: new Headers() },
      res: { headers: new Headers() },
      context: {
        params: {
          owner: "unjs",
          repo: "ofetch",
        },
      },
    } as any;

    const result = await (readmeHandler as any)(event);
    const body = await result.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/unjs/ofetch/main/README.md",
    );
    expect(body.markdown).toContain("# ofetch");
    expect(body.html).toContain("<p># ofetch");
  });

  it("throws HTTPError when README is not found (non-2xx response)", async () => {
    vi.spyOn(ghUtils, "ghRepo").mockResolvedValue({ default_branch: "main" } as any);

    fetchSpy.mockResolvedValueOnce(
      new Response("404: Not Found", {
        status: 404,
        statusText: "Not Found",
      }),
    );

    const event = {
      url: new URL("/repos/unjs/ofetch/readme", "https://ungh.cc"),
      req: { headers: new Headers() },
      res: { headers: new Headers() },
      context: {
        params: {
          owner: "unjs",
          repo: "ofetch",
        },
      },
    } as any;

    await expect((readmeHandler as any)(event)).rejects.toMatchObject({
      status: 404,
    });
  });
});
