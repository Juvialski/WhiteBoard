import React, { useState } from 'react';
import { 
  MousePointer, 
  Hand, 
  Pen, 
  Highlighter, 
  StickyNote, 
  Square, 
  Circle, 
  Triangle, 
  CornerDownRight, 
  Type, 
  Eraser, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Grid,
  Hexagon
} from 'lucide-react';
import { ShapeType } from '../types';

export type Tool = 'select' | 'pan' | 'pencil' | 'highlighter' | 'sticky' | 'shape' | 'text' | 'connector' | 'eraser';

interface ToolbarProps {
  activeTool: Tool;
  onChangeTool: (tool: Tool) => void;
  activeColor: string;
  onChangeColor: (color: string) => void;
  activeShape: ShapeType;
  onChangeShape: (shape: ShapeType) => void;
  onClearBoard: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  strokeWidth: number;
  onChangeStrokeWidth: (width: number) => void;
  gridMode: 'dots' | 'math';
  onChangeGridMode: (mode: 'dots' | 'math') => void;
}

const STICKY_COLORS = [
  // Pastel row 1
  { name: 'Yellow', hex: '#fef08a' },
  { name: 'Pink', hex: '#fbcfe8' },
  { name: 'Blue', hex: '#bfdbfe' },
  { name: 'Green', hex: '#bbf7d0' },
  // Pastel row 2
  { name: 'Orange', hex: '#fed7aa' },
  { name: 'Purple', hex: '#e9d5ff' },
  { name: 'Teal', hex: '#99f6e4' },
  { name: 'Red', hex: '#fecaca' },
  // Solid/Vibrant row 3
  { name: 'Vibrant Red', hex: '#e11d48' },
  { name: 'Vibrant Orange', hex: '#f97316' },
  { name: 'Vibrant Green', hex: '#059669' },
  { name: 'Vibrant Blue', hex: '#2563eb' },
  // Dark/Neutrals row 4
  { name: 'Vibrant Purple', hex: '#7c3aed' },
  { name: 'Slate Grey', hex: '#64748b' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Pure Black', hex: '#000000' }
];

const SHAPES: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rect', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
  { type: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
  { type: 'triangle', label: 'Triangle', icon: <Triangle className="w-4 h-4" /> },
  { type: 'diamond', label: 'Diamond', icon: <div className="w-3.5 h-3.5 border-2 border-current rotate-45 transform mx-auto" /> },
  { type: 'star', label: 'Star', icon: <div className="text-[14px] leading-none font-bold text-center">&#9733;</div> },
  { type: 'hexagon', label: 'Hexagon', icon: <Hexagon className="w-4 h-4" /> },
  { type: 'pentagon', label: 'Pentagon', icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 22 9.27 18.18 21 5.82 21 2 9.27" />
      </svg>
    ) 
  },
  { type: 'parallelogram', label: 'Parallelogram', icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6 4 21 4 18 20 3 20" />
      </svg>
    ) 
  },
  { type: 'right-triangle', label: 'Right Triangle', icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="4 4 4 20 20 20" />
      </svg>
    ) 
  },
  { type: 'line', label: 'Line Segment', icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ) 
  }
];

