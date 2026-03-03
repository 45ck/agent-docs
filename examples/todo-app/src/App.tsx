import { FormEvent, useMemo, useState } from 'react';

type Priority = 'low' | 'medium' | 'high';
type FilterType = 'all' | 'active' | 'completed' | 'overdue' | 'high';

type Todo = {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  completed: boolean;
  dueDate: string;
  tags: string[];
  createdAt: string;
};

const STORAGE_KEY = 'agent-docs-todo-example:v1';

const EMPTY_TODO = {
  title: '',
  notes: '',
  dueDate: '',
  priority: 'medium' as Priority,
  tags: '',
};

function formatDate(value?: string) {
  if (!value) {
    return 'No due date';
  }
  return new Date(value).toLocaleDateString();
}

function toPriorityLabel(priority: Priority): string {
  return priority[0].toUpperCase() + priority.slice(1);
}

function isOverdue(todo: Todo, today = new Date()) {
  if (!todo.dueDate) {
    return false;
  }
  if (todo.completed) {
    return false;
  }
  const due = new Date(todo.dueDate);
  const startOfToday = new Date(today.toDateString());
  return due < startOfToday;
}

function loadTodos(): Todo[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [
      {
        id: crypto.randomUUID(),
        title: 'Wire up TOON-based planning docs in .agent-docs',
        notes: 'Generate markdown outputs and keep ADR/PRD artifacts current.',
        priority: 'high',
        completed: false,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        tags: ['agent-docs', 'react', 'frontend'],
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: 'Build quality gates for source docs',
        notes: 'run strict checks before merging docs changes',
        priority: 'medium',
        completed: false,
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
        tags: ['docs', 'quality'],
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: 'Archive completed feature tasks weekly',
        notes: 'Use completed filter and clear action for housekeeping',
        priority: 'low',
        completed: true,
        dueDate: '',
        tags: ['workflow'],
        createdAt: new Date().toISOString(),
      },
    ];
  }

  try {
    const parsed = JSON.parse(raw) as Todo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [filter, setFilter] = useState<FilterType>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ ...EMPTY_TODO });

  const filteredTodos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return todos.filter((todo) => {
      const byFilter =
        filter === 'all'
          ? true
          : filter === 'active'
            ? !todo.completed
            : filter === 'completed'
              ? todo.completed
              : filter === 'high'
                ? todo.priority === 'high'
                : isOverdue(todo);

      if (!byFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        todo.title.toLowerCase().includes(normalizedQuery) ||
        todo.notes.toLowerCase().includes(normalizedQuery) ||
        todo.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [filter, query, todos]);

  const summary = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((todo) => todo.completed).length;
    const overdue = todos.filter((todo) => isOverdue(todo)).length;
    const high = todos.filter((todo) => todo.priority === 'high').length;
    return { total, completed, overdue, high };
  }, [todos]);

  function persist(next: Todo[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setTodos(next);
  }

  function addTodo(event: FormEvent) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      return;
    }

    const todo: Todo = {
      id: crypto.randomUUID(),
      title,
      notes: form.notes.trim(),
      priority: form.priority,
      completed: false,
      dueDate: form.dueDate,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
    };

    persist([todo, ...todos]);
    setForm({ ...EMPTY_TODO, priority: form.priority, dueDate: '' });
  }

  function toggleTodo(id: string) {
    const next = todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo));
    persist(next);
  }

  function removeTodo(id: string) {
    const next = todos.filter((todo) => todo.id !== id);
    persist(next);
  }

  function clearCompleted() {
    persist(todos.filter((todo) => !todo.completed));
  }

  return (
    <div className="app-shell">
      <h1>Agent Docs To-Do Example</h1>
      <p>
        Demonstrates TOON-first project planning with a runnable feature-rich React task manager.
      </p>

      <section>
        <h2>Create task</h2>
        <form onSubmit={addTodo}>
          <div className="task-grid">
            <label>
              Title
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="What needs doing?"
              />
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as Priority }))}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>
            <label>
              Tags (comma-separated)
              <input
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="feature,docs"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Notes
              <input
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Supporting context, links, blockers"
              />
            </label>
          </div>
          <button style={{ marginTop: '0.8rem' }} type="submit">
            Add task
          </button>
        </form>
      </section>

      <section className="list-section">
        <h2>Plan status</h2>
        <div className="toolbar">
          <button onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : undefined}>All ({summary.total})</button>
          <button onClick={() => setFilter('active')} className={filter === 'active' ? 'active' : undefined}>Active ({summary.total - summary.completed})</button>
          <button onClick={() => setFilter('completed')} className={filter === 'completed' ? 'active' : undefined}>Completed ({summary.completed})</button>
          <button onClick={() => setFilter('overdue')} className={filter === 'overdue' ? 'active' : undefined}>Overdue ({summary.overdue})</button>
          <button onClick={() => setFilter('high')} className={filter === 'high' ? 'active' : undefined}>High ({summary.high})</button>
          <button onClick={clearCompleted}>Clear completed</button>
        </div>

        <label>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="title, tag, or notes"
          />
        </label>

        {filteredTodos.length === 0 ? (
          <div className="empty">No tasks match your filter. Add one above or clear filters.</div>
        ) : (
          filteredTodos.map((todo) => {
            const overdue = isOverdue(todo);
            return (
              <article className="task-card" key={todo.id}>
                <p className="task-title">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                    aria-label={`toggle ${todo.title}`}
                  />
                  <strong>{todo.title}</strong>
                </p>

                <p>{todo.notes || 'No notes yet.'}</p>

                <div className="meta">
                  <span className="badge">{toPriorityLabel(todo.priority)} priority</span>
                  <span className={overdue ? 'due-late badge' : 'badge'}>Due: {formatDate(todo.dueDate)}</span>
                  <span className="badge">Created: {formatDate(todo.createdAt)}</span>
                  <span className="badge">
                    {todo.tags.length ? `Tags: ${todo.tags.join(', ')}` : 'No tags'}
                  </span>
                </div>

                <div className="actions">
                  <button onClick={() => removeTodo(todo.id)}>Delete</button>
                  <button onClick={() => toggleTodo(todo.id)}>{todo.completed ? 'Reopen' : 'Complete'}</button>
                </div>
              </article>
            );
          })
        )}

        <small>
          Overdue tasks stay highlighted until completed. This repo includes agent-docs source documents for the
          complete planning trail.
        </small>
      </section>
    </div>
  );
}
