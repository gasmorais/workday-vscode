# Teams setup

The Teams side of the extension has two independent halves. Each one works without the other.

| Half            | What it gives you                               | What it needs                  |
| --------------- | ----------------------------------------------- | ------------------------------ |
| Microsoft Graph | Chats, messages, pinned chats, today's meetings | A Microsoft sign-in            |
| Teams local API | Live call state and call to hours               | Teams running on this computer |

## Microsoft Graph

### The easy path

Leave `proofhub.teams.clientId` empty and run `ProofHub: Connect to Teams`. The extension asks VS Code for a Microsoft session and reuses the account you already signed in with. If your tenant allows the VS Code application to request the scopes below, this is all you need.

### The explicit path

If your tenant blocks the built-in application, register your own.

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

The new Teams desktop client exposes a WebSocket on `127.0.0.1:8124` for third-party applications, the same one Stream Deck plugins use. The classic client does not.

1. In Teams, open Settings, Privacy, and turn on Third-party app API.
2. Restart Teams.
3. The first time the extension connects, Teams asks you to approve the pairing. Accept it. The pairing token is stored in the secret vault, so it is asked only once.

Change `proofhub.teams.localPort` if your client listens elsewhere.

Nothing about the call leaves your machine through this channel. The extension only learns whether you are in a meeting and whether the microphone, camera and screen share are on.

## Call to hours

While a call runs, a status bar entry shows the elapsed time and whether you are muted or sharing. When the call ends, the extension asks whether to log it. Accepting opens the picker of your open ProofHub tasks, then the usual timesheet and description prompts.

Calls shorter than two minutes are ignored. The logged duration is rounded to the nearest `proofhub.teams.roundMinutes` block, five minutes by default, with a five minute floor.

## What is not possible

Joining or running a call inside VS Code. There is no audio or video stack in a webview and Graph does not let a third party join as you. Join buttons open Teams.

Embedding the Teams web app in a panel. `teams.microsoft.com` refuses to be framed and the webview content policy blocks it from the other side.

Setting your Teams status message. It requires the `Presence.ReadWrite` scope on a beta Graph endpoint that is not available to delegated third-party applications today.
