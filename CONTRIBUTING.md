# Contributing to Invariant Governance

Thank you for your interest in contributing to Invariant Governance. This
document describes the process and guidelines for contributing to this project.

## Patent Notice

Invariant Governance implements patented technology covered by U.S. Patent
Application No. 19/533,191, PCT International Application No. PCT/US26/15432,
and related continuation applications. By contributing to this project, you
acknowledge that your contributions will be incorporated into patented
technology and licensed under the terms described below.

## Contributor License Agreement (CLA)

All contributors must sign a Contributor License Agreement before their
contributions can be merged. The CLA ensures that:

1. You have the right to grant the contribution under the Apache License 2.0.
2. You grant a patent license for any patent claims your contribution
   necessarily infringes.
3. Your contribution does not introduce third-party intellectual property
   without proper licensing.

The CLA will be presented automatically when you open your first pull request.
Contributions cannot be accepted until the CLA is signed.

## Reporting Issues

Use [GitHub Issues](https://github.com/utahbroker/invariant-governance/issues)
to report bugs, request features, or ask questions.

When reporting a bug, include:

- A clear description of the expected behavior and the actual behavior.
- Steps to reproduce the issue.
- The version of the SDK you are using.
- Relevant logs or error messages.
- Your runtime environment (Node.js version, operating system).

When requesting a feature, describe the use case and how it relates to the
governance architecture. Features that introduce probabilistic or
non-deterministic governance evaluation fall outside the project's design
principles.

## Submitting Pull Requests

1. **Fork the repository** and create a feature branch from `main`.
2. **Keep changes focused.** Each pull request should address a single concern.
   Large, multi-purpose PRs are difficult to review and will be asked to split.
3. **Write tests.** All contributions must include tests that verify both the
   intended behavior and the structural constraints. For example, if you modify
   the Execution Gate, include a test confirming it still cannot authorize
   itself.
4. **Update documentation** if your change affects public APIs, configuration,
   or architectural behavior.
5. **Run the full test suite** before submitting:
   ```bash
   npm test
   ```
6. **Open the pull request** against `main` with a clear description of:
   - What the change does and why.
   - How it was tested.
   - Any architectural considerations.

## Design Principles

Contributions must respect the following non-negotiable architectural
constraints:

- **Three-component separation.** The Governance Kernel, Execution Gate, and
  Telemetry Observer are structurally decoupled. Pull requests that allow any
  component to assume the role of another will not be merged.
- **Deterministic governance.** The governance layer uses deterministic
  evaluation, not probabilistic scoring, ML-based filtering, or confidence
  thresholds.
- **Sovereign Boundary integrity.** The boundary between the Authority Plane
  and Execution Plane cannot be weakened, bypassed, or made optional.
- **One-way telemetry.** The Telemetry Observer can observe but never intervene.
  Data flows in one direction only.

## Code Style

This project is written in TypeScript. Follow the existing patterns in the
codebase:

- Use TypeScript strict mode. All code must pass strict type checking.
- Prefer explicit types over `any`. Use `unknown` when the type is genuinely
  not known.
- Use `readonly` where appropriate to enforce immutability.
- Name files using kebab-case (e.g., `execution-gate.ts`).
- Name types and interfaces using PascalCase (e.g., `ApprovalReceipt`).
- Name functions and variables using camelCase (e.g., `validateReceipt`).
- Export types and interfaces from the module's `index.ts`.
- Write JSDoc comments for all public APIs.
- Keep functions focused and small. Prefer composition over inheritance.

Linting and formatting are enforced automatically. Run before committing:

```bash
npm run lint
npm run format
```

## Commit Messages

Use clear, descriptive commit messages:

- Start with a verb in imperative mood (e.g., "Add", "Fix", "Remove").
- Keep the first line under 72 characters.
- Reference issue numbers where applicable (e.g., "Fix #42").

## Review Process

All pull requests require review before merging. Reviewers will evaluate:

1. Correctness and adherence to the design principles above.
2. Test coverage, including negative tests for structural constraints.
3. Code quality and consistency with existing patterns.
4. Documentation completeness.

## License

By contributing to Invariant Governance, you agree that your contributions
will be licensed under the [Apache License 2.0](LICENSE). See the CLA
section above for details on the intellectual property grant.

## Questions

If you have questions about contributing, open a GitHub Issue or contact
the maintainers at invariant@holladaylabsip.com.
