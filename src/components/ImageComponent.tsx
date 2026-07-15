import React, { useState } from 'react';
import { ImageElement, UserProfile } from '../types';
import { Smile, Trash2, Maximize2, X } from 'lucide-react';

interface ImageComponentProps {
  element: ImageElement;
  isSelected: boolean;
  currentUser: UserProfile;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<ImageElement>) => void;
  onDelete: () => void;
  isDraggingOrResizing: boolean;
}

const EMOJIS = ['👍', '❤️', '🔥', '💡', '❓', '🎉'];

export default function ImageComponent({
  element,
  isSelected,
  currentUser,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  isDraggingOrResizing
}: ImageComponentProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  return (
    <>
      <div
        onMouseDown={onSelect}
        className={`absolute select-none rounded-xl bg-white p-2 flex flex-col justify-between transition-shadow duration-150 group cursor-grab active:cursor-grabbing ${
          isSelected ? 'ring-2 ring-blue-600 shadow-xl z-20' : 'shadow-md shadow-slate-200/50 hover:shadow-lg'
        }`}
        style={{
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
        }}
        id={`image-${element.id}`}
      >
        {/* Image Content Frame */}
        <div className="flex-1 overflow-hidden w-full h-full relative rounded-lg bg-slate-50 flex items-center justify-center group/img">
          <img
            src={element.src}
            alt="Pasted canvas content"
            className="w-full h-full object-contain select-none pointer-events-none"
            referrerPolicy="no-referrer"
          />
          
          {/* Quick full-screen preview button on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(true);
            }}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer shadow-xs"
            title="View Full Image"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Footer (Reactions & Actions) */}
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 min-h-[24px]"
        >
          {/* Render Reactions */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(element.reactions || {}).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={(e) => handleEmojiClick(emoji, e)}
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold transition-transform hover:scale-115 ${
                  users.includes(currentUser.name) 
                    ? 'bg-blue-500/10 text-blue-950 border border-blue-400/20' 
                    : 'bg-slate-100 border border-transparent'
                }`}
                title={users.join(', ')}
              >
                <span>{emoji}</span>
                <span className="text-[10px] ml-0.5 opacity-80">{users.length}</span>
              </button>
            ))}
          </div>

          {/* Controls */}
          {isSelected && !isDraggingOrResizing && (
            <div className="flex items-center space-x-1 ml-auto">
              {/* Emoji Trigger */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
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
                        className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm transition-transform hover:scale-120 cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete Trigger */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Delete Image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Resize corner handle */}
        {isSelected && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 pointer-events-auto"
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

      {/* Lightbox / Modal overlay for full-screen view */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 pointer-events-auto cursor-zoom-out animate-fade-in"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute -top-10 right-0 text-white hover:text-slate-200 p-1 bg-black/40 hover:bg-black/60 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={element.src}
              alt="Full Resolution"
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain bg-neutral-900 border border-neutral-800"
              onClick={(e) => e.stopPropagation()} // prevent closing on image click
            />
          </div>
        </div>
      )}
    </>
  );
}
