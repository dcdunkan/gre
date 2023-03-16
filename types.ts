export interface Directory {
  [name: string]: number | Directory;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
}

export interface TreeResponse {
  tree: TreeEntry[];
  truncated: boolean;
}

export interface Repository {
  name: string;
  full_name: string;
  description?: string;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  language?: string;
  owner: Owner;
  parent?: Repository;
}

export interface Owner {
  name: string;
  login: string;
  bio?: string;
  public_repos: number;
  avatar_url: string;
  type: "User" | "Organization";
}
