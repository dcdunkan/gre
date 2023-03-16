/** @jsx h */
import "https://deno.land/std@0.179.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.179.0/http/server.ts";
import { format as byte } from "https://deno.land/std@0.179.0/fmt/bytes.ts";
import html, { h, JSX } from "https://deno.land/x/htm@0.1.4/mod.ts";
import ColorScheme from "https://deno.land/x/htm@0.1.4/plugins/color-scheme.ts";
import { HomePage, RepoPage, UserPage } from "./pages.tsx";
import type { Directory, Owner, Repository, TreeResponse } from "./types.ts";

const STYLES = await Deno.readTextFile("./styles.css");
const ENV = Deno.env.toObject() as { PAT: string };
const API_ROOT = "https://api.github.com";
const RAW_ROOT = "https://raw.githubusercontent.com";

html.use(ColorScheme("dark"));
html.use((ctx) => {
  ctx.styles = [STYLES, ...(ctx.styles ?? [])];
  ctx.links = [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com" },
    {
      href: "https://fonts.googleapis.com/css2?family=Inconsolata&display=swap",
      rel: "stylesheet",
    },
    ...(ctx.links) ?? [],
  ];
});

const NOT_FOUND_PAGE = html({
  title: "Not found",
  body: (
    <div style="display: flex;justify-content: center;align-items: center">
      <h2>404: NOT FOUND</h2>
    </div>
  ),
  status: 404,
});

serve(handler, {
  onError: (err) => {
    console.error(err);
    return new Response("Internal Server Error", { status: 500 });
  },
});

