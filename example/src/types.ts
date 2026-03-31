/** @spec DOMAIN-001 */

export type Priority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: number;
  title: string;
  description?: string;
  priority: Priority;
  labels: string[];
  dueDate?: string;
  completed: boolean;
  createdAt: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  priority?: Priority;
  labels?: string[];
  dueDate?: string;
}

export interface FilterOptions {
  label?: string;
  priority?: Priority;
  completed?: boolean;
  search?: string;
}
