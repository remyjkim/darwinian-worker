(.id | tostring) == $runId and
.id == 37105684003 and
.run_attempt == 1 and
.path == ".github/workflows/release.yml" and
.event == "push" and
.head_branch == "v1.4.2" and
.head_sha == $commit and
.conclusion == "failure"
