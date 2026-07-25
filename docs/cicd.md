# CI/CD Harness

Git is the only source of truth. Gameplay code moves through pull requests, release artifacts, and approved deployment workflows; production uploads must not be performed from a developer workstation.

Pull requests run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage`, `npm run build`, and release manifest verification. The PR workflow has no Screeps token and uses read-only repository permissions.

Release candidates build once on `main` or manual dispatch. The artifact is `dist/`, containing Screeps JavaScript modules and `release-manifest.json`. Release names use `release-<short-git-sha>`.

Production deploy downloads an existing artifact by workflow run and artifact name. It verifies hashes, uploads to an inactive branch, verifies the candidate, records the previous active branch, then activates only after the protected `screeps-production` environment approves the job.

Third-party actions currently use version tags (`actions/checkout@v4`, `actions/setup-node@v4`, artifact actions `@v4`) rather than immutable commit SHAs. Pin them to organization-approved SHAs if your repository policy requires full supply-chain immutability.
