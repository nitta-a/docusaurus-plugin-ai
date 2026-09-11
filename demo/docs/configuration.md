---
sidebar_position: 2
title: Configuration
---

# Configuration

Add the plugin to `docusaurus.config.mjs` and point `docsDir` at the directory
containing your Markdown or MDX files. The default AI page is available at
`/ai`, and the route can be changed with `routePath`.

The plugin does not require an API key for indexing. Replace the local provider
with an implementation of the `LLMProvider` interface when connecting a real AI
service, or compose an `AIRetriever` and `LLMProvider` with `createRAGProvider`.
