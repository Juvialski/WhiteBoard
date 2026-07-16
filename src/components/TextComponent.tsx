import React, { useState, useRef, useEffect } from 'react';
import { TextElement, UserProfile } from '../types';
import { Smile, Trash2, Lock, Unlock } from 'lucide-react';

interface TextComponentProps {
  element: TextElement;
  isSelected: boolean;
  currentUser: UserProfile;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<TextElement>) => void;
  onDelete: () => void;
  isDraggingOrResizing: boolean;
  activeTool?: string;
  canWrite?: boolean;
}

const EMOJIS = ['👍', '❤️', '🔥', '💡', '❓', '🎉'];

export default function TextComponent({
  element,
  isSelected,
  currentUser,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  isDraggingOrResizing,
  activeTool = 'select',
  canWrite = true
}: TextComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(element.text);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(element.text);
  }, [element.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (text !== element.text) {
      onUpdate({ text: text });
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleEmojiClick = (emoji: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentReactions = element.reactions || {};
    const users = currentReactions[emoji] || [];

    let newUsers: string[];
    if (users.includes(currentUser.name)) {
      newUsers = users.filter((u) => u !== currentUser.name);
    } else {
      newUsers = [...users, currentUser.name];
    }

    const updatedReactions = { ...currentReactions };
    if (newUsers.length === 0) {
      delete updatedReactions[emoji];
    } else {
      updatedReactions[emoji] = newUsers;
    }

    onUpdate({ reactions: updatedReactions });
    setShowEmojiPicker(false);
  };

  const cursorClass = element.locked
    ? 'cursor-default'
    : activeTool === 'select' 
      ? 'cursor-grab active:cursor-grabbing' 
      : activeTool === 'eraser' 
        ? 'cursor-pointer hover:bg-rose-50 hover:ring-2 hover:ring-rose-500 hover:ring-offset-1 transition-all' 
        : 'cursor-default';

  return (
    <div
      onMouseDown={onSelect}
      className={`absolute select-none flex flex-col justify-between transition-shadow duration-150 rounded-lg group p-2 ${cursorClass} ${
        isSelected ? 'ring-2 ring-blue-600 bg-blue-50/30 z-20 shadow-xs' : 'hover:bg-slate-50/30'
      }`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
      }}
      id={`text-${element.id}`}
    >
      <div className="flex-1 relative w-full h-full overflow-hidden">
        {isEditing && !element.locked ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onBlur={handleBlur}
            className="w-full h-full bg-transparent border-none resize-none focus:outline-none text-left font-bold font-mono text-slate-800 p-1"
            style={{ fontSize: `${element.fontSize || 16}px`, color: element.color }}
            placeholder="Type text..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                textareaRef.current?.blur();
              }
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!canWrite || element.locked) return;
              setIsEditing(true);
            }}
            className="w-full h-full text-left font-bold break-words overflow-y-auto select-text cursor-text p-1"
            style={{ fontSize: `${element.fontSize || 16}px`, color: element.color }}
          >
            {element.text || (canWrite ? <span className="opacity-30 italic text-xs font-normal">Double click to type text</span> : '')}
          </div>
        )}
      </div>

      {/* Floating Action Menu below or above */}
      {isSelected && !isDraggingOrResizing && (
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full shadow-lg px-2.5 py-1.5 flex items-center space-x-2 z-30 animate-fade-in whitespace-nowrap"
        >
          {/* Reaction picker */}
          <div className="flex items-center space-x-1 pr-2">
            {/* Lock Trigger */}
            {canWrite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ locked: !element.locked });
                }}
                className={`p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer ${
                  element.locked ? 'text-amber-600' : 'text-slate-500'
                }`}
                title={element.locked ? 'Unlock Text' : 'Lock Text'}
              >
                {element.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            )}

            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={(e) => handleEmojiClick(emoji, e)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* FontSize adjustments */}
          {canWrite && (
            <div className="flex items-center space-x-1 border-l border-slate-100 pl-2 pr-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ fontSize: Math.max(12, (element.fontSize || 16) - 2) });
                }}
                className="p-1 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-600"
                title="Smaller font"
              >
                A-
              </button>
              <span className="text-[10px] text-slate-500 font-mono w-6 text-center">{element.fontSize || 16}px</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ fontSize: Math.min(48, (element.fontSize || 16) + 2) });
                }}
                className="p-1 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-600"
                title="Larger font"
              >
                A+
              </button>
            </div>
          )}

          {canWrite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded hover:bg-rose-50 text-rose-500 hover:text-rose-600 transition-colors flex items-center border-l border-slate-100 pl-2"
              title="Delete text box"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Reactions badges underneath */}
      <div 
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute -bottom-5 left-1 flex flex-wrap gap-1 z-10"
      >
        {Object.entries(element.reactions || {}).map(([emoji, users]) => (
          <div
            key={emoji}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white border border-slate-100 shadow-xs text-slate-500"
            title={users.join(', ')}
          >
            <span>{emoji}</span>
            <span className="text-[9px] ml-0.5">{users.length}</span>
          </div>
        ))}
      </div>

      {/* Resize handles */}
      {isSelected && canWrite && !element.locked && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize flex items-end justify-end pointer-events-auto"
          onMouseDown={(e) => {
            e.stopPropagation();
            const canvasEvent = new CustomEvent('init-resize', {
              detail: { elementId: element.id, originalEvent: { clientX: e.clientX, clientY: e.clientY } }
            });
            window.dispatchEvent(canvasEvent);
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-0.5 mb-0.5" />
        </div>
      )}
    </div>
  );
}
