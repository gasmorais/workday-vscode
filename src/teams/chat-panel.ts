import * as vscode from "vscode";
import { page } from "../components/shell.js";
import { button, empty, form, list, section } from "../components/ui.js";
import { escapeHtml, richText } from "../html.js";
import { formatWhen } from "../format.js";
import { t } from "../locales/index.js";
import { CHAT_PAGE_SIZE } from "../constants.js";
import { authorOf, chatTitle, inOrder, toHtml } from "./chats.js";
import { GraphError, type Chat, type ChatMessage, type GraphClient } from "./graph.js";

export class ChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private chatId: string | undefined;
  private chat: Chat | undefined;
  private size = CHAT_PAGE_SIZE;

  constructor(
    private readonly client: () => GraphClient | undefined,
    private readonly myId: () => string | undefined,
  ) {}

  async open(chatId: string): Promise<void> {
    this.chatId = chatId;
    this.size = CHAT_PAGE_SIZE;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "proofhub.teams.chat",
        t.teams.chats,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.chatId = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message) => this.handle(message));
    }
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    await this.load();
  }

  private async load(): Promise<void> {
    const client = this.client();
    if (!client || !this.panel || !this.chatId) {
      return;
    }
    this.panel.webview.html = page(`<p class="empty">${t.common.loading}</p>`);
    try {
      const [chat, messages] = await Promise.all([
        client.chat(this.chatId),
        client.messages(this.chatId, this.size),
      ]);
      this.chat = chat;
      const title = chatTitle(chat, this.myId());
      this.panel.title = title;
      this.panel.webview.html = page(this.render(title, messages));
    } catch (error) {
      const reason = error instanceof GraphError ? error.message : String(error);
      this.panel.webview.html = page(
        `<p class="empty">${escapeHtml(reason)}</p><p class="actions">${button("refresh", t.common.tryAgain)}</p>`,
      );
    }
  }

  private render(title: string, messages: ChatMessage[]): string {
    const ordered = inOrder(messages);
    const rows = ordered.map((message) => {
      const mine = message.from?.user?.id === this.myId();
      return `<li class="${mine ? "mine" : ""}"><p class="who">${escapeHtml(
        authorOf(message),
      )}<span class="chip quiet">${escapeHtml(formatWhen(message.createdDateTime))}</span></p><div class="prose">${richText(
        message.body?.content,
      )}</div></li>`;
    });
    return [
      "<header>",
      `<h1>${escapeHtml(title)}</h1>`,
      `<p class="actions">${button("openInTeams", t.teams.openInTeams, { variant: "ghost" })}${button(
        "more",
        t.teams.loadMore,
        { variant: "ghost" },
      )}${button("refresh", t.detail.refresh, { variant: "ghost" })}</p>`,
      "</header>",
      section(
        t.teams.chats,
        rows.length > 0 ? String(rows.length) : undefined,
        (rows.length > 0 ? list("comments messages", rows) : empty(t.teams.noMessages)) +
          form(
            "send",
            `<textarea name="text" rows="3" placeholder="${escapeHtml(t.teams.write)}"></textarea>`,
            t.teams.send,
          ) +
          `<p class="hint">${escapeHtml(t.detail.sendHint)}</p>`,
      ),
    ].join("\n");
  }

  private async handle(message: { act?: string; value?: unknown }): Promise<void> {
    const client = this.client();
    if (!client || !this.chatId) {
      return;
    }
    const fields = (message.value ?? {}) as Record<string, string>;
    try {
      switch (message.act) {
        case "refresh":
          await this.load();
          return;
        case "more":
          this.size += CHAT_PAGE_SIZE;
          await this.load();
          return;
        case "openInTeams": {
          const url = this.chat?.webUrl;
          if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          }
          return;
        }
        case "send": {
          const text = fields.text?.trim();
          if (!text) {
            return;
          }
          await client.sendMessage(this.chatId, toHtml(text));
          await this.load();
          return;
        }
        default:
          return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof GraphError ? error.message : String(error));
    }
  }
}

export { toHtml };
