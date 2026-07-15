import React, { useState, useRef, useEffect } from 'react';
import { ShapeElement, UserProfile, ShapeType } from '../types';
import { Smile, Trash2 } from 'lucide-react';

interface ShapeComponentProps {
  element: ShapeElement;
  isSelected: boolean;
  currentUser: UserProfile;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<ShapeElement>) => void;
  onDelete: () => void;
  isDraggingOrResizing: boolean;
}

const EMOJIS = ['👍', '❤️', '🔥', '💡', '❓', '🎉'];

export default function ShapeComponent({
  element,
  isSelected,
  currentUser,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  isDraggingOrResizing
}: ShapeComponentProps) {
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

  // Helper to render SVG paths based on shape type
  const renderShapeSvg = () => {
    const w = element.width;
    const h = element.height;
    const fill = element.color;
    const stroke = element.borderColor;
    const strokeWidth = 2.5;

    switch (element.shapeType) {
      case 'circle':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <ellipse
              cx={w / 2}
              cy={h / 2}
              rx={(w - strokeWidth) / 2}
              ry={(h - strokeWidth) / 2}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'triangle':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${w / 2},${strokeWidth} ${strokeWidth},${h - strokeWidth} ${w - strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'diamond':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${w / 2},${strokeWidth} ${w - strokeWidth},${h / 2} ${w / 2},${h - strokeWidth} ${strokeWidth},${h / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'star':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 100 100`} preserveAspectRatio="none">
            <polygon
              points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'hexagon':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${w * 0.25},${strokeWidth} ${w * 0.75},${strokeWidth} ${w - strokeWidth},${h / 2} ${w * 0.75},${h - strokeWidth} ${w * 0.25},${h - strokeWidth} ${strokeWidth},${h / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'pentagon':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${w / 2},${strokeWidth} ${w - strokeWidth},${h * 0.38} ${w * 0.82},${h - strokeWidth} ${w * 0.18},${h - strokeWidth} ${strokeWidth},${h * 0.38}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'parallelogram':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${w * 0.25},${strokeWidth} ${w - strokeWidth},${strokeWidth} ${w * 0.75},${h - strokeWidth} ${strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'right-triangle':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <polygon
              points={`${strokeWidth},${strokeWidth} ${strokeWidth},${h - strokeWidth} ${w - strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case 'line':
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <line
              x1={strokeWidth}
              y1={h / 2}
              x2={w - strokeWidth}
              y2={h / 2}
              stroke={stroke}
              strokeWidth={strokeWidth * 1.5}
              strokeLinecap="round"
            />
          </svg>
        );
      case 'rect':
      default:
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={w - strokeWidth}
              height={h - strokeWidth}
              rx={6}
              ry={6}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
    }
  };

  const isDarkFill = element.color === '#4b5563';
  const textColorClass = isDarkFill ? 'text-white' : 'text-slate-800';

  return (
    <div
      onMouseDown={onSelect}
      className={`absolute select-none flex flex-col justify-between transition-shadow duration-150 group cursor-grab active:cursor-grabbing ${
        isSelected ? 'z-20' : 'hover:shadow-xs'
      }`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
      }}
      id={`shape-${element.id}`}
    >
      {/* Visual SVG Shape Layer */}
      {renderShapeSvg()}

      {/* Selected Border Highlight */}
      {isSelected && (
        <div 
          className="absolute inset-0 border-2 border-blue-600 rounded-xl pointer-events-none z-10"
          style={{ margin: '-2px' }}
        />
      )}

      {/* Text Container centered inside shape */}
      <div className="absolute inset-0 flex items-center justify-center p-6 overflow-hidden z-10">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onBlur={handleBlur}
            className={`w-full h-full bg-transparent border-none resize-none focus:outline-none text-center font-bold text-sm ${textColorClass}`}
            placeholder="Type note..."
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
              setIsEditing(true);
            }}
            className={`w-full h-full text-center flex items-center justify-center font-bold text-sm overflow-auto select-text break-words cursor-text ${textColorClass}`}
          >
            {element.text || <span className="opacity-20 italic text-xs">Double tap</span>}
          </div>
        )}
      </div>

      {/* Floating Emoji Bar Above the Shape (Lucidspark style) */}
      {isSelected && !isDraggingOrResizing && (
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full shadow-lg px-2.5 py-1.5 flex items-center space-x-2 z-30 animate-fade-in whitespace-nowrap"
        >
          {/* Reaction Emojis list */}
          <div className="flex items-center space-x-1 border-r border-slate-100 pr-2">
            {EMOJIS.map((emoji) => {
              const users = (element.reactions || {})[emoji] || [];
              const isReacted = users.includes(currentUser.name);
              return (
                <button
                  key={emoji}
                  onClick={(e) => handleEmojiClick(emoji, e)}
                  className={`w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm transition-transform hover:scale-125 ${
                    isReacted ? 'bg-blue-100 ring-1 ring-blue-400' : ''
                  }`}
                  title={users.length > 0 ? `${emoji}: ${users.join(', ')}` : emoji}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-600 transition-colors flex items-center space-x-1.5 text-xs font-bold"
            title="Delete shape"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Inline Reaction Badges (collapsible below) */}
      <div 
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute -bottom-6 left-2 flex flex-wrap gap-1 z-10"
      >
        {Object.entries(element.reactions || {}).map(([emoji, users]) => (
          <button
            key={emoji}
            onClick={(e) => handleEmojiClick(emoji, e)}
            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-white border border-slate-200 shadow-sm transition-transform hover:scale-115 ${
              users.includes(currentUser.name) ? 'bg-blue-50 border-blue-200 text-blue-900' : 'text-slate-600'
            }`}
            title={users.join(', ')}
          >
            <span>{emoji}</span>
            <span className="text-[9px] ml-0.5 font-bold opacity-80">{users.length}</span>
          </button>
        ))}
      </div>

      {/* Resize handle */}
      {isSelected && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 pointer-events-auto z-20"
          onMouseDown={(e) => {
            e.stopPropagation();
            const canvasEvent = new CustomEvent('init-resize', {
              detail: { elementId: element.id, originalEvent: { clientX: e.clientX, clientY: e.clientY } }
            });
            window.dispatchEvent(canvasEvent);
          }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-600 mr-0.5 mb-0.5 shadow-xs" />
        </div>
      )}
    </div>
  );
}
