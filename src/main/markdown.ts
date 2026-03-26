import dayjs from 'dayjs';
import { randomUUID } from 'node:crypto';
import { TodoItem } from '../shared/types';

const TASK_LINE_REGEX = /^- \[( |x|X)\]\s+(.*)$/;
const TIMESTAMP_SUFFIX_REGEX = /\((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\)\s*$/;

export function parseMarkdownTasks(content: string): TodoItem[] {
  const lines = content.split(/\r?\n/);
  const tasks: TodoItem[] = [];

  for (const line of lines) {
    const match = line.match(TASK_LINE_REGEX);
    if (!match) {
      continue;
    }

    const completed = match[1].toLowerCase() === 'x';
    const rawText = match[2].trim();
    const timestampMatch = rawText.match(TIMESTAMP_SUFFIX_REGEX);

    let createdAt = dayjs().format('YYYY-MM-DD HH:mm');
    let text = rawText;

    if (timestampMatch) {
      createdAt = timestampMatch[1];
      text = rawText.replace(TIMESTAMP_SUFFIX_REGEX, '').trim();
    }

    tasks.push({
      id: randomUUID(),
      text,
      completed,
      createdAt
    });
  }

  return tasks;
}

export function stringifyMarkdownTasks(tasks: TodoItem[]): string {
  return tasks
    .map((task) => {
      const checked = task.completed ? 'x' : ' ';
      return `- [${checked}] ${task.text} (${task.createdAt})`;
    })
    .join('\n')
    .trim();
}

export function createTaskFromText(text: string): TodoItem {
  return {
    id: randomUUID(),
    text: text.replace(/\s+/g, ' ').trim(),
    completed: false,
    createdAt: dayjs().format('YYYY-MM-DD HH:mm')
  };
}
