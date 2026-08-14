import { escapeHtml, firstLine } from "../html.js";
import { t } from "../locales/index.js";
import type { CalendarEvent, Chat, ChatMessage } from "./graph.js";

export interface ChatRow {
  id: string;
  title: string;
  subtitle: string;
  when: string;
  favorite: boolean;
  group: boolean;
}

export function chatTitle(chat: Chat, myId?: string): string {
  const topic = chat.topic?.trim();
  if (topic) {
    return topic;
  }
  const others = (chat.members ?? [])
    .filter((member) => !myId || member.userId !== myId)
    .map((member) => member.displayName?.trim())
    .filter((name): name is string => Boolean(name));
  if (others.length === 0) {
    return t.teams.emptyChat;
  }
  if (others.length <= 3) {
    return others.join(", ");
  }
  return t.teams.andOthers(others.slice(0, 2).join(", "), others.length - 2);
}

export function chatPreview(chat: Chat): string {
  return firstLine(chat.lastMessagePreview?.body?.content ?? "");
}

export function chatMoment(chat: Chat): string {
  return chat.lastMessagePreview?.createdDateTime ?? chat.lastUpdatedDateTime ?? "";
}

export function toRows(chats: Chat[], favorites: string[], myId?: string): ChatRow[] {
  const starred = new Set(favorites);
  return chats
    .map((chat) => ({
      id: chat.id,
      title: chatTitle(chat, myId),
      subtitle: chatPreview(chat),
      when: chatMoment(chat),
      favorite: starred.has(chat.id),
      group: chat.chatType === "group" || chat.chatType === "meeting",
    }))
    .sort((left, right) => {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1;
      }
      return right.when.localeCompare(left.when);
    });
}

export function authorOf(message: ChatMessage): string {
  return (
    message.from?.user?.displayName ??
    message.from?.application?.displayName ??
    t.teams.systemMessage
  );
}

export function isVisible(message: ChatMessage): boolean {
  if (message.deletedDateTime) {
    return false;
  }
  if (message.messageType && message.messageType !== "message") {
    return false;
  }
  return Boolean(message.body?.content?.trim());
}

export function inOrder(messages: ChatMessage[]): ChatMessage[] {
  return [...messages]
    .filter(isVisible)
    .sort((left, right) =>
      String(left.createdDateTime ?? "").localeCompare(String(right.createdDateTime ?? "")),
    );
}

export function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function meetingWhen(event: CalendarEvent): string {
  const start = event.start?.dateTime;
  if (!start) {
    return "";
  }
  const end = event.end?.dateTime;
  return end ? `${clock(start)} - ${clock(end)}` : clock(start);
}

function clock(value: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}
