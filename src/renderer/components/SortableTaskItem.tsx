import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { useEffect, useState } from 'react';
import { TodoItem } from '../../shared/types';

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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 0.28s ease-in-out'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-300 ${
        task.completed
          ? 'border-emerald-300/30 bg-emerald-500/10'
          : 'border-white/15 bg-slate-900/55 hover:border-cyan-200/35 hover:bg-slate-900/80'
      } ${isDragging ? 'scale-[1.012] shadow-[0_16px_36px_rgba(8,47,73,0.45)]' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-300 transition-all duration-300 hover:bg-white/15 active:cursor-grabbing"
        title="拖拽排序"
      >
        ⋮⋮
      </button>

      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-cyan-300"
        checked={task.completed}
        onChange={(event) => onToggle(task.id, event.target.checked)}
      />

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="space-y-1">
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              className="w-full resize-none rounded-lg border border-cyan-300/45 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none"
              rows={2}
            />
            <div className="flex items-center gap-1">
              <button
                className="rounded-md border border-emerald-300/35 bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200"
                onClick={submitEdit}
                title="保存"
              >
                ✓
              </button>
              <button
                className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-slate-200"
                onClick={() => {
                  setDraftText(task.text);
                  setIsEditing(false);
                }}
                title="取消"
              >
                ↺
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`whitespace-pre-wrap break-all text-sm leading-5 ${task.completed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
              {task.text}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{task.createdAt}</p>
          </>
        )}
      </div>

      {!isEditing && (
        <button
          className="rounded-md border border-cyan-300/30 bg-cyan-500/12 px-2 py-1 text-[11px] text-cyan-100 transition-all duration-300 hover:bg-cyan-500/25"
          onClick={() => setIsEditing(true)}
          title="编辑待办"
        >
          ✎
        </button>
      )}

      <button
        className="rounded-md border border-rose-300/30 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 transition-all duration-300 hover:bg-rose-500/30"
        onClick={() => onDelete(task.id)}
        title="删除待办"
      >
        🗑
      </button>
    </div>
  );
}
