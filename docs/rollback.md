# Rollback

Use rollback when the active release is defective and the previous branch is still compatible with current Memory schema.

1. Identify the current active branch from the deployment summary or Screeps UI.
2. Identify the previous known-good branch from `rollback-metadata-<branch>` artifacts or prior deployment summaries.
3. Dispatch `Production Rollback`.
4. Enter the explicit target branch and confirmation `ROLLBACK`.
5. Approve the protected production environment.
6. Verify the summary and Screeps UI show the target branch active.

The rollback workflow never guesses a target. If Memory schema compatibility blocks rollback, deploy a forward fix that can read both old and new schema forms, or use a maintenance release that migrates state safely.
