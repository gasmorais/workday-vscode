# Teams setup

The Teams side of the extension has two independent halves. Each one works without the other.

| Half            | What it gives you                               | What it needs                  |
| --------------- | ----------------------------------------------- | ------------------------------ |
| Microsoft Graph | Chats, messages, pinned chats, today's meetings | A Microsoft sign-in            |
| Teams local API | Live call state and call to hours               | Teams running on this computer |

## Microsoft Graph

### The built-in account does not work for chat

Leave `proofhub.teams.clientId` empty and the extension asks VS Code for a Microsoft session. Sign-in succeeds, then the token request fails with `AADSTS65002`:

```
Consent between first party application 'aebc6443-996d-45c2-90f0-388ff96faa56'
and first party resource '00000003-0000-0000-c000-000000000000' must be
configured via preauthorization
```

That client id is the VS Code application itself. Microsoft preauthorizes a fixed list of Graph scopes for it, and `Chat.Read` and `ChatMessage.Send` are not on that list. No tenant setting and no administrator can change this, because the approval belongs to the API owner, not to your directory. Registering your own application is the only way to read chats.

Call tracking does not go through Graph at all, so it works without any of this. See the Teams local API section.

### The explicit path

Register your own application. This is required for chats, meetings and presence.

1. Open the Azure portal, go to Microsoft Entra ID, App registrations, New registration.
2. Name it anything. Under supported account types, pick accounts in this organizational directory only.
3. Skip the redirect URI. Device code flow does not use one.
4. Open Authentication and turn on Allow public client flows.
5. Open API permissions, Add a permission, Microsoft Graph, Delegated permissions, and add:

   | Scope              | Why                                                                 |
   | ------------------ | ------------------------------------------------------------------- |
   | `User.Read`        | Identify who is signed in, so your own messages are marked as yours |
   | `Chat.Read`        | List chats and read their messages                                  |
   | `ChatMessage.Send` | Send a message from the panel                                       |
   | `Presence.Read`    | Show your own Teams availability                                    |
   | `Calendars.Read`   | List today's meetings and their join links                          |
   | `offline_access`   | Stay signed in without prompting every hour                         |

6. Grant consent. If the tenant requires an administrator, this is the step they approve.
7. Copy the application id into `proofhub.teams.clientId`. Set `proofhub.teams.tenantId` to the tenant id or domain if you want to pin it.
8. Run `ProofHub: Connect to Teams`. A device code is copied to the clipboard and the browser opens on the Microsoft sign-in page.

The refresh token is stored in the VS Code secret vault on this machine. `ProofHub: Disconnect from Teams` deletes it.

## Teams local API

This half needs no Azure application, no scopes and no administrator. It is the recommended path when Graph is out of reach.

Run `Workday: Track Teams Calls`. The setting survives restarts, so it is asked once.

The new Teams desktop client exposes a WebSocket on `127.0.0.1:8124` for third-party applications, the same one Stream Deck plugins use. The classic client does not.

1. In Teams, open Settings, Privacy, and turn on Third-party app API.
2. Restart Teams.
3. The first time the extension connects, Teams asks you to approve the pairing. Accept it. The pairing token is stored in the secret vault, so it is asked only once.

Change `proofhub.teams.localPort` if your client listens elsewhere.

Nothing about the call leaves your machine through this channel. The extension only learns whether you are in a meeting and whether the microphone, camera and screen share are on.

## macOS window watch

When the local API is unavailable, which happens when the tenant blocks third-party device pairing and the toggle is missing from Teams settings, the extension falls back to reading the Teams window titles through AppleScript. A window such as `Meeting compact view | Someone | Microsoft Teams` means a call is running, and the middle segment becomes the suggested description of the logged time.

This needs no Azure application, no tenant policy and no Teams setting. The first check asks for Accessibility permission: allow your editor under System Settings, Privacy and Security, Accessibility.

It reads window titles only, never message content. It cannot tell whether you are muted or sharing, and it notices the end of a call within `proofhub.teams.macPollSeconds`, ten seconds by default. If your Teams runs in a language whose call windows are named differently, set `proofhub.teams.callWindowPattern` to a regular expression that matches them.

Both sources feed the same tracker, so running them together is safe.

## Call to hours

Every finished call is written to a local history, kept for seven days and capped at two hundred entries. The Teams view lists them under Calls, newest first, with the time range, the duration and the meeting name. A hollow circle means the call is still waiting to be logged, a filled check means it is done and shows the hours and the task in the tooltip. The view badge counts what is still pending, so a dismissed notification is never a lost call.

Logging can start from three places: the notification when the call ends, a click on the call in the list, or the command, which asks which pending call to log. Discard removes a call from the history without logging it.

While a call runs, a status bar entry shows the elapsed time and whether you are muted or sharing. When the call ends, the extension asks whether to log it. Accepting opens the picker of your open ProofHub tasks, then the usual timesheet and description prompts.

Calls shorter than two minutes are ignored. The logged duration is rounded to the nearest `proofhub.teams.roundMinutes` block, five minutes by default, with a five minute floor.

## What is not possible

Joining or running a call inside VS Code. There is no audio or video stack in a webview and Graph does not let a third party join as you. Join buttons open Teams.

Embedding the Teams web app in a panel. `teams.microsoft.com` refuses to be framed and the webview content policy blocks it from the other side.

Setting your Teams status message. It requires the `Presence.ReadWrite` scope on a beta Graph endpoint that is not available to delegated third-party applications today.

Reading chats without an Azure application. The local API reports meeting state only, never messages, and it offers no way to send one. The Teams client keeps its message cache in an undocumented store inside a sandboxed container that changes shape between releases, so reading it directly is not something this extension does.
