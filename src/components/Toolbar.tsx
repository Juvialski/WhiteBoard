import React, { useState, useEffect } from "react";
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
  Hexagon,
  TrendingUp,
  Zap,
  ChevronLeft,
  Eye,
  EyeOff,
  PenTool,
  Keyboard,
  Flame,
  Timer as TimerIcon,
  Video,
  Mic,
  Stamp,
  Calculator,
} from "lucide-react";
import { ShapeType } from "../types";

export type Tool =
  | "select"
  | "pan"
  | "pencil"
  | "highlighter"
  | "sticky"
  | "shape"
  | "cartesian"
  | "numberline"
  | "advanced-cartesian"
  | "text"
  | "eraser"
  | "connector"
  | "laser"
  | "audio"
  | "stamp"
  | "math";

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
  gridMode: "dots" | "math" | "none";
  onChangeGridMode: (mode: "dots" | "math" | "none") => void;
  hasSelection?: boolean;
  hasColorableSelection?: boolean;
  isPdfMode?: boolean;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  isTopBarHidden?: boolean;
  onOpenShortcuts?: () => void;
  onOpenClearModal?: () => void;
  onToggleTimer?: () => void;
  isTimerOpen?: boolean;
}

const STICKY_COLORS = [
  // Pastel row 1
  { name: "Yellow", hex: "#fef08a" },
  { name: "Pink", hex: "#fbcfe8" },
  { name: "Blue", hex: "#bfdbfe" },
  { name: "Green", hex: "#bbf7d0" },
  // Pastel row 2
  { name: "Orange", hex: "#fed7aa" },
  { name: "Purple", hex: "#e9d5ff" },
  { name: "Teal", hex: "#99f6e4" },
  { name: "Red", hex: "#fecaca" },
  // Solid/Vibrant row 3
  { name: "Vibrant Red", hex: "#e11d48" },
  { name: "Vibrant Orange", hex: "#f97316" },
  { name: "Vibrant Green", hex: "#059669" },
  { name: "Vibrant Blue", hex: "#2563eb" },
  // Dark/Neutrals row 4
  { name: "Vibrant Purple", hex: "#7c3aed" },
  { name: "Slate Grey", hex: "#64748b" },
  { name: "White", hex: "#ffffff" },
  { name: "Pure Black", hex: "#000000" },
];

