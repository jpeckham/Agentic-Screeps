# CI/CD Harness

Git is the only source of truth. Every push is a deployment gate: after checks pass for a pushed commit, GitHub Actions deploys the verified artifact to Screeps branch `default`.

Pull requests run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage`, `npm run build`, and release manifest verification. The PR workflow has no Screeps token and uses read-only repository permissions.

CI/CD builds once on pull requests, every push, or manual dispatch. Pull requests build/test only. Pushes and manual dispatch deploy the verified artifact to Screeps branch `default`. The artifact is `dist/`, containing Screeps JavaScript modules and `release-manifest.json`. Release names use `release-<short-git-sha>`.

The CI/CD workflow verifies hashes, uploads the artifact to Screeps branch `default`, reads it back when supported, and fails closed if remote verification fails.

Third-party actions currently use version tags (`actions/checkout@v4`, `actions/setup-node@v4`, artifact actions `@v4`) rather than immutable commit SHAs. Pin them to organization-approved SHAs if your repository policy requires full supply-chain immutability.
