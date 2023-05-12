/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h, JSX } from "https://deno.land/x/htm@0.1.4/mod.ts";
import type { Owner, Repository } from "./types.ts";

export function HomePage() {
  return (
    <main>
      <h1>Hello there.</h1>
      <p>
        Change <b>github.com</b> to <b>gre.deno.dev</b>{" "}
        in the URL of a GitHub repository, and enjoy the simplicity.
      </p>
      <p>
        Hey, why don't you check out the{" "}
        <a href="https://gre.deno.dev/dcdunkan/gre">
          source of this website
        </a>{" "}
        for a demonstration.
      </p>

      <h2>But Why?</h2>
      <p>
        GitHub's website is becoming laggier these days, at least for me. I
        still use GitHub, but the website is a little bloated to browse code.
      </p>
      <p>
        So, why not have a simple GitHub? Just to browse the code?
      </p>
      <p>Consider starring the repository if you found this useful.</p>
      <p>Thank you :)</p>
    </main>
  );
}

const { format: fmtNo } = Intl.NumberFormat("en", { notation: "compact" });

export function UserPage(
  { user, repos, hasNext, hasPrev, readme, page }: {
    user: Owner;
    repos: Repository[];
    readme?: string;
    hasNext: boolean;
    hasPrev: boolean;
    page: number;
  },
) {
  return (
    <main>
      <div style="height: 40%">
        <img
          src={user.avatar_url}
          style="border-radius: 50%"
          width="50px"
        />
        {user.name
          ? (
            <div>
              <h1>{user.name}</h1>
              <h3>{user.login}</h3>
            </div>
          )
          : <h1>{user.login}</h1>}
      </div>
      {user.bio ? <p>{user.bio}</p> : <></>}

      {readme
        ? (
          <details open>
            <summary>README.md</summary>
            <div dangerouslySetInnerHTML={{ __html: readme }}>
            </div>
          </details>
        )
        : <></>}

      {user.public_repos > 0
        ? (
          <div>
            <h3>Repositories ({user.public_repos})</h3>
            <div style="padding-bottom: 10px">
              {hasPrev
                ? (
                  <a
                    class="no-color-link"
                    href={`/${user.login}?page=${page - 1}`}
                  >
                    Previous
                  </a>
                )
                : <></>}
              {hasPrev && hasNext ? <span>{" | "}</span> : <></>}
              {hasNext
                ? (
                  <a
                    class="no-color-link"
                    href={`/${user.login}?page=${page + 1}`}
                  >
                    Next
                  </a>
                )
                : <></>}
            </div>
            {...repos.map((repo) => {
              return (
                <div class="repo">
                  <a
                    class="no-color-link"
                    href={`/${repo.full_name}/${repo.default_branch}`}
                  >
                    <h3>{repo.name} {repo.fork ? "(Fork)" : <></>}</h3>
                  </a>
                  {repo.description ? <p>{repo.description}</p> : <></>}
                  <p>
                    {fmtNo(repo.stargazers_count)} stars |{" "}
                    {fmtNo(repo.forks_count)}{" "}
                    forks{repo.language ? ` | ${repo.language}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )
        : <h2>{user.login} has no public repositories, yet.</h2>}
    </main>
  );
}

export function RepoPage(
  { readme, repo, branches, branch, treeList }: {
    repo: Repository;
    branch: string;
    treeList: JSX.Element;
    readme?: string;
    branches: string[];
  },
) {
  return (
    <main>
      <b>
        <a class="no-color-link" href={`/${repo.owner.login}`}>
          {repo.owner.login}
        </a>/
      </b>
      <h1>{repo.name}</h1>
      {repo.fork
        ? (
          <p>
            <i>
              Forked from{" "}
              <a
                href={`/${repo.parent?.full_name}/${repo.parent?.default_branch}`}
              >
                {repo.parent?.full_name}
              </a>
            </i>
          </p>
        )
        : <></>}
      {repo.description ? <p>{repo.description}</p> : <></>}
      <p>
        {fmtNo(repo.stargazers_count)} stars | {fmtNo(repo.forks_count)}{" "}
        forks{repo.language ? ` | ${repo.language}` : ""}
      </p>

      <p>
        On <b>{branch}</b> branch
      </p>
      <details>
        <summary>Branches</summary>
        <ul style="padding-left: 25px;">
          {...branches.map((branch) => {
            return (
              <a
                class="no-color-link"
                href={`/${repo.owner.login}/${repo.name}/${branch}`}
              >
                <li>{branch}</li>
              </a>
            );
          })}
        </ul>
      </details>
      <details open>
        <summary>Browse Code</summary>
        {treeList}
      </details>

      {readme
        ? (
          <details open>
            <summary>README.md</summary>
            <div dangerouslySetInnerHTML={{ __html: readme }}>
            </div>
          </details>
        )
        : <></>}
    </main>
  );
}
