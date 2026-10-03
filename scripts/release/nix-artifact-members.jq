($canonical | length) == 1 and
.version == $canonical[0].version and
.sourceCommit == $canonical[0].sourceCommit and
.members == $canonical[0].members
