import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { TodoItem } from '../../shared/types';
import { CheckIcon, GripIcon, PencilIcon, TrashIcon } from './icons';

interface Props {
  task: TodoItem;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
}

export function SortableTaskItem({ task, onToggle, onDelete, onUpdateText }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.text);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(task.text);
    }
  }, [task.text, isEditing]);

  function submitEdit() {
    const next = draftText.trim();
    if (!next) {
      setDraftText(task.text);
      setIsEditing(false);
      return;
    }

    if (next !== task.text) {
      onUpdateText(task.id, next);
    }
    setIsEditing(false);
  }

  const created = dayjs(task.createdAt);
  const fullTime = created.isValid() ? created.format('YYYY-MM-DD HH:mm') : task.createdAt;
  const timeLabel = !created.isValid()
    ? task.createdAt
    : created.isSame(dayjs(), 'day')
      ? created.format('HH:mm')
      : created.format('MM-DD');

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 0.2s ease'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2.5 rounded-lg border px-3 py-3 transition-colors duration-150 ${
        isDragging
          ? 'z-10 border-[var(--accent)] bg-[var(--surface-2)] shadow-[0_10px_24px_var(--shadow)] ring-1 ring-[var(--accent)]'
          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(task.id, !task.completed)}
        title={task.completed ? '标记为未完成' : '标记为完成'}
        className="grid h-[18px] w-[18px] flex-shrink-0 place-items-center self-center rounded-full border transition-all duration-200 hover:border-[var(--accent)]"
        style={{
          borderColor: task.completed ? 'var(--success)' : 'var(--line-strong)',
          background: task.completed ? 'var(--success)' : 'transparent',
          color: '#ffffff'
        }}
      >
        {task.completed && <CheckIcon size={11} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1 self-center">
        {isEditing ? (
          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitEdit();
                }
                if (event.key === 'Escape') {
                  setDraftText(task.text);
                  setIsEditing(false);
                }
              }}
              autoFocus
              className="field resize-none !py-1.5 text-[13px] leading-5"
              rows={2}
            />
            <div className="flex items-center gap-1.5">
              <button className="btn-primary !px-2.5 !py-1 !text-[11px]" onClick={submitEdit} title="保存">
                <CheckIcon size={12} /> 保存
              </button>
              <button
                className="ghost-text !py-1 !text-[11px]"
                onClick={() => {
                  setDraftText(task.text);
                  setIsEditing(false);
                }}
                title="取消"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <p
            onDoubleClick={() => setIsEditing(true)}
            title="双击编辑"
            className={`min-w-0 flex-1 cursor-text truncate text-[13px] leading-[18px] ${
              task.completed ? 'text-[var(--text-3)] line-through' : 'text-[var(--text)]'
            }`}
          >
            {task.text}
          </p>
        )}
      </div>

      {!isEditing && (
        <>
          <span
            className="flex-shrink-0 text-[10px] tabular-nums text-[var(--text-3)]"
            title={fullTime}
          >
            {timeLabel}
          </span>
          <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            {...attributes}
            {...listeners}
            className="ghost-icon !h-7 !w-6 cursor-grab text-[var(--text-3)] hover:text-[var(--text)] active:cursor-grabbing"
            title="拖拽排序"
          >
            <GripIcon size={14} />
          </button>
          <button
            className="ghost-icon !h-7 !w-7 text-[var(--text-3)] hover:text-[var(--accent)]"
            onClick={() => setIsEditing(true)}
            title="编辑待办"
          >
            <PencilIcon size={13} />
          </button>
          <button
            className="ghost-icon danger !h-7 !w-7 text-[var(--text-3)]"
            onClick={() => onDelete(task.id)}
            title="删除待办"
          >
            <TrashIcon size={13} />
          </button>
          </div>
        </>
      )}
    </div>
  );
}
