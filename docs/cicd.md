# CI/CD Harness

Git is the only source of truth. `main` is the production gate: after checks pass and code reaches `main`, GitHub Actions deploys the verified artifact to Screeps branch `agentic`.

Pull requests run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage`, `npm run build`, and release manifest verification. The PR workflow has no Screeps token and uses read-only repository permissions.

Auto deploy builds once on `main` or manual dispatch. The artifact is `dist/`, containing Screeps JavaScript modules and `release-manifest.json`. Release names use `release-<short-git-sha>`.

The auto deploy workflow verifies hashes, uploads the artifact to Screeps branch `agentic`, reads it back when supported, and fails closed if remote verification fails. The manual production deploy workflow remains available for exceptional artifact redeploys.

Third-party actions currently use version tags (`actions/checkout@v4`, `actions/setup-node@v4`, artifact actions `@v4`) rather than immutable commit SHAs. Pin them to organization-approved SHAs if your repository policy requires full supply-chain immutability.
