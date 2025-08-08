# Nova Project Overview

Nova is a machine-native programming language designed for AI coding. Our goal is to provide a high-level specification for humans to express intent, which is compiled into a concise machine dialect that AI models can write, debug, and optimise efficiently.

## Vision

- Build a language that is machine-centric, not human-centric.
- Express programs as declarations: models, enums, properties, routes, transitions.
- Leverage capabilities with explicit effect declarations (e.g. `kv.get`, `http.post`).
- Provide built-in property checking, budgets, tracing, and self-optimisation.

## Current Status

- Repository scaffold created with `packages/compiler`, `packages/runtime-node`, and `packages/cli`.
- A minimal parser is implemented in `packages/compiler/index.js`.
- A CLI to parse `.nova` files is implemented in `packages/cli/nova.js`.
- A minimal runtime stub exists in `packages/runtime-node/index.js`.
- Example spec `examples/jobs.nova` demonstrates a Jobs API.
- A dictionary file at `spec/dictionary.json` defines tokens and capabilities.

## Roadmap

1. Expand the parser to support the full grammar, including budgets and property declarations.
2. Implement a type/effect checker and generate an intermediate representation (IR).
3. Build a runtime with effect handlers for key-value storage, HTTP, clock and crypto.
4. Implement property checking and enforcement of budget constraints.
5. Implement trace capture and replay for debugging and optimisation.
6. Implement an optimiser to propose safe rewrites when budgets fail (e.g. pagination, caching).
7. Provide code generation for host languages (e.g. Node.js and Python bindings).
8. Build developer tools: CLI commands for run, check, optimise; editor plugins.
9. Develop open-source specification and documentation.
10. Explore a hosted platform that compiles, deploys and auto-optimises Nova programs.

## Next Steps

- Integrate the dictionary into the compiler to validate tokens and effects.
- Design and implement the IR representation and backend to compile to the Node runtime.
- Flesh out the runtime stub to support `kv.scan` and `http.post`.
- Start building property and budget enforcement logic.