export default function Toolbar({
  activeTool,
  onChangeTool,
  activeColor,
  onChangeColor,
  activeShape,
  onChangeShape,
  onClearBoard,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  strokeWidth,
  onChangeStrokeWidth,
  gridMode,
  onChangeGridMode
}: ToolbarProps) {
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);

  const tools: { id: Tool; icon: React.ReactNode; label: string; shortcut?: string }[] = [
    { id: 'select', icon: <MousePointer className="w-5 h-5" />, label: 'Select & Edit (V)' },
    { id: 'pan', icon: <Hand className="w-5 h-5" />, label: 'Pan Canvas (H)' },
    { id: 'pencil', icon: <Pen className="w-5 h-5" />, label: 'Pen Drawing (P)' },
    { id: 'highlighter', icon: <Highlighter className="w-5 h-5" />, label: 'Highlighter' },
    { id: 'sticky', icon: <StickyNote className="w-5 h-5" />, label: 'Sticky Note (N)' },
    { id: 'shape', icon: <Square className="w-5 h-5" />, label: 'Shapes (S)' },
    { id: 'text', icon: <Type className="w-5 h-5" />, label: 'Text Box (T)' },
    { id: 'connector', icon: <CornerDownRight className="w-5 h-5" />, label: 'Connector Line (L)' },
    { id: 'eraser', icon: <Eraser className="w-5 h-5" />, label: 'Eraser (E)' }
  ];

  return (
    <div className="absolute left-4 top-24 z-30 flex flex-col space-y-4" id="whiteboard-toolbar">
      {/* Primary Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-1.5 flex flex-col space-y-1">
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          return (
            <div key={t.id} className="relative group">
              <button
                onClick={() => {
                  onChangeTool(t.id);
                  if (t.id === 'shape') {
                    setShowShapeMenu(true);
                  } else {
                    setShowShapeMenu(false);
                  }
                  if (t.id === 'sticky' || t.id === 'shape' || t.id === 'pencil' || t.id === 'highlighter' || t.id === 'text' || t.id === 'connector') {
                    setShowColorMenu(true);
                  } else {
                    setShowColorMenu(false);
                  }
                }}
                className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15 scale-105' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title={t.label}
              >
                {t.id === 'shape' ? (
                  SHAPES.find(s => s.type === activeShape)?.icon || t.icon
                ) : (
                  t.icon
                )}
              </button>
              
              {/* Tooltip */}
              <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap shadow-md">
                {t.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Submenu Panels (Shapes Selector, Color Picker, Pen stroke) */}
      {(showShapeMenu && activeTool === 'shape') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-2 flex flex-col space-y-1 absolute left-18 top-44 w-44 max-h-[320px] overflow-y-auto animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
          <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider sticky top-0 bg-white z-10 border-b border-slate-50 mb-1">Select Shape</div>
          {SHAPES.map((s) => (
            <button
              key={s.type}
              onClick={() => {
                onChangeShape(s.type);
                setShowShapeMenu(false);
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeShape === s.type ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-slate-500">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Color Picker Panel */}
      {showColorMenu && (['sticky', 'shape', 'pencil', 'highlighter', 'text', 'connector'].includes(activeTool)) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-3 flex flex-col space-y-2.5 absolute left-18 top-12 w-48 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Palette Color</span>
            <button 
              onClick={() => setShowColorMenu(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium"
            >
              Close
            </button>
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            {STICKY_COLORS.map((color) => {
              const isSelected = activeColor === color.hex;
              const isDarkColor = ['#e11d48', '#f97316', '#059669', '#2563eb', '#7c3aed', '#64748b', '#000000'].includes(color.hex);
              return (
                <button
                  key={color.hex}
                  onClick={() => onChangeColor(color.hex)}
                  className={`h-8 rounded-lg border relative transition-all ${
                    isSelected ? 'ring-2 ring-blue-600 ring-offset-1 border-white scale-105' : 'border-slate-200'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                >
                  {isSelected && (
                    <div className={`absolute inset-0 m-auto w-2 h-2 rounded-full shadow-xs ${isDarkColor ? 'bg-white' : 'bg-slate-800'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Stroke Thickness Panel for Drawing Tools */}
          {(activeTool === 'pencil' || activeTool === 'highlighter') && (
            <div className="border-t border-slate-100 pt-2.5 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Line Size</span>
              <div className="flex items-center space-x-2">
                {[2, 4, 8, 16].map((w) => (
                  <button
                    key={w}
                    onClick={() => onChangeStrokeWidth(w)}
                    className={`flex-1 py-1 rounded border text-xs font-semibold ${
                      strokeWidth === w ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear All Board Option */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-1.5">
        <button
          onClick={onClearBoard}
          className="p-3 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors flex items-center justify-center w-full"
          title="Clear Board"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Zoom Controls (Float inside bottom left normally, but keeping with toolbar simplifies floating layouts) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-1.5 flex flex-col space-y-1">
        <button
          onClick={onZoomIn}
          className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomReset}
          className="py-1 px-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg text-center font-mono whitespace-nowrap"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomOut}
          className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Grid Mode Selection */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-1.5 flex flex-col space-y-1">
        <button
          onClick={() => onChangeGridMode(gridMode === 'dots' ? 'math' : 'dots')}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
            gridMode === 'math' 
              ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-600/20 font-bold' 
              : 'text-slate-500 hover:bg-slate-100'
          }`}
          title={gridMode === 'math' ? 'Switch to Dotted Canvas' : 'Switch to Math Grid (Graph Paper)'}
        >
          <Grid className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
