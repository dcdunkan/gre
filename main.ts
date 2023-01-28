import { serve } from "https://deno.land/std@0.174.0/http/server.ts";
import { format as bytes } from "https://deno.land/std@0.174.0/fmt/bytes.ts";

type Directory = Record<string, number | Subdirectory>
interface Subdirectory extends Directory {};

// Only required fields are specified.
interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
};
type TreeResponse = { tree: TreeEntry[] };


serve(async (req) => {
  return await resolve(new URL(req.url).pathname ?? "");
});

const cache = new Map<string, string>();

// Query: owner/repo@version/path/to/file.ext
async function resolve(query: string) {
  const [owner, _repo, ...filepathSeg] = query.split("/").slice(1);
  if (!owner || !_repo) {
    return new Response("Invalid query. Required parameters are empty", { status: 400 });
  }
  let [repo, version] = _repo.split("@", 1);
  const id = `${owner}/${repo}`; // not actual id
  const filepath = filepathSeg.join("/");

  if (!version) {
    const { default_branch } = await request(`${id}`);
    version = default_branch;
    return Response.redirect(`/${id}@${default_branch}`);
  }

  if (filepath && filepath !== "") {
    // Return raw file content if html wasn't requested or return
    // syntax highlighted (using deno_shiki) HTML for browser.
    return await rawResponse(`${owner}/${repo}/${version}/${filepath}`);
  }

  let tree: string;
  const cachedTree = cache.get(`${id}@${version}`);
  if (cachedTree !== undefined) {
    tree = cachedTree;
  } else {
    const files = await getTree(id, version);
    tree = [`${id} (${version})`, ...treeToString(files, `https://raw.githubusercontent.com/${id}/${version}`, {
      fileSize: true,
      fileCount: true,
    })].join("\n");
    cache.set(`${id}@${version}`, tree);
  }
  return new Response(
    `<html><head><title>${id} @ ${version}</title></head><body>${tree}</body></html>`,
    { headers: { "content-type": "text/html" } },
  );
}

async function getTree(id: string, version: string) {
  let files: Directory = {};
  // Get fresh contents; fetch current file struct recursively.
  const queryString = `${id}/git/trees/${version}?recursive=true`
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

const BOX_LEFT_BOTTOM = "└──";
const BOX_LEFT_MIDDLE = "├──";
const BOX_BORDER_LEFT = "│";

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
    const line = `${sideChar} ${type === "dir" ? "<b>" : `<a href="/${link}">`}${filename}${type === "dir" ? "</b>/" : "</a>"}${props}`;
    lines.push(line);
    if (type === "dir") {
      const subdirTree = treeToString(entry[1] as Subdirectory, `${back}/${filename}`, options)
        .map((line) => `${isLast ? " " : BOX_BORDER_LEFT}   ${line}`)
      lines = lines.concat(subdirTree);
    }
  }
  return lines;
}

async function request<T = any>(path: string): Promise<T> {
  const url = `https://api.github.com/repos/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed");
  return await response.json() as T;
}

async function rawResponse(path: string) {
  const response = await fetch(`https://raw.githubusercontent.com/${path}`);
  return response.clone();
}
