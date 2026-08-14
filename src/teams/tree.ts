import * as vscode from "vscode";
import { STATE_TEAMS_FAVORITES } from "../constants.js";
import { t } from "../locales/index.js";
import { formatWhen } from "../format.js";
import { formatDuration } from "../time.js";
import { meetingWhen, toRows, type ChatRow } from "./chats.js";
import { rangeOf, totalMinutes, type CallRecord } from "./call-log.js";
import type { CalendarEvent, GraphClient } from "./graph.js";

export type TeamsNode =
  | { kind: "call"; record: CallRecord }
  | { kind: "chat"; row: ChatRow }
  | { kind: "meeting"; event: CalendarEvent }
  | { kind: "group"; label: string; children: TeamsNode[] };

export class TeamsProvider implements vscode.TreeDataProvider<TeamsNode> {
  private readonly changed = new vscode.EventEmitter<TeamsNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private client: GraphClient | undefined;
  private myId: string | undefined;
  private cache: TeamsNode[] | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly calls: () => CallRecord[],
  ) {}

  setClient(client: GraphClient | undefined, myId?: string): void {
    this.client = client;
    this.myId = myId;
    this.refresh();
  }

  get connected(): boolean {
    return Boolean(this.client);
  }

  refresh(): void {
    this.cache = undefined;
    this.changed.fire(undefined);
  }

  get favorites(): string[] {
    return this.context.globalState.get<string[]>(STATE_TEAMS_FAVORITES) ?? [];
  }

  async toggleFavorite(chatId: string): Promise<void> {
    const current = this.favorites;
    const next = current.includes(chatId)
      ? current.filter((id) => id !== chatId)
      : [...current, chatId];
    await this.context.globalState.update(STATE_TEAMS_FAVORITES, next);
    this.refresh();
  }

  getTreeItem(node: TeamsNode): vscode.TreeItem {
    if (node.kind === "call") {
      const item = new vscode.TreeItem(
        node.record.title ?? t.teams.callWithoutName,
        vscode.TreeItemCollapsibleState.None,
      );
      const spent = formatDuration(node.record.endedAt - node.record.startedAt);
      item.description = `${rangeOf(node.record)} (${spent})`;
      item.iconPath = new vscode.ThemeIcon(
        node.record.loggedHours ? "pass-filled" : "circle-large-outline",
      );
      item.contextValue = node.record.loggedHours ? "teamsCallLogged" : "teamsCallPending";
      item.tooltip = new vscode.MarkdownString(
        node.record.loggedHours
          ? t.teams.callLogged(node.record.loggedHours, node.record.taskTitle ?? "")
          : t.teams.callPending,
      );
      item.command = node.record.loggedHours
        ? undefined
        : { command: "proofhub.teams.logCall", title: t.teams.callLog, arguments: [node] };
      return item;
    }
    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "teamsGroup";
      return item;
    }
    if (node.kind === "meeting") {
      const item = new vscode.TreeItem(
        node.event.subject ?? t.teams.meetings,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = meetingWhen(node.event);
      item.iconPath = new vscode.ThemeIcon("calendar");
      item.contextValue = node.event.onlineMeeting?.joinUrl ? "teamsMeetingJoin" : "teamsMeeting";
      item.command = node.event.onlineMeeting?.joinUrl
        ? {
            command: "proofhub.teams.joinMeeting",
            title: t.teams.join,
            arguments: [node],
          }
        : undefined;
      return item;
    }
    const item = new vscode.TreeItem(node.row.title, vscode.TreeItemCollapsibleState.None);
    item.description = node.row.subtitle;
    item.tooltip = new vscode.MarkdownString(
      `**${node.row.title}**\n\n${node.row.subtitle}\n\n${formatWhen(node.row.when)}`,
    );
    item.iconPath = new vscode.ThemeIcon(
      node.row.favorite ? "star-full" : node.row.group ? "organization" : "account",
    );
    item.contextValue = node.row.favorite ? "teamsChatFavorite" : "teamsChat";
    item.command = { command: "proofhub.teams.openChat", title: t.teams.chats, arguments: [node] };
    return item;
  }

  getChildren(node?: TeamsNode): vscode.ProviderResult<TeamsNode[]> {
    if (node) {
      return node.kind === "group" ? node.children : [];
    }
    if (!this.client) {
      return this.callGroups();
    }
    if (this.cache) {
      return this.cache;
    }
    return this.build(this.client);
  }

  private callGroups(): TeamsNode[] {
    const records = this.calls();
    if (records.length === 0) {
      return [];
    }
    return [
      {
        kind: "group",
        label: t.teams.callsGroup(formatDuration(totalMinutes(records) * 60_000)),
        children: records.map((record) => ({ kind: "call", record })),
      },
    ];
  }

  private async build(client: GraphClient): Promise<TeamsNode[]> {
    const [chats, meetings] = await Promise.all([
      client.chats().catch(() => []),
      this.todaysMeetings(client).catch(() => []),
    ]);
    const rows = toRows(chats, this.favorites, this.myId);
    const groups: TeamsNode[] = this.callGroups();
    if (meetings.length > 0) {
      groups.push({
        kind: "group",
        label: t.teams.meetings,
        children: meetings.map((event) => ({ kind: "meeting", event })),
      });
    }
    groups.push({
      kind: "group",
      label: t.teams.chats,
      children: rows.map((row) => ({ kind: "chat", row })),
    });
    this.cache = groups;
    return groups;
  }

  private async todaysMeetings(client: GraphClient): Promise<CalendarEvent[]> {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const events = await client.events(start.toISOString(), end.toISOString());
    return events.filter((event) => !event.isCancelled);
  }
}

export { meetingWhen };
