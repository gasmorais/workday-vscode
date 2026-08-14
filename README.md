# ProofHub for VS Code

Browse and update ProofHub projects, tasks, comments and time without leaving the editor.

## Connecting

ProofHub has no OAuth, so the API key is copied once per developer.

1. Run `ProofHub: Connect` and enter your account address, for example `yourcompany.proofhub.com`. It is remembered in the `proofhub.account` setting.
2. The browser opens on the API access page. Copy the key there.
3. VS Code watches the clipboard and connects on its own. If you would rather not use the clipboard, choose `I would rather paste the key`.

The key belongs to you, not to the team. It is validated on connection and stored in the VS Code secret vault, on this machine only, never in settings or in the repository. Every task, comment and time entry the extension creates is recorded under the owner of the key, which is why each developer connects with their own.

## What it does

- **Tree** of projects, todolists and tasks, with due date, assignees and subtask count.
- **Task panel** on the right sidebar: description, subtasks, comments and time entries, all editable in place. Subtasks open as their own view.
- **Alert cards** for work with no time logged, past due dates, exceeded estimates and unassigned tasks, each with the action that resolves it.
- **Timers**, one per task or subtask, running at the same time. Stopping a timer logs the hours in ProofHub.
- **Filters, sorting and search** over the tree, plus `ProofHub: My tasks`.
- **Hours and charts** with per day, week and month totals against a daily goal.

## Settings

| Setting                     | Default                | What it does                                                         |
| --------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `proofhub.account`          | empty                  | Account address. Asked on the first connection.                      |
| `proofhub.contactEmail`     | empty                  | Contact e-mail sent in the `User-Agent` header, required by the API. |
| `proofhub.archivedProjects` | `false`                | Include archived projects in the tree.                               |
| `proofhub.apiPagePath`      | `bapplite/#app/me/api` | Path of the API access page opened by Connect.                       |
| `proofhub.openOnRight`      | `true`                 | Move the panel to the right sidebar on first open.                   |
| `proofhub.syncOnFocus`      | `true`                 | Reload when the window regains focus.                                |
| `proofhub.dailyGoal`        | `8:00`                 | Reference line of the days chart.                                    |

## Language

The interface follows the VS Code display language. English and Brazilian Portuguese ship with the extension, in `src/locales` for runtime text and in `package.nls*.json` for command titles and settings. Any other language falls back to English.

## API notes

The extension talks to the ProofHub API v3 with the `X-API-KEY` header. The API allows 25 requests every 10 seconds, so requests go through a sliding-window limiter, the tree caches responses for a minute, and concurrent reads of the same node are deduplicated. Filtering and sorting run on cached data and never hit the network.

## Development

```
npm install
npm run check      # prettier, types and tests
npm run format     # prettier --write
npx vsce package --allow-missing-repository --skip-license
code --install-extension proofhub-0.1.0.vsix --force
```
