---
sidebar_position: 3
title: Provider contract
---

# Provider contract

An AI provider receives an array of system, user, and assistant messages and
returns normalized answer text. The demo uses `createLocalAIProvider`, which
searches the generated local index deterministically. A production adapter can
call OpenAI, Azure OpenAI, Bedrock, or another service without changing the
Docusaurus-facing API.
