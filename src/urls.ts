export const APP_PREFIX = "bapplite/#app";

export function bareId(id: string, prefix: string): string {
  const value = String(id).trim();
  return value.startsWith(`${prefix}-`) ? value.slice(prefix.length + 1) : value;
}

export interface Location {
  projectId: string;
  todolistId?: string;
  taskId?: string;
}

export function appPath(location: Location): string {
  const parts = [`${APP_PREFIX}/todos`, `project-${bareId(location.projectId, "project")}`];
  if (location.todolistId) {
    parts.push(`list-${bareId(location.todolistId, "list")}`);
  }
  if (location.taskId) {
    parts.push(`task-${bareId(location.taskId, "task")}`);
  }
  return parts.join("/");
}

export function parseAppUrl(url: string): (Location & { host: string }) | undefined {
  const match = /^https?:\/\/([^/]+)\/bapplite\/#app\/todos\/project-([^/?#]+)(?:\/list-([^/?#]+))?(?:\/task-([^/?#]+))?/.exec(
    url.trim(),
  );
  if (!match) {
    return undefined;
  }
  const [, host, projectId, todolistId, taskId] = match;
  return {
    host: host.toLowerCase(),
    projectId,
    ...(todolistId ? { todolistId } : {}),
    ...(taskId ? { taskId } : {}),
  };
}
