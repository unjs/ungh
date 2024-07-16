const HTML_LINK_RE = /(<img.*?src="(?<url2>.*?)".*?>)/g;
const MARKDOWN_LINK_RE = /(?<link>\[.*?]\((?<url>.*?)\))/g;

/**
 * Creates a string replacement function, prefixing matched strings with `baseURL`
 */
function createReplacerFn(baseURL: string) {
  return (match, _, url: string | undefined, url2: string) => {
    const path = url || url2;
    // If path is already a URL, return the match
    if (path.startsWith("http") || path.startsWith("https")) {
      return match;
    }
    return match.replace(path, `${baseURL}/${path.replace(/^\.\//, "")}`);
  };
}

/**
 * HTML & Mardown Function to replace relative paths with absolute paths
 * - prefixes relative image paths with `cdnBaseURL`
 * - prefixes relative markdown paths with `ghBaseURL`
 */
export function resolveMarkdownRelativeLinks(
  content: string,
  options: { cdnBaseURL: string; githubBaseURL: string },
) {
  return content
    .replace(HTML_LINK_RE, createReplacerFn(options.cdnBaseURL))
    .replace(MARKDOWN_LINK_RE, createReplacerFn(options.githubBaseURL));
}
