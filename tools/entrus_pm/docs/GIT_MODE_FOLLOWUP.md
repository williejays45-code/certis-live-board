# Git entry-mode follow-up — 0.1.2 candidate

This candidate descends from the merged 0.1.1 maintenance engine. Its prior fleet,
archive and type-change corrections remain accepted. The follow-up is PME-R04,
a P2 extension of the Git boundary finding, not a new production incident.

With core.symlinks=false, Git mode 120000 can be materialized as ordinary text.
The previous filesystem-only scan returned PASS for that index entry. A staged
gitlink (160000) can also be omitted by a worktree-only comparison. Both cases
were reproduced through the actual CI and CLI producers on the merged source.

Git-backed scans now validate index modes before reading content: only a single,
resolved 100644 or 100755 entry is allowed. Links, submodules, unresolved stages
and missing/unsupported entries return UNKNOWN, exit 2, with the fixed code
GIT_ENTRY_KIND_NOT_ALLOWED. No link target or credential is printed. Filesystem
link/junction checks remain in place for unstaged changes. The CLI combines index
and worktree changed paths; both producers retain the accepted ACMRT filter.

The explicit-path scan API remains a filesystem inspection API. Git callers must
use git_scan. No scanner claim is made for full DLP or evidence authentication.

Four new Git-to-runner tests cover recorded link mode, conversion back to a normal
file, a secret-bearing conversion, and gitlink rejection. Existing physical-link
tests remain unchanged except for their more specific diagnostic code. A host
without link-creation permission reports those as skipped, not passed; Linux CI
must execute them. No original source package or acceptance ledger is rewritten.

This patch changes development/CI source only. Protected deployment installation,
runtime collectors, credentials, billing, application behavior and Core's process
supervisor are outside this correction. Coordinate production settings separately.
