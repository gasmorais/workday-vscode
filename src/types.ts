export type Id = string | number;

export interface Ref {
  id: Id;
  name?: string;
  title?: string;
}

export interface Person {
  id: Id;
  first_name?: string;
  last_name?: string;
  email?: string;
  title?: string;
  initials?: string;
  suspended?: boolean;
}

export interface Project {
  id: Id;
  title: string;
  description?: string;
  archived?: boolean;
  color?: string;
  assigned?: Id[];
}

export interface Todolist {
  id: Id;
  title: string;
  archived?: boolean;
  completed_count?: number;
  remaining_count?: number;
}

export interface Task {
  id: Id;
  title: string;
  description?: string;
  completed?: boolean;
  assigned?: Id[];
  labels?: Id[];
  due_date?: string | null;
  start_date?: string | null;
  estimated_hours?: number | null;
  estimated_mins?: number | null;
  logged_hours?: number | null;
  logged_mins?: number | null;
  percent_progress?: number;
  sub_tasks?: number;
  comments?: number;
  ticket?: string;
  by_me?: boolean;
  creator?: Ref;
  project?: Ref;
  list?: Ref;
  stage?: Ref;
  url?: string;
}

export type Subtask = Task;

export interface Comment {
  id: Id;
  description?: string;
  created_at?: string;
  by_me?: boolean;
  creator?: Ref;
  task?: Ref;
}

export interface Timesheet {
  id: Id;
  title: string;
  archived?: boolean;
  private?: boolean;
  logged_hours?: number | null;
  logged_mins?: number | null;
  estimated_hours?: number | null;
  estimated_mins?: number | null;
}

export interface TimeEntry {
  id: Id;
  description?: string | null;
  date?: string;
  created_at?: string;
  logged_hours?: number | null;
  logged_mins?: number | null;
  status?: string;
  timer?: boolean;
  by_me?: boolean;
  creator?: Ref;
  task?: Ref | null;
  project?: Ref;
  timesheet?: Ref;
}

export interface NewTimeEntry {
  project: Id;
  timesheet_id: Id;
  date: string;
  logged_hours: string;
  logged_mins: string;
  description?: string;
  status?: string;
  list_id?: Id;
  task_id?: Id;
}

export function personName(person: Person): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name || person.email || String(person.id);
}

export function sameId(left: Id | undefined, right: Id | undefined): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right);
}

export function minutesOf(item: {
  logged_hours?: number | null;
  logged_mins?: number | null;
}): number {
  return (item.logged_hours ?? 0) * 60 + (item.logged_mins ?? 0);
}

export function estimateOf(item: {
  estimated_hours?: number | null;
  estimated_mins?: number | null;
}): number {
  return (item.estimated_hours ?? 0) * 60 + (item.estimated_mins ?? 0);
}
