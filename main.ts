import { serve } from "https://deno.land/std@0.176.0/http/server.ts";
import { format as bytes } from "https://deno.land/std@0.176.0/fmt/bytes.ts";
import "https://deno.land/std@0.176.0/dotenv/load.ts";

const env = Deno.env.toObject() as { PAT?: string };

type Directory = Record<string, number | Subdirectory>
interface Subdirectory extends Directory {};

// Only required fields are specified.
interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
};
type TreeResponse = { tree: TreeEntry[] };

serve(resolve);

const cache = new Map<string, string>();

// Query: owner/repo@version/path/to/file.ext
async function resolve(req: Request) {
  const { hostname, pathname: query } = new URL(req.url);
  const [owner, repo, ...filepathSeg] = query.split("/").slice(1);
  if (!owner || !repo) {
    return new Response("Invalid query. Required parameters are empty", { status: 400 });
  }
  const id = `${owner}/${repo}`; // not actual id
  const filepath = filepathSeg.join("/");
  
  const rawRes = await rawResponse(`${id}/${filepath}`);
  if (rawRes.ok && rawRes.status === 200) return rawRes;
 
  const { default_branch } = await request<{ default_branch: string }>(id);
  const branchesRes = await request<{name: string}[]>(`${id}/branches`);
  const version = branchesRes.find((b) => filepath === b.name)?.name ?? default_branch;

  let tree: string;
  const cachedTree = cache.get(`${id}/${version}`);
  if (cachedTree !== undefined) {
    tree = cachedTree;
  } else {
    const files = await getTree(id, version);
    tree = [`<h3>${id} (${version})</h3>`, ...treeToString(files, `${id}/${version}`, {
      fileSize: true,
      fileCount: true,
    })].join("\n");
    cache.set(`${id}/${version}`, tree);
  }
  return new Response(
    `<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${id} @ ${version}</title>
<style> body { color: white; background-color: #202020; font-size: 16px; }
a:link {color: white;text-decoration: underline;text-decoration-color: #00FF7F;}
a:visited {color: white; text-decoration: none;}
a:hover {color: #00FF7F;text-decoration: underline;text-decoration-color: #00FF7F;}
.info {color: gray;}
</style></head>
<body><pre>${tree}</pre></body></html>`,
    { headers: { "content-type": "text/html" } },
  );
}

async function getTree(id: string, version: string) {
  let files: Directory = {};
  // Get fresh contents; fetch current file struct recursively.
  const queryString = `${id}/git/trees/${version}?recursive=true`;
  const { tree: contents } = await request<TreeResponse>(queryString);
  for (const content of contents) {
    if (content.type !== "blob") continue;
    const parts = content.path.split("/");
    addFileToTree(files, parts, content.size);
  }
  return files;
}

function addFileToTree(tree: Directory, pathSegments: string[], size: number) {
  if (pathSegments.length === 0) return tree;
  const segment = pathSegments[0];
  if (pathSegments.length === 1) {
    tree[segment] = size;
    return tree;
  }
  if (tree[segment] === undefined) tree[segment] = {};
  tree[segment] = addFileToTree(tree[segment] as Subdirectory, pathSegments.slice(1), size);
  return tree;
}

const DASH = "&#9473&#9473";
const BOX_LEFT_BOTTOM = `&#9495${DASH}`; // "└──";
const BOX_LEFT_MIDDLE = `&#9507${DASH}`; // "├──";
const BOX_BORDER_LEFT = "&#9475"; // "│";

interface StringTreeOptions {
  fileSize: boolean;
  fileCount: boolean;
}

function treeToString(directory: Directory, back: string, options?: Partial<StringTreeOptions>) {
  let lines: string[] = [];
  const entries = Object.entries(directory);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const filename = entry[0];
    const type = typeof entry[1] === "number" ? "file" : "dir";
    const isLast = i === (entries.length - 1);
    const sideChar = isLast ? BOX_LEFT_BOTTOM : BOX_LEFT_MIDDLE;
    let props = "";
    if (type === "file") {
      if(options?.fileSize === true) {
        props += ` (${bytes(entry[1] as number)})`;
      }
    } else {
      if (options?.fileCount === true) {
        const [f, d] = Object.values(entry[1] as Subdirectory)
          .reduce((p, c) => typeof c === "number" ? [p[0]+1, p[1]] : [p[0], p[1]+1], [0, 0])
        props += ` (${f > 0 ? `${f} file` : ""}${f > 0 && d > 0 ? ", " : ""}${d > 0 ? `${d} dir` : ""})`;
      }
    }
    const link = `${back}/${filename}`;
    const line = `${sideChar} ${type === "dir" ? "<b>" : `<a href="/${link}">`}${filename}${type === "dir" ? "</b>/" : "</a>"}<span class="info">${props}</span>`;
    lines.push(line);
    if (type === "dir") {
      const subdirTree = treeToString(entry[1] as Subdirectory, `${back}/${filename}`, options)
        .map((line) => `${isLast ? " " : BOX_BORDER_LEFT}   ${line}`)
      lines = lines.concat(subdirTree);
    }
  }
  return lines;
}

async function request<T = unknown>(path: string): Promise<T> {
  const url = `https://api.github.com/repos/${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      ...(env.PAT ? { "Authorization": `Bearer ${env.PAT}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error("Request failed to " + url);
  return await response.json() as T;
}

async function rawResponse(path: string) {
  const response = await fetch(`https://raw.githubusercontent.com/${path}`);
  return response.clone();
}
