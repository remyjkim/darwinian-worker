---
sidebar_position: 1
---

# The Layered Model

Darwinian Harness composes effective harness state from five layers, then materializes it into downstream agent tools. The layers compose deterministically; later layers override earlier ones.

```mermaid
flowchart TB
    A[Built-in Harness Source] --> B[Machine Overlay<br/>~/.agents/drwn/machine.json]
    B --> C[Project Overlay<br/>&lt;project&gt;/.agents/drwn/config.json]
    C --> D[Curated Layer<br/>~/.agents/skills]
    D --> E[Effective Harness State]
    E --> F[Downstream: ~/.claude, ~/.codex, ~/.cursor]
```

> **Coming soon.** This page is part of the planned IA. The diagram above is the canonical mental model; full prose follows.
