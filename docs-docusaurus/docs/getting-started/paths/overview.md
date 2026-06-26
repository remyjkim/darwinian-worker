---
sidebar_position: 1
---

# Overview

There are four ways people typically arrive at `drwn`. Each has a dedicated page with prerequisites, steps, and verification. Pick the one that matches what you are trying to do.

## Use a Team's Harness

You joined a project or a team that already publishes a mind card and you want to consume it. The card encodes which skills, MCP servers, and extensions the team has agreed on; you install it into the project and let `drwn write` materialize the downstream state. This path is right for you when somebody else owns the harness intent and you just need to run it.

See [Use a Team's Harness](./use-team-harness).

## Set Up Your Machine

You are installing `drwn` for the first time on a personal machine and want a sensible baseline before any project-specific work. This path walks through the install, the initial inventory inspection, and how to add machine-wide defaults so that a fresh `drwn write` in any project starts from a known set of skills and MCP servers. This path is right for you when there is no team harness yet and you are setting up your own defaults.

See [Set Up Your Machine](./setup-your-machine).

## Override for One Project

Your machine defaults are fine for most work, but one project needs a different effective harness — maybe a different MCP server, an extension only that project should use, or a skill the rest of your machine should not have. This path walks through scaffolding a project overlay that suppresses the machine defaults inside that project and produces a project-scoped downstream state. This path is right for you when you want isolation without rewriting your machine.

See [Override for One Project](./override-one-project).

## Author and Publish a Card

You want to package a harness — yours or your team's — as a reusable, versioned card others can consume. This path covers creating a source, adding skills and MCP servers, setting metadata and quality signals, and publishing the card to the local store (and optionally a Git remote). This path is right for you when you are the one defining the harness intent for someone else.

See [Author and Publish a Card](./author-and-publish-card).
