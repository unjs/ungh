const MARKDOWN_LINK_RE =
  /(?<link>\[.*?]\((?<url>.*?)\)|<img.*?src="(?<url2>.*?)".*?>)/g;

/**
 * HTML & Mardown Function to replace relative image paths with absolute paths
 */
export function resolveMarkdownRelativeLinks(
  content: string,
  cdnBaseURL: string,
) {
  console.log("fixing", content);
  return content.replace(
    MARKDOWN_LINK_RE,
    (match, _, url: string | undefined, url2: string) => {
      const path = url || url2;
      // If path is already a URL, return the match
      if (path.startsWith("http") || path.startsWith("https")) {
        return match;
      }
      return match.replace(path, `${cdnBaseURL}/${path.replace(/^\.\//, "")}`);
    },
  );
}
