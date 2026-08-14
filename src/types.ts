export interface Person {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  archived?: boolean;
  url?: string;
}

export interface Todolist {
  id: string;
  title: string;
  project_id?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed?: boolean;
  assigned?: string[];
  due_date?: string;
  start_date?: string;
  estimated_hours?: number;
  estimated_mins?: number;
  labels?: string[];
  sub_tasks?: number;
  url?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed?: boolean;
  assigned?: string[];
  due_date?: string;
}

export interface Comment {
  id: string;
  content: string;
  created_by?: string;
  created_at?: string;
}

export interface TimeEntry {
  id: string;
  hours?: string;
  description?: string;
  logged_date?: string;
  billable?: boolean;
  task_id?: string;
}

export function personName(person: Person): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name || person.email || person.id;
}
