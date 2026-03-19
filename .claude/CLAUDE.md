# Claude Code Configuration

## settings.json

Shared Claude Code settings for this repository. These settings are committed to version control and apply to all users of Claude Code in this repository.

### Permissions

The `permissions.allow` array contains pre-approved Bash commands that Claude Code can execute without requiring user permission each time.

**Maintenance requirements:**

- Keep the array **sorted alphabetically** for easy scanning and maintenance
- **Only include non-destructive commands** in the shared `settings.json` file
  - Read-only operations (e.g., `view`, `list`, `diff`, `fetch`)
  - Safe utility commands (e.g., `check-ignore`, `status`)
  - Commands that don't modify code, data, or repository state
- **Destructive commands should NEVER be in settings.json**
  - Commands that modify files, history, or repository state
  - Force operations (e.g., `push --force`, `reset --hard`)
  - Delete operations (e.g., `rm`, `branch -D`)
  - If you need pre-approved destructive commands, add them to your **personal** `settings.local.json` file only
- Use glob patterns (`*`) for operations that accept variable arguments

See [settings.json](settings.json) for the current list of approved commands.

### settings.json vs settings.local.json

- **settings.json** - Shared settings committed to the repository
- **settings.local.json** - Machine-specific settings (ignored by global gitignore, never committed)

Local settings override shared settings, allowing individual users to customize their experience while maintaining common defaults.

## MCP Configuration

- `.mcp.json` (repo root) — project-scoped MCP servers, committed to the repository and shared with all collaborators including cloud environments
  - Currently configures the GitHub remote MCP via `https://api.githubcopilot.com/mcp`
  - Requires a `GITHUB_PAT` environment variable with the following scopes: `repo`, `read:org`, `read:packages`, `notifications`, `security_events`, `gist`, `project`
