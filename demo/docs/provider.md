---
sidebar_position: 3
title: Provider contract
---

# Provider contract

An `LLMProvider` receives an array of system, user, and assistant messages and
returns normalized answer text. An `AIRetriever` independently returns
structure-preserving document chunks. Use `createRAGProvider` to compose the
two contracts and attach source citations to the response. The demo uses
`createLocalAIProvider`, which searches the generated local index
deterministically. A production adapter can call OpenAI, Azure OpenAI, Bedrock,
or another service without changing the Docusaurus-facing API.

If a provider exposes the optional `stream` method, `AIChat` renders text
deltas as they arrive and shows RAG sources immediately. Providers without
`stream` continue to use the normal `generate` path.
