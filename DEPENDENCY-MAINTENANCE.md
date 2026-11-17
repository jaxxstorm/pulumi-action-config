# Dependency consolidation (2026-11-17)

This is a **partial security remediation**, not a clean security bill of health.
Both npm lockfiles are updated without changing the declared dependency ranges.
The lockfiles now use npm lockfile format 3; validation used Node 26.7.0 and npm
11.19.0. Older npm versions and the external `jk` executable were not validated.

## Covered Dependabot requests

| Package | Source PRs | Resolution in both lockfiles |
| --- | --- | --- |
| lodash | #4, #5 | 4.18.1 |
| hosted-git-info | #6, #7 | 2.8.9 |
| browserslist | #8, #9 | 4.29.5 |
| path-parse | #10, #11 | 1.0.7 |
| tmpl | #12, #13 | 1.0.5 |
| ajv | #14, #15 | 6.15.0 |
| minimist | #16, #17 | 1.2.8 |
| decode-uri-component | #19, #20 | Removed with its obsolete transitive parent |
| json5 | #21, #22 | 2.2.3 |

The committed nested `node_modules` tree is removed from Git and
ignored. It contained old dependencies independently of the lockfile. Recreate
it with `npm ci --prefix @jaxxstorm/pulumi-action-config`; do not vendor it again.
The generated `workflow.js` module has no runtime package dependencies and is
unchanged. No generated workflows, deployments, releases, or source PR states
are changed by this consolidation.

## Reproduce validation

From the repository root, with a modern Node supporting `node:test`:

```sh
npm ci --no-audit --no-fund
npm ci --prefix @jaxxstorm/pulumi-action-config --no-audit --no-fund
npm run build
npm run lint
./node_modules/.bin/eslint src/workflow.ts
node --test tests/dependencies.test.cjs
npm audit --json
npm audit --prefix @jaxxstorm/pulumi-action-config --json
npm audit --omit=dev --json
npm audit --prefix @jaxxstorm/pulumi-action-config --omit=dev --json
```

Clean installs (including lifecycle scripts), compilation, the legacy lint
command, explicit source lint, and all three regression tests pass. The same
regression fails against the original locks at ajv 6.12.2 in both trees. The
legacy TypeScript parser emits an existing unsupported-TypeScript warning.
The `.cjs` test is executed by Node, not covered by the legacy TypeScript lint
pattern. Repeated compilation produces the same SHA-256 as the base artifact:
`24c224665b58060d1b75ceeea0ba4da5583e16814a7f23ba03366a44c103066d`.

## Remaining blockers

Full npm audit still exits 1 in **each** tree: 22 affected package entries
(12 high, 8 moderate, 2 low), down from 45 (including 2 critical). These totals
include affected parent packages and are not counts of distinct advisories.
Production-only audits pass with zero findings; all declared dependencies are
development dependencies, so this does not excuse the development-tool risk.

Exact remaining advisory-bearing packages in both locks:

| Package/version | Advisory IDs |
| --- | --- |
| braces 2.3.2 | GHSA-grv7-fg5c-xmjg |
| flatted 2.0.2 | GHSA-25h7-pfq9-p65f; GHSA-rf6f-7fwh-wjgh |
| micromatch 3.1.10 | GHSA-952p-6rrq-rcjv |
| semver 5.5.0 (two nested TypeScript-ESLint paths) | GHSA-c2qf-rxjj-qqgw |
| tmp 0.0.33 | GHSA-52f5-9888-hmc6; GHSA-ph9p-34f9-6g65 |

The remaining parents include the legacy Babel/Jest and ESLint/TypeScript-ESLint
stacks. Their major upgrades or targeted overrides need separate compatibility
work; this change does not force incompatible versions merely to clear audit.
Keep the consolidation draft until these findings have an agreed remediation
and suitable CI validates the locked installations and regression tests. There
is no repository `.github/workflows` CI definition at the base commit. End-to-end
`jk generate` is not tested because `jk` is unavailable in the validation host.
