# Workday for VS Code

Your ProofHub work and your Teams conversations in the editor, so tracking effort stops being a separate chore.

Two sides, each usable on its own:

- **ProofHub**: projects, tasks, subtasks, comments, timers and hours, with charts and per person comparison.
- **Teams**: chats, pinned conversations, today's meetings, live call state, and turning a finished call into logged hours.

## Install

```
npx vsce package --allow-missing-repository --skip-license
code --install-extension proofhub-0.1.0.vsix --force
```

It also runs in Cursor and other VS Code forks. Install the same `.vsix` through `Extensions: Install from VSIX`.

## ProofHub

### Connecting

ProofHub has no OAuth, so the API key is copied once per developer.

1. Run `ProofHub: Connect` and enter your account address, for example `yourcompany.proofhub.com`.
2. The browser opens on the API access page. Copy the key there.
3. VS Code watches the clipboard and connects on its own. If you would rather not use the clipboard, choose `I would rather paste the key`.

The key belongs to you, not to the team. It is validated on connection and stored in the VS Code secret vault, on this machine only, never in settings or in the repository. Every task, comment and time entry the extension creates is recorded under the owner of the key, which is why each developer connects with their own.

### What it does

- **Tree** of projects, todolists and tasks, with due date, assignees and subtask count.
- **Task panel** on the right sidebar: description, subtasks, comments and time entries, all editable in place. Subtasks open as their own view.
- **Alert cards** for work with no time logged, past due dates, exceeded estimates and unassigned tasks, each with the action that resolves it.
- **Timers**, one per task or subtask, running at the same time. Stopping a timer logs the hours in ProofHub.
- **Filters, sorting and search** over the tree, including filtering by assignee, plus `ProofHub: My tasks`.
- **Hours and charts**: totals per day, week and month against a daily goal, share by project and by person, and a stacked comparison of hours across people at day, week or month granularity.

## Teams

Read [docs/teams-setup.md](docs/teams-setup.md) for the sign-in and the local API. In short:

- **Chats** listed with pinned ones first, opened in a panel where you read the history and write back. Needs your own Azure application, because Microsoft does not preauthorize the chat scopes for the editor's built-in account.
- **Today's meetings** from the calendar, with a join button that opens Teams.
- **Live call state** in the status bar, showing elapsed time, mute and screen share.
- **Call to hours**: when a call ends, the extension offers to log it against one of your open ProofHub tasks.
- **Call history** under Calls in the Teams view, kept for seven days, with a badge counting the ones you have not logged yet.

Call tracking works without any Azure application. It prefers the Teams local API and falls back to reading the Teams window titles on macOS, which needs nothing but the Accessibility permission. Run `Workday: Track Teams Calls` to turn it on.

Joining a call inside the editor is not possible, and neither is setting your Teams status message. The reasons are in the setup document.

## Settings

| Setting                            | Default                | What it does                                                                      |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `proofhub.account`                 | empty                  | ProofHub account address. Asked on the first connection.                          |
| `proofhub.contactEmail`            | empty                  | Contact e-mail sent in the `User-Agent` header, required by the API.              |
| `proofhub.archivedProjects`        | `false`                | Include archived projects in the tree.                                            |
| `proofhub.apiPagePath`             | `bapplite/#app/me/api` | Path of the API access page opened by Connect.                                    |
| `proofhub.openOnRight`             | `true`                 | Move the panel to the right sidebar on first open.                                |
| `proofhub.syncOnFocus`             | `true`                 | Reload when the window regains focus.                                             |
| `proofhub.autoRefreshMinutes`      | `0`                    | Refresh the tree on a timer while the window has focus. Zero turns it off.        |
| `proofhub.cacheSeconds`            | `60`                   | How long the tree keeps data before asking again.                                 |
| `proofhub.dailyGoal`               | `8:00`                 | Reference line of the days chart.                                                 |
| `proofhub.teams.clientId`          | empty                  | Azure AD application id. Empty uses the built-in VS Code Microsoft account.       |
| `proofhub.teams.tenantId`          | empty                  | Tenant id or domain to pin the sign-in to.                                        |
| `proofhub.teams.localPort`         | `8124`                 | Port of the Teams third-party app API.                                            |
| `proofhub.teams.macPollSeconds`    | `10`                   | How often to check the Teams windows for a call, in seconds. macOS only.          |
| `proofhub.teams.callWindowPattern` | `""`                   | Regular expression matching a call window title. Empty uses the built-in pattern. |
| `proofhub.teams.roundMinutes`      | `5`                    | Rounding block for call time before logging.                                      |

## Language

The interface follows the VS Code display language. English and Brazilian Portuguese ship with the extension, in `src/locales` for runtime text and in `package.nls*.json` for command titles and settings. Any other language falls back to English.

## Notes on the APIs

ProofHub v3 is called with the `X-API-KEY` header and allows 25 requests every 10 seconds, so requests go through a sliding window limiter, the tree caches responses, and concurrent reads of the same node are deduplicated. Filtering and sorting run on cached data and never hit the network. Microsoft Graph goes through the same limiter and retry policy. Network failures, timeouts, 429 and 5xx are retried with backoff.

## Development

```
npm install
npm run check      # prettier, types and tests
npm run format     # prettier --write
```
