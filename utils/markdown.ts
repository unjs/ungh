const MARKDOWN_LINK_RE =
  /(?<link>\[.*?]\((?<url>.*?)\)|<img.*?src="(?<url2>.*?)".*?>)/g;

/**
 * HTML & Mardown Function to replace relative image paths with absolute paths
 */
export function resolveMarkdownRelativeLinks(
  content: string,
  cdnBaseURL: string,
) {
  return content.replace(
    MARKDOWN_LINK_RE,
    (match, _, url: string | undefined, url2: string) => {
      const path = url || url2;
      // If path is already a URL, return the match
      if (path.startsWith("http") || path.startsWith("https")) {
        return match;
      }
      /**
       * RegExp is used to avoid replacing texts in markdown links and targets only `href` and `src` attributes
       * @example [link](./image.png) => [link](https://cdn.com/image.png)
       * @example [./src/file.ts](./src/file.ts) => [./src/file.ts](https://cdn.com/src/file.ts)
      */
      const searchRegExp = new RegExp(`(?<before>[^[])(?<url>${path})`, "g") // [^[] matches any character except [
      return match.replace(searchRegExp, (_, before, url) => {
          return `${before}${cdnBaseURL}/${url.replace(/^\.\//, "")}`
      });
    },
  );
}
