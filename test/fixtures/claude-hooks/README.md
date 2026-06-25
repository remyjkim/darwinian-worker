# Claude hook payload smoke fixtures

Captured from real Claude Code 2.1.179 runs on 2026-06-23 using temporary
project hooks that tee stdin before forwarding to `drwn hook ...`.

The values are sanitized where they identify local paths, but field names and
event-specific shapes are preserved.

Note: a model-invoked unknown `Skill` produced an errored transcript
`tool_result`, but Claude did not emit `PreToolUse`, `PostToolUse`, or
`PostToolUseFailure` hooks for that unknown-skill path in this smoke run.
`PostToolUseFailure` shape is represented with a failing `Bash` tool payload.

