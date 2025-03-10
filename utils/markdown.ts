const HTML_LINK_RE = /(<img.*?src="(?<url>.*?)".*?>)/g;
const HTML_LINK_NESTED_RE = /src="(?<url>.*?)"/g;

const MARKDOWN_LINK_RE = /(\[.*?]\((?<url>.*?)\))/g;
const MARKDOWN_LINK_NESTED_RE = /\((?<url>.*?)\)/g;

function alreadyURL(path: string) {
  return path.startsWith("http");
}

/**
 * Creates a string replacement function, prefixing matched strings with `baseURL`
 *
 * @param nested - Optional regular expression used to match nested paths.
 */
function createReplacerFn(baseURL: string, nested?: RegExp) {
  function resolveAbsoluteURL(path: string) {
    return `${baseURL}/${path.replace(/^\.\//, "")}`;
  }

  return (match, path: string) => {
    // If path is already a URL, return the match
    if (alreadyURL(path)) {
      return match;
    }

    // Replace nested link if nested RE is provided (to handle edge-case `[./relative-link](./relative-link)`)
    if (nested) {
      return match.replace(nested, (m, path: string) => {
        // If path is already a URL, return the match
        if (alreadyURL(path)) {
          return m;
        }

        return m.replace(path, resolveAbsoluteURL(path));
      });
    }

    return match.replace(path, resolveAbsoluteURL(path));
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
    .replace(
      HTML_LINK_RE,
      createReplacerFn(options.cdnBaseURL, HTML_LINK_NESTED_RE),
    )
    .replace(
      MARKDOWN_LINK_RE,
      createReplacerFn(options.githubBaseURL, MARKDOWN_LINK_NESTED_RE),
    );
}
