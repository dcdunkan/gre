/** @jsx h */
import { serve } from "https://deno.land/std@0.155.0/http/server.ts";
import { h, html } from "https://deno.land/x/htm@0.0.10/mod.tsx";
import { UnoCSS } from "https://deno.land/x/htm@0.0.10/plugins.ts";
import { format } from "https://deno.land/std@0.173.0/fmt/bytes.ts"
html.use(UnoCSS());

const cache: Record<string, any> = {};
const error = new Response("error");

const handler = async (req: Request) => {
  const [, owner, reponame, ...pathSegments] = new URL(req.url).pathname.split("/")
  const [repo, version] = reponame.split("@");
  let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${version}`);
  if (!res.ok) return error;
  const {sha} = JSON.parse(await res.json())[0];
  res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=true`);
  if (!res.ok) return error;
  const { tree } = JSON.parse(await res.json());
  const t: Record<string, number> = {};
  for (const entry of tree) {
    if (entry.type === "file") {
      t[entry.path] = entry.size;
    }
  }
  
  return html({
    title: "Home",
    body: (
      <div class="w-full font-mono">
        <h2><a href={`https://github.com/${owner}`}>{owner}</a>/<a href={`https://github.com/${owner}/${repo}`}>{repo}</a></h2>
        <hr>
        <pre>{
          for (const file in t) {
           <a href={`https://github.com/`}>{file}</a> ({format(t[file])}){"\n"}
          }
        }</pre>
      </div>
    ),
  });
};
        
        
        
serve(handler);