async function handler(req: Request): Promise<Response> {
  const { origin } = new URL(req.url);
  const url = req.url.endsWith("/") ? req.url.slice(0, -1) : req.url;
  const qIndex = url.indexOf("?") === -1 ? undefined : url.indexOf("?");
  const [
    owner,
    repo,
    ...pathSegments // branch/path/file.ext
  ] = url.slice(origin.length, qIndex).split("/").slice(1);

  if (owner === undefined && repo === undefined) {
    return html({
      lang: "en",
      title: "GitHub Raw Explorer",
      body: HomePage(),
    });
  }

  if (owner && repo === undefined) {
    const { searchParams } = new URL(req.url);
    let page = Number(searchParams.get("page"));
    if (isNaN(page) || page <= 0) page = 1;
    const user = await request<Owner>(`GET /users/${owner}`);
    if (user === undefined) return NOT_FOUND_PAGE;
    const repoQuery =
      `GET /users/${owner}/repos?type=owner&page=${page}&per_page=100&sort=pushed`;
    const repos = await request<Repository[]>(repoQuery);
    if (repos === undefined) return NOT_FOUND_PAGE;

    const hasPrev = page !== 1;
    const hasNext = user.public_repos > ((page - 1) * 100 + repos.length);

    const readme = (await getREADME(
      `${owner}/${user.type === "Organization" ? ".github" : owner}`,
      user.type === "User" ? "" : "/profile",
    ) ?? "").trim().replace(/<svg class="octicon(.+)<\/svg>/gm, "");

    return html({
      title: `${user.login}`,
      body: UserPage({ readme, hasPrev, hasNext, repos, user, page }),
    });
  }

  const repoName = `${owner}/${repo}`;
  const filepathWithBranch = pathSegments.join("/");

  // Return the raw content if the file exists.
  const raw = await getRaw(`${repoName}/${filepathWithBranch}`);
  if (raw.ok && raw.status === 200) return raw;

  const branches = await getBranches(repoName);
  const { branch /* filepath */ } = parsePath(filepathWithBranch, branches);

  // Redirect to the default branch, if no branch is provided.
  if (branch === undefined) {
    const res = await request<{
      default_branch: string;
    }>(`GET /repos/${repoName}`);
    if (res === undefined) return NOT_FOUND_PAGE;
    return Response.redirect(`${origin}/${repoName}/${res.default_branch}`);
  }

  const repoDetails = await request<Repository>(`GET /repos/${repoName}`);
  if (repoDetails === undefined) return NOT_FOUND_PAGE;

  // TODO: if (filepath === undefined)
  const query = `GET /repos/${repoName}/git/trees/${branch}?recursive=true`;
  const res = await request<TreeResponse>(query);
  if (res === undefined) return NOT_FOUND_PAGE;

  const files = res.tree.filter(({ type }) => type === "blob");
  const directory: Directory = {};
  for (const file of files) {
    const parts = file.path.split("/");
    transformTree(directory, parts, file.size);
  }
  const treeList = treeToHTMLTree(directory, `/${repoName}/${branch}`);
  const readme = (await getREADME(repoName, "", branch) ?? "")
    .trim().replace(/<svg class="octicon(.+)<\/svg>/gm, ""); // They are no necessary.

  return html({
    title: `${repoDetails.owner.login} @ ${branch}`,
    body: RepoPage({ treeList, branch, repo: repoDetails, readme, branches }),
  });

  /* const files = await request<{
  type: "dir" | "symlink" | "submodule";
  }[]>(`GET /repos/${repoName}/contents${filepath ? `/${filepath}` : ""}`); */
}

function treeToHTMLTree(tree: Directory, parentLink = "") {
  const elements: JSX.Element[] = [];
  const files = Object.entries(tree);
  for (const [filename, sizeOrSubtree] of files) {
    const type = typeof sizeOrSubtree === "number" ? "file" : "directory";
    const link = `${parentLink}/${filename}`;
    if (type === "file") {
      const size = byte(sizeOrSubtree as number);
      elements.push(
        <li>
          <a class="no-color-link" href={link}>
            {filename} <span style="color: #505050">({size})</span>
          </a>
        </li>,
      );
    } else {
      const subtree = sizeOrSubtree as Directory;
      const subtreeHTMLString = treeToHTMLTree(subtree, link);
      elements.push(
        <li>
          <details>
            <summary>
              <b>{filename}/</b>
            </summary>
            {subtreeHTMLString}
          </details>
        </li>,
      );
    }
  }
  return <ul type="none" class="file-list">{elements}</ul>;
}

function transformTree(tree: Directory, segments: string[], size: number) {
  if (!segments.length) return tree;
  const subDirectory = (tree[segments[0]] ?? {}) as Directory;
  const subTree = transformTree(subDirectory, segments.slice(1), size);
  tree[segments[0]] = segments.length === 1 ? size : subTree;
  return tree;
}

function parsePath(path: string, branches: string[]) {
  let segments: string[] = [];
  const sortedBranches = branches.sort((b0, b1) => b0.localeCompare(b1));
  for (const branch of sortedBranches) {
    const bSegs = branch.split("/");
    const pSegs = path.split("/");
    const currentSegs: string[] = [];
    for (let i = 0; i < bSegs.length; i++) {
      if (bSegs[i] !== pSegs[i]) continue;
      currentSegs.push(bSegs[i]);
    }
    if (bSegs.length === currentSegs.length) segments = currentSegs;
  }
  const branch = segments.length > 0 ? segments.join("/") : undefined;
  const filepath = path.slice(branch ? branch.length + 1 : 0);
  return { branch, filepath };
}

function getRaw(query: string) {
  return fetch(`${RAW_ROOT}/${query}`);
}

function getREADME(repo: string, dir = "", branch?: string) {
  const query = `GET /repos/${repo}/readme${dir}${
    branch ? `?ref=${branch}` : ""
  }`;
  return request<string>(query, { mediaType: "application/vnd.github.html" });
}

async function getBranches(repo: string) {
  let page = 1, continueFetching = true;
  const branchNames: string[] = [];
  do {
    const query = `GET /repos/${repo}/branches?per_page=100&page=${page++}`;
    const branches = await request<Array<{ name: string }>>(query) ?? [];
    branchNames.push(...branches.map((branch) => branch.name));
    if (branches.length < 100) continueFetching = false;
  } while (continueFetching);
  return branchNames;
}

// Even tho currently only GET is called, it may change in future.
async function request<T>(query: string, options?: {
  mediaType?: string;
  payload?: unknown;
}) {
  const [method, ...path] = query.split(" ");
  const url = API_ROOT + path.join(" ");
  const response = await fetch(url, {
    method: method,
    headers: {
      "Accept": options?.mediaType ?? "application/vnd.github+json",
      "Authorization": `Bearer ${ENV.PAT}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(options?.payload ? { body: JSON.stringify(options.payload) } : {}),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(response.statusText);
  return (options?.mediaType === "application/vnd.github.html"
    ? response.text() // had to. string!!
    : response.json()) as T;
}
