# GitHub Actions Workflows

## Workflows

### Active Workflows

**biome.yml** — Runs `yarn biome ci ./` on PRs targeting `main`. Enforces linting and formatting via Biome.

**release.yml** — Runs on push to `main`. Bundles `src/index.ts` and all dependencies into a single minified file using `@vercel/ncc` and publishes it as `index.js` to a continuously updated `latest` GitHub Release tag.

**typecheck.yml** — Runs `yarn typecheck` (`tsc --noEmit`) on PRs targeting `main`. Enforces TypeScript type correctness.

**unit-tests.yml** — Runs `yarn test` (Vitest) on PRs targeting `main`. Enforces that all unit tests pass and that `src/lib/**` maintains 100% coverage.

## Composite Actions

### `.github/actions/setup`

Shared setup sequence used by all three workflows. Encapsulates: Node.js setup via `.nvmrc`, corepack enable, and `yarn install --immutable`.

**Important**: Local composite actions cannot self-checkout — the runner workspace must already contain the repo when GitHub resolves the action definition. Each calling workflow must run `actions/checkout` as its first step before `uses: ./.github/actions/setup`.

## Common Tasks

**Debug failures**: Check Actions tab logs for workflow execution details when workflows are added

## Workflow Formatting Conventions

**Step property ordering**: Always list job step properties in the same consistent order for readability and maintainability.

**Required order:**

1. `name` - Step name (always first)
2. `id` - Step identifier (if present)
3. `uses` - Action to use (if present, mutually exclusive with `run`)
4. `with` - Action inputs (if using `uses`)
5. `env` - Environment variables (if present)
6. `run` - Shell commands (always last, mutually exclusive with `uses`)

**Example:**

```yaml
- name: Fetch data
  id: fetch
  env:
    GH_TOKEN: ${{ secrets.TOKEN }}
  run: |
    echo "commands here"
```