const SHAPES: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: "rect", label: "Rectangle", icon: <Square className="w-4 h-4" /> },
  { type: "circle", label: "Circle", icon: <Circle className="w-4 h-4" /> },
  {
    type: "triangle",
    label: "Triangle",
    icon: <Triangle className="w-4 h-4" />,
  },
  {
    type: "diamond",
    label: "Diamond",
    icon: (
      <div className="w-3.5 h-3.5 border-2 border-current rotate-45 transform mx-auto" />
    ),
  },
  {
    type: "star",
    label: "Star",
    icon: (
      <div className="text-[14px] leading-none font-bold text-center">
        &#9733;
      </div>
    ),
  },
  { type: "hexagon", label: "Hexagon", icon: <Hexagon className="w-4 h-4" /> },
  {
    type: "pentagon",
    label: "Pentagon",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 22 9.27 18.18 21 5.82 21 2 9.27" />
      </svg>
    ),
  },
  {
    type: "parallelogram",
    label: "Parallelogram",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="6 4 21 4 18 20 3 20" />
      </svg>
    ),
  },
  {
    type: "right-triangle",
    label: "Right Triangle",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="4 4 4 20 20 20" />
      </svg>
    ),
  },
  {
    type: "line",
    label: "Line Segment",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ),
  },
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
  onChangeGridMode,
  hasSelection = false,
  hasColorableSelection = false,
  isPdfMode = false,
  isZenMode = false,
  onToggleZenMode,
  isTopBarHidden = false,
  onOpenShortcuts,
  onOpenClearModal,
  onToggleTimer,
  isTimerOpen = false,
}: ToolbarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showGraphMenu, setShowGraphMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [hideColorMenuOverride, setHideColorMenuOverride] = useState(false);

  useEffect(() => {
    if (hasColorableSelection) {
      setHideColorMenuOverride(false);
    }
  }, [hasColorableSelection]);

  const isGraphTool =
    activeTool === "cartesian" ||
    activeTool === "advanced-cartesian" ||
    activeTool === "numberline";
  const activeGraphMode = isGraphTool ? activeTool : "advanced-cartesian";

  const GRAPH_TOOLS: { type: Tool; label: string; icon: React.ReactNode }[] = [
    {
      type: "advanced-cartesian",
      label: "Advanced Cartesian",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      type: "cartesian",
      label: "Basic Cartesian",
      icon: <Grid className="w-4 h-4" />,
    },
    {
      type: "numberline",
      label: "Number Line",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 3 12 L 21 12" strokeWidth="2.5" />
          <path d="M 6 9 L 3 12 L 6 15" strokeWidth="2.5" />
          <path d="M 18 9 L 21 12 L 18 15" strokeWidth="2.5" />
          <path d="M 12 9 L 12 15" strokeWidth="2.5" />
          <path d="M 7 10 L 7 14" />
          <path d="M 17 10 L 17 14" />
        </svg>
      ),
    },
  ];

  const tools: {
    id: Tool | "graph_menu";
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
  }[] = [
    {
      id: "select",
      icon: <MousePointer className="w-5 h-5" />,
      label: "Select & Edit (V)",
    },
    { id: "pan", icon: <Hand className="w-5 h-5" />, label: "Pan Canvas (H)" },
    {
      id: "pencil",
      icon: <Pen className="w-5 h-5" />,
      label: "Pen Drawing (P)",
    },
    {
      id: "highlighter",
      icon: <Highlighter className="w-5 h-5" />,
      label: "Highlighter",
    },
    {
      id: "sticky",
      icon: <StickyNote className="w-5 h-5" />,
      label: "Sticky Note (N)",
    },
    { id: "shape", icon: <Square className="w-5 h-5" />, label: "Shapes (S)" },
    {
      id: "graph_menu",
      icon: <TrendingUp className="w-5 h-5" />,
      label: "Graphs (G)",
    },
    { id: "text", icon: <Type className="w-5 h-5" />, label: "Text Box (T)" },
    { id: "audio", icon: <Mic className="w-5 h-5 text-amber-500" />, label: "Voice Comment / Audio Pin" },
    { id: "stamp", icon: <Stamp className="w-5 h-5 text-emerald-500" />, label: "Stamps & Signatures" },
    { id: "math", icon: <Calculator className="w-5 h-5 text-indigo-500" />, label: "Math Equation Callout" },
    { id: "connector", icon: <CornerDownRight className="w-5 h-5" />, label: "Connector Line (L)" },
    { id: "laser", icon: <Flame className="w-5 h-5 text-rose-500" />, label: "Laser Pointer (Laser Trail)" },
    { id: "eraser", icon: <Eraser className="w-5 h-5" />, label: "Eraser (E)" },
  ];

  const topOffsetClass = isZenMode || isTopBarHidden ? "md:top-3" : "md:top-16 lg:md:top-20";

  // Reusable Bottom Bar Component with Zoom, Grid, Shortcuts, and Clear Modal
  const renderBottomControls = () => (
    <div className="fixed top-14 left-2.5 md:top-auto md:bottom-6 md:left-6 z-20 flex items-center gap-1 sm:gap-2 max-w-[calc(100vw-1.5rem)] overflow-x-auto scrollbar-none">
      {/* Zoom Controls */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center space-x-0.5 sm:space-x-1 shrink-0">
        <button
          onClick={onZoomOut}
          className="p-1 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <button
          onClick={onZoomReset}
          className="py-1 px-1 sm:px-2 text-[10px] sm:text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg text-center font-mono whitespace-nowrap min-w-[2.2rem] sm:min-w-[3rem] cursor-pointer"
          title="Reset Zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="p-1 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {/* Grid Mode Selection */}
      {!isPdfMode && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center space-x-0.5 sm:space-x-1 shrink-0">
          <button
            onClick={() => onChangeGridMode("dots")}
            className={`p-1.5 sm:p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
              gridMode === "dots"
                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-600/20 font-bold shadow-xs"
                : "text-slate-500 hover:bg-slate-100"
            }`}
            title="Dotted Canvas"
          >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="6" cy="6" r="1" fill="currentColor" />
              <circle cx="12" cy="6" r="1" fill="currentColor" />
              <circle cx="18" cy="6" r="1" fill="currentColor" />
              <circle cx="6" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="18" cy="12" r="1" fill="currentColor" />
              <circle cx="6" cy="18" r="1" fill="currentColor" />
              <circle cx="12" cy="18" r="1" fill="currentColor" />
              <circle cx="18" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => onChangeGridMode("math")}
            className={`p-1.5 sm:p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
              gridMode === "math"
                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-600/20 font-bold shadow-xs"
                : "text-slate-500 hover:bg-slate-100"
            }`}
            title="Math Grid (Graph Paper)"
          >
            <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => onChangeGridMode("none")}
            className={`p-1.5 sm:p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
              gridMode === "none"
                ? "bg-blue-50 text-blue-600 ring-1 ring-blue-600/20 font-bold shadow-xs"
                : "text-slate-500 hover:bg-slate-100"
            }`}
            title="Plain White Background"
          >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>
        </div>
      )}

      {/* Full Screen / Zen Mode Toggle */}
      {onToggleZenMode && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center shrink-0">
          <button
            onClick={onToggleZenMode}
            className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
            title={isZenMode ? "Exit Full Screen" : "Enter Full Screen (Zen Mode)"}
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* Sprint Timer Button */}
      {onToggleTimer && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center shrink-0">
          <button
            onClick={onToggleTimer}
            className={`p-1.5 sm:p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isTimerOpen
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "text-slate-500 hover:text-indigo-600 hover:bg-slate-100"
            }`}
            title="Sprint Timer & Stopwatch"
          >
            <TimerIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Button */}
      {onOpenShortcuts && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center shrink-0">
          <button
            onClick={onOpenShortcuts}
            className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* Clear Board Button */}
      {onOpenClearModal && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-1 sm:p-1.5 flex items-center shrink-0">
          <button
            onClick={onOpenClearModal}
            className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-all cursor-pointer"
            title="Clear Whiteboard Canvas"
          >
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <>
        {/* Subtle Floating Toggle Button when Toolbar is Collapsed */}
        <div
          className={`fixed md:absolute bottom-3 left-3 md:bottom-auto md:left-3 z-30 transition-all duration-300 ${topOffsetClass}`}
          id="whiteboard-toolbar-collapsed"
        >
          <button
            onClick={() => setIsCollapsed(false)}
            className="bg-white/95 backdrop-blur-md hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/90 shadow-md hover:shadow-lg rounded-2xl px-3 py-2.5 flex items-center space-x-2 text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 group"
            title="Show Toolbar"
          >
            <PenTool className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold">Tools</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </button>
        </div>

        {/* Floating Bottom Left Controls */}
        {renderBottomControls()}
      </>
    );
  }

  return (
    <>
      <div
        className={`fixed md:absolute bottom-3 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-3 md:bottom-auto z-30 flex flex-col items-center md:items-start space-y-2 transition-all duration-300 max-w-[98vw] ${topOffsetClass}`}
        id="whiteboard-toolbar"
      >
        {/* Primary Toolbar */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-xl p-1.5 flex flex-row md:flex-col items-center space-x-1 md:space-x-0 md:space-y-1 max-w-full overflow-x-auto scrollbar-none">
          {/* Hide Toolbar Header */}
          <div className="hidden md:flex items-center justify-between px-1 pt-0.5 pb-1 border-b border-slate-100/80 mb-0.5 w-full">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider pl-0.5">Tools</span>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-0.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Hide Toolbar"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          {tools.map((t) => {
            const isActive = activeTool === t.id;
            return (
              <div key={t.id} className="relative group shrink-0">
                <button
                  onClick={() => {
                    if (t.id === "graph_menu") {
                      onChangeTool(activeGraphMode as Tool);
                      setShowGraphMenu(true);
                      setShowShapeMenu(false);
                      setShowColorMenu(true);
                    } else {
                      onChangeTool(t.id as Tool);
                      setShowGraphMenu(false);
                      if (t.id === "shape") {
                        setShowShapeMenu(true);
                      } else {
                        setShowShapeMenu(false);
                      }
                      if (
                        [
                          "sticky",
                          "shape",
                          "pencil",
                          "highlighter",
                          "text",
                          "cartesian",
                          "numberline",
                          "advanced-cartesian",
                          "connector",
                        ].includes(t.id)
                      ) {
                        setShowColorMenu(true);
                      } else {
                        setShowColorMenu(false);
                      }
                    }
                  }}
                  className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-center transition-all ${
                    isActive || (t.id === "graph_menu" && isGraphTool)
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/15 scale-105"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  title={t.label}
                >
                  {t.id === "shape"
                    ? SHAPES.find((s) => s.type === activeShape)?.icon || t.icon
                    : t.id === "graph_menu"
                      ? GRAPH_TOOLS.find((g) => g.type === activeGraphMode)
                          ?.icon || t.icon
                      : t.icon}
                </button>

                {/* Desktop Tooltip */}
                <div className="hidden md:block absolute left-16 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap shadow-md">
                  {t.label}
                </div>
              </div>
            );
          })}
          
          {/* Mobile Collapse Button */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-1 border-l border-slate-100 pl-2"
            title="Hide Toolbar"
          >
            <ChevronLeft className="w-4 h-4 rotate-180 md:rotate-0" />
          </button>
        </div>

        {/* Floating Submenu Panels (Shapes Selector, Color Picker, Pen stroke) */}
        {showShapeMenu && activeTool === "shape" && (
          <div
            className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-xl p-2 flex flex-col space-y-1 absolute bottom-16 left-1/2 -translate-x-1/2 md:bottom-auto md:left-16 md:top-10 md:translate-x-0 w-44 max-h-[280px] sm:max-h-[320px] overflow-y-auto animate-fade-in z-40"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider sticky top-0 bg-white/95 z-10 border-b border-slate-50 mb-1">
              Select Shape
            </div>
            {SHAPES.map((s) => (
              <button
                key={s.type}
                onClick={() => {
                  onChangeShape(s.type);
                  setShowShapeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer ${
                  activeShape === s.type
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-slate-500">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {showGraphMenu && isGraphTool && (
          <div
            className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-xl p-2 flex flex-col space-y-1 absolute bottom-16 left-1/2 -translate-x-1/2 md:bottom-auto md:left-16 md:top-24 md:translate-x-0 w-52 max-h-[280px] sm:max-h-[320px] overflow-y-auto animate-fade-in z-40"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider sticky top-0 bg-white/95 z-10 border-b border-slate-50 mb-1">
              Select Graph
            </div>
            {GRAPH_TOOLS.map((g) => (
              <button
                key={g.type}
                onClick={() => {
                  onChangeTool(g.type);
                  setShowGraphMenu(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer ${
                  activeTool === g.type
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-slate-500">{g.icon}</span>
                <span>{g.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Color Picker Panel */}
        {(showColorMenu ||
          (activeTool === "select" &&
            hasColorableSelection &&
            !hideColorMenuOverride)) && (
          <div
            className={`bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-xl p-3 flex flex-col space-y-2.5 absolute transition-all duration-200 z-40 w-48 animate-fade-in ${
              showShapeMenu && activeTool === "shape"
                ? "bottom-[19.5rem] left-1/2 -translate-x-1/2 md:bottom-auto md:left-[17.5rem] md:top-10 md:translate-x-0"
                : showGraphMenu && isGraphTool
                  ? "bottom-[19.5rem] left-1/2 -translate-x-1/2 md:bottom-auto md:left-[19.5rem] md:top-24 md:translate-x-0"
                  : "bottom-16 left-1/2 -translate-x-1/2 md:bottom-auto md:left-16 md:top-10 md:translate-x-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Palette Color
              </span>
              <button
                onClick={() => {
                  setShowColorMenu(false);
                  setHideColorMenuOverride(true);
                }}
                className="text-slate-400 hover:text-slate-600 text-xs font-medium"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {STICKY_COLORS.map((color) => {
                const isSelected = activeColor === color.hex;
                const isDarkColor = [
                  "#e11d48",
                  "#f97316",
                  "#059669",
                  "#2563eb",
                  "#7c3aed",
                  "#64748b",
                  "#000000",
                ].includes(color.hex);
                return (
                  <button
                    key={color.hex}
                    onClick={() => onChangeColor(color.hex)}
                    className={`h-8 rounded-lg border relative transition-all ${
                      isSelected
                        ? "ring-2 ring-blue-600 ring-offset-1 border-white scale-105"
                        : "border-slate-200"
                    }`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  >
                    {isSelected && (
                      <div
                        className={`absolute inset-0 m-auto w-2 h-2 rounded-full shadow-xs ${isDarkColor ? "bg-white" : "bg-slate-800"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Stroke Thickness Panel for Drawing Tools */}
            {(activeTool === "pencil" || activeTool === "highlighter") && (
              <div className="border-t border-slate-100 pt-2.5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Line Size
                </span>
                <div className="flex items-center space-x-2">
                  {[2, 4, 8, 16].map((w) => (
                    <button
                      key={w}
                      onClick={() => onChangeStrokeWidth(w)}
                      className={`flex-1 py-1 rounded border text-xs font-semibold ${
                        strokeWidth === w
                          ? "bg-blue-50 text-blue-600 border-blue-200"
                          : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
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
      </div>

      {/* Floating Bottom Left Controls */}
      {renderBottomControls()}
    </>
  );
}
