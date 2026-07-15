import React, { useState, useRef, useEffect } from 'react';
import { StickyElement, UserProfile } from '../types';
import { Smile, Trash2 } from 'lucide-react';

interface StickyComponentProps {
  element: StickyElement;
  isSelected: boolean;
  currentUser: UserProfile;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<StickyElement>) => void;
  onDelete: () => void;
  isDraggingOrResizing: boolean;
  activeTool?: string;
  canWrite?: boolean;
}

const EMOJIS = ['👍', '❤️', '🔥', '💡', '❓', '🎉'];

export default function StickyComponent({
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
}: StickyComponentProps) {
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
      // Remove reaction if already reacted
      newUsers = users.filter((u) => u !== currentUser.name);
    } else {
      // Add reaction
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

  const isDarkColor = element.color === '#4b5563';
  const textColorClass = isDarkColor ? 'text-white' : 'text-slate-800';

  const cursorClass = activeTool === 'select' 
    ? 'cursor-grab active:cursor-grabbing' 
    : activeTool === 'eraser' 
      ? 'cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-rose-500 hover:ring-offset-1 transition-all' 
      : 'cursor-default';

  return (
    <div
      onMouseDown={onSelect}
      className={`absolute select-none rounded-xl p-4 flex flex-col justify-between transition-shadow duration-150 group ${cursorClass} ${
        isSelected ? 'ring-2 ring-blue-600 shadow-xl z-20' : 'shadow-md shadow-slate-200/50 hover:shadow-lg'
      }`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        backgroundColor: element.color,
      }}
      id={`sticky-${element.id}`}
    >
      {/* Content Area */}
      <div className="flex-1 flex flex-col justify-center overflow-hidden w-full relative">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onBlur={handleBlur}
            className={`w-full h-full bg-transparent border-none resize-none focus:outline-none text-center font-semibold text-sm ${textColorClass}`}
            placeholder="Type your spark..."
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
              if (!canWrite) return;
              setIsEditing(true);
            }}
            className={`w-full h-full text-center flex items-center justify-center font-semibold text-sm overflow-auto select-text break-words cursor-text p-1 ${textColorClass}`}
          >
            {element.text || (canWrite ? <span className="opacity-30 italic text-xs">Double click to type</span> : '')}
          </div>
        )}
      </div>

      {/* Footer (Reactions & Controls) */}
      <div 
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900/5 min-h-[24px]"
      >
        {/* Render Emojis List */}
        <div className="flex flex-wrap gap-1">
          {Object.entries(element.reactions || {}).map(([emoji, users]) => (
            <button
              key={emoji}
              onClick={(e) => handleEmojiClick(emoji, e)}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold transition-transform hover:scale-115 ${
                users.includes(currentUser.name) 
                  ? 'bg-blue-500/10 text-blue-950 border border-blue-400/20' 
                  : 'bg-white/50 border border-transparent'
              }`}
              title={users.join(', ')}
            >
              <span>{emoji}</span>
              <span className="text-[10px] ml-0.5 opacity-80">{users.length}</span>
            </button>
          ))}
        </div>

        {/* Action Controls for Selected Note */}
        {isSelected && !isDraggingOrResizing && (
          <div className="flex items-center space-x-1 ml-auto">
            {/* Reaction Trigger */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(!showEmojiPicker);
                }}
                className={`p-1 rounded hover:bg-black/5 ${textColorClass} transition-colors`}
                title="Add reaction"
              >
                <Smile className="w-4 h-4" />
              </button>
              
              {showEmojiPicker && (
                <div className="absolute bottom-7 right-0 bg-white border border-slate-200 rounded-full shadow-lg p-1.5 flex items-center space-x-1 z-30 animate-scale-up">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={(e) => handleEmojiClick(emoji, e)}
                      className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm transition-transform hover:scale-120"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Delete Trigger */}
            {canWrite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className={`p-1 rounded hover:bg-rose-500/10 text-rose-600 transition-colors`}
                title="Delete Element"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Resize corner handle */}
      {isSelected && canWrite && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 pointer-events-auto"
          onMouseDown={(e) => {
            e.stopPropagation();
            // Dispatch a custom event or let the canvas handle it
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
