# Node.js and Yarn

Use Node.js 24 LTS and Yarn 4.13.0 as pinned in the repository. Enable Corepack, then install dependencies from the root:

```sh
corepack enable
yarn install --immutable
```

The workspaces declare their `tsx` dependencies; a global `tsx` installation is unnecessary. See [Development](Development.md) for the remaining prerequisites.
