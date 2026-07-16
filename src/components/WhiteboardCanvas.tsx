import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  BoardElement,
  Point,
  UserProfile,
  StickyElement,
  ShapeElement,
  TextElement,
  DrawingElement,
  ShapeType,
  ImageElement,
  Whiteboard,
} from "../types";
import Toolbar, { Tool } from "./Toolbar";
import StickyComponent from "./StickyComponent";
import ShapeComponent from "./ShapeComponent";
import TextComponent from "./TextComponent";
import ImageComponent from "./ImageComponent";
import LiveCursors from "./LiveCursors";
import {
  ChevronLeft,
  Share2,
  Copy,
  Check,
  Users,
  Sparkles,
  Keyboard,
  HelpCircle,
  X,
  Undo,
  Redo,
  Trash2,
  Lock,
  Unlock,
  Brain,
  Loader2,
  Wand2,
  Plus,
  PenTool,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import Markdown from "react-markdown";
import { secureEncrypt, secureDecrypt } from "../utils/crypto";

// Client-side image compression utility to handle high volumes of pasted images safely
// within Firestore documents without needing Firebase Storage.
const compressImage = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Downscale to max 800px on any dimension to minimize storage footprint
        const MAX_DIM = 800;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Output as highly-compressed JPEG (typically reduces size to 15KB - 40KB)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.65);
        resolve(compressedBase64);
      };
      img.onerror = () => resolve(null);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

// Helper to convert drawing points into a smooth SVG path (Quadratic Bezier)
function getSvgPathFromPoints(points: Point[]): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cp = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    d += ` Q ${points[i].x} ${points[i].y} ${cp.x} ${cp.y}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

interface WhiteboardCanvasProps {
  boardId: string;
  boardName: string;
  currentUser: UserProfile;
  onBackToDashboard: () => void;
}

export default function WhiteboardCanvas({
  boardId,
  boardName,
  currentUser,
  onBackToDashboard,
}: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas Viewport State
  const [panX, setPanX] = useState(window.innerWidth / 2 - 400);
  const [panY, setPanY] = useState(window.innerHeight / 2 - 300);
  const [zoom, setZoom] = useState(1);

  // Whiteboard Elements State
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [clipboardElements, setClipboardElements] = useState<BoardElement[]>([]);
  const [boardData, setBoardData] = useState<Whiteboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragSelectStart, setDragSelectStart] = useState<Point | null>(null);
  const [dragSelectEnd, setDragSelectEnd] = useState<Point | null>(null);
  const [elementStartPositions, setElementStartPositions] = useState<Record<string, any>>({});

  // Undo History state
  interface UndoAction {
    type: "add" | "delete" | "update";
    elementId: string;
    beforeData?: any;
    afterData?: any;
  }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const pushToUndo = (action: UndoAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]); // standard clear redo on new action
  };

  // Active Tool state
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [activeColor, setActiveColor] = useState("#fef08a"); // default yellow sticky color
  const [activeShape, setActiveShape] = useState<ShapeType>("rect");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [gridMode, setGridMode] = useState<"dots" | "math" | "none">("dots");

  // Interaction State flags
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [elementStartPos, setElementStartPos] = useState<Point>({ x: 0, y: 0 });
  const [elementStartSize, setElementStartSize] = useState<{
    w: number;
    h: number;
  }>({ w: 0, h: 0 });

  // Permission states for Teacher/Student lock controls
  const [showReadOnlyAlert, setShowReadOnlyAlert] = useState(false);
  const alertTimeoutRef = useRef<any>(null);
  const isTeacher = currentUser.role === "teacher";
  const studentsCanWrite = boardData?.studentsCanWrite !== false;
  const canWrite = isTeacher || studentsCanWrite;

  const isPdfBoard = boardName.startsWith("PDF: ");
  const [hasCentered, setHasCentered] = useState(false);

  useEffect(() => {
    if (isPdfBoard && elements.length > 0 && !hasCentered && containerRef.current) {
      const pdfPages = elements.filter((el) => el.id.startsWith("pdf-page-"));
      if (pdfPages.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pdfPages.forEach((el) => {
          const img = el as ImageElement;
          minX = Math.min(minX, img.x);
          minY = Math.min(minY, img.y);
          maxX = Math.max(maxX, img.x + img.width);
          maxY = Math.max(maxY, img.y + img.height);
        });

        const rect = containerRef.current.getBoundingClientRect();
        const contentWidth = maxX - minX;
        const targetZoom = Math.min(1.0, (rect.width * 0.9) / contentWidth);
        const newZoom = Math.max(0.4, targetZoom);

        setZoom(newZoom);
        setPanX(rect.width / 2 - (minX + contentWidth / 2) * newZoom);
        setPanY(60); 
        setHasCentered(true);
      }
    }
  }, [isPdfBoard, elements, hasCentered]);

  const triggerReadOnlyAlert = () => {
    setShowReadOnlyAlert(true);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => {
      setShowReadOnlyAlert(false);
    }, 3000);
  };

  // In-progress local drawings (drawn locally on canvas for zero-latency feedback)
  const [localDrawingPoints, setLocalDrawingPoints] = useState<Point[]>([]);

  // Drawing state tracking via refs to bypass React state-update asynchronous latency/closures
  const isDrawingRef = useRef(false);
  const drawingPointsRef = useRef<Point[]>([]);

  // Clear confirmation modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Copy share button state
  const [copiedLink, setCopiedLink] = useState(false);
  const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(true);

  // AI Classroom Assistant States
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [autoCorrectHandwriting, setAutoCorrectHandwriting] = useState(true);
  const [aiProblemInput, setAiProblemInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponseText, setAiResponseText] = useState("");
  const [aiResponseTitle, setAiResponseTitle] = useState("");
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    const raw = localStorage.getItem("user_gemini_api_key") || "";
    return secureDecrypt(raw, currentUser?.id);
  });
  const [showApiKey, setShowApiKey] = useState(false);

  // Sync / decrypt API key safely if current user's profile ID shifts
  useEffect(() => {
    const raw = localStorage.getItem("user_gemini_api_key") || "";
    if (raw) {
      setUserApiKey(secureDecrypt(raw, currentUser?.id));
    } else {
      setUserApiKey("");
    }
  }, [currentUser?.id]);

  // Fetch board elements in real time
  useEffect(() => {
    const elementsRef = collection(db, "whiteboards", boardId, "elements");
    const q = query(elementsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: BoardElement[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loaded.push({
          id: docSnap.id,
          ...data,
        } as BoardElement);
      });
      setElements(loaded);
    });

    return () => unsubscribe();
  }, [boardId]);

  // Fetch board metadata in real time
  useEffect(() => {
    const boardRef = doc(db, "whiteboards", boardId);
    const unsubscribe = onSnapshot(boardRef, (snapshot) => {
      if (snapshot.exists()) {
        setBoardData({
          id: snapshot.id,
          ...snapshot.data(),
        } as Whiteboard);
      }
    });

    return () => unsubscribe();
  }, [boardId]);

  // Clean selection when changing tools
  useEffect(() => {
    setSelectedId(null);
    setSelectedIds([]);
  }, [activeTool]);

  // Sync cursor movements to Firestore (throttled)
  const lastCursorUpdate = useRef<number>(0);
  const updateCursorPosition = (clientX: number, clientY: number) => {
    const now = Date.now();
    if (now - lastCursorUpdate.current < 120) return; // 120ms throttle is plenty smooth and saves Firebase quota
    lastCursorUpdate.current = now;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Convert mouse position to whiteboard panned coordinates so cursors align globally
    const canvasX = (mouseX - panX) / zoom;
    const canvasY = (mouseY - panY) / zoom;

    const cursorRef = doc(
      db,
      "whiteboards",
      boardId,
      "cursors",
      currentUser.id,
    );
    setDoc(
      cursorRef,
      {
        name: currentUser.name,
        color: currentUser.color,
        x: canvasX,
        y: canvasY,
        lastActive: now,
      },
      { merge: true },
    ).catch((err) => console.error("Cursor sync error:", err));
  };

  const containerRectRef = useRef<DOMRect | null>(null);

  // Convert screen coordinates into absolute canvas coordinates
  const screenToCanvasCoords = (clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    
    // Use cached rect if available during an interaction, otherwise fetch it
    const rect = containerRectRef.current || containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    return { x, y };
  };

  // Listen for custom Resize events from child elements
  useEffect(() => {
    const handleResizeStart = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { elementId, originalEvent } = customEvent.detail;
      const targetElement = elements.find((el) => el.id === elementId);
      if (!targetElement || targetElement.type === "drawing" || (targetElement as any).locked) return;

      setSelectedId(elementId);
      setIsResizing(true);
      setDragStart({ x: originalEvent.clientX, y: originalEvent.clientY });
      setElementStartSize({ w: targetElement.width, h: targetElement.height });
      setElementStartPos({ x: targetElement.x, y: targetElement.y });
    };

    window.addEventListener("init-resize", handleResizeStart);
    return () => window.removeEventListener("init-resize", handleResizeStart);
  }, [elements]);

  // Handle Paste events for Images!
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT"
      ) {
        return; // ignore if user is typing in a sticky note or text input
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const hasImage = Array.from(items).some(
        (item) => item.type.indexOf("image") !== -1,
      );
      if (hasImage && !canWrite) {
        e.preventDefault();
        triggerReadOnlyAlert();
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (!file) continue;

          e.preventDefault(); // stop any default paste browser behavior

          const base64Str = await compressImage(file);
          if (!base64Str) continue;

          // Place the image centered in the user's current view
          let x = 100;
          let y = 100;
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            // Map the screen center coordinates to current canvas scale & pan
            x = (centerX - panX) / zoom;
            y = (centerY - panY) / zoom;
          }

          const id = "img-" + Date.now() + Math.floor(Math.random() * 100);

          // Get dimensions dynamically to keep correct ratio and size
          const img = new Image();
          img.onload = () => {
            let w = img.naturalWidth || 300;
            let h = img.naturalHeight || 200;
            const maxDim = 320; // nice starting size on the board
            if (w > maxDim || h > maxDim) {
              const ratio = Math.min(maxDim / w, maxDim / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }

            const newImageElement: ImageElement = {
              id,
              type: "image",
              x: Math.round(x - w / 2),
              y: Math.round(y - h / 2),
              width: w,
              height: h,
              src: base64Str,
              zIndex: elements.length + 1,
            };

            setDoc(
              doc(db, "whiteboards", boardId, "elements", id),
              newImageElement,
            )
              .then(() => {
                pushToUndo({
                  type: "add",
                  elementId: id,
                  afterData: newImageElement,
                });
              })
              .catch((err) => console.error("Error saving pasted image:", err));
          };
          img.src = base64Str;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [boardId, elements.length, panX, panY, zoom, canWrite]);

  // Handle Board Canvas Mouse Events
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary clicks trigger actions
    if (e.button !== 0) return;

    if (
      !canWrite &&
      activeTool !== "select" &&
      activeTool !== "pan" &&
      !e.shiftKey
    ) {
      triggerReadOnlyAlert();
      return;
    }

    const coords = screenToCanvasCoords(e.clientX, e.clientY);

    // 1. Hand tool / Pan Canvas mode
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
    
    if (
      (activeTool === "pan" || e.shiftKey) &&
      activeTool !== "pencil" &&
      activeTool !== "highlighter"
    ) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // 2. Pencil / Highlighter drawing tool
    if (activeTool === "pencil" || activeTool === "highlighter") {
      isDrawingRef.current = true;
      drawingPointsRef.current = [coords];
      setLocalDrawingPoints([coords]);
      return;
    }

    // 4. Click to spawn Stickies, Shapes, and Text instantly
    if (activeTool === "sticky") {
      const id = "sticky-" + Date.now() + Math.floor(Math.random() * 100);
      const newSticky: StickyElement = {
        id,
        type: "sticky",
        x: coords.x - 75, // center horizontally on tap
        y: coords.y - 75,
        width: 150,
        height: 150,
        text: "",
        color: activeColor,
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, "whiteboards", boardId, "elements", id), newSticky);
      pushToUndo({ type: "add", elementId: id, afterData: newSticky });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    if (
      activeTool === "cartesian" ||
      activeTool === "numberline" ||
      activeTool === "advanced-cartesian"
    ) {
      const id = "shape-" + Date.now() + Math.floor(Math.random() * 100);

      let width = 300;
      let height = 300;
      if (activeTool === "numberline") {
        width = 420;
        height = 80;
      } else if (activeTool === "advanced-cartesian") {
        width = 400;
        height = 400;
      }

      const newShape: ShapeElement = {
        id,
        type: "shape",
        shapeType: activeTool,
        x: coords.x - width / 2,
        y: coords.y - height / 2,
        width,
        height,
        text: "",
        color: "#ffffff",
        borderColor: activeColor, // Axis/line color starts with activeColor
        zIndex: elements.length + 1,
        reactions: {},
        // Advanced cartesian properties
        ...(activeTool === "advanced-cartesian"
          ? {
              equation: "",
              equations: [],
              plottedPoints: "",
              cartesianRange: 5,
            }
          : {}),
      };
      setDoc(doc(db, "whiteboards", boardId, "elements", id), newShape);
      pushToUndo({ type: "add", elementId: id, afterData: newShape });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    if (activeTool === "shape") {
      const id = "shape-" + Date.now() + Math.floor(Math.random() * 100);

      const width = 150;
      const height = 150;

      const newShape: ShapeElement = {
        id,
        type: "shape",
        shapeType: activeShape,
        x: coords.x - width / 2,
        y: coords.y - height / 2,
        width,
        height,
        text: "",
        color: activeColor,
        borderColor: "#1e293b", // deep charcoal border
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, "whiteboards", boardId, "elements", id), newShape);
      pushToUndo({ type: "add", elementId: id, afterData: newShape });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    if (activeTool === "text") {
      const id = "text-" + Date.now() + Math.floor(Math.random() * 100);
      const newText: TextElement = {
        id,
        type: "text",
        x: coords.x - 100,
        y: coords.y - 25,
        width: 200,
        height: 50,
        text: "",
        color: activeColor === "#4b5563" ? "#4b5563" : "#1e293b",
        fontSize: 18,
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, "whiteboards", boardId, "elements", id), newText);
      pushToUndo({ type: "add", elementId: id, afterData: newText });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    // 5. Default selection click
    if (activeTool === "select") {
      // Clear selection if clicking on the empty background
      setSelectedId(null);
      setSelectedIds([]);
      setDragSelectStart(coords);
      setDragSelectEnd(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    updateCursorPosition(e.clientX, e.clientY);

    // 1. Panning canvas background
    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPanX((prev) => prev + dx);
      setPanY((prev) => prev + dy);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // 1.5. Drag-select rectangle active
    if (dragSelectStart) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      setDragSelectEnd(coords);

      const minX = Math.min(dragSelectStart.x, coords.x);
      const maxX = Math.max(dragSelectStart.x, coords.x);
      const minY = Math.min(dragSelectStart.y, coords.y);
      const maxY = Math.max(dragSelectStart.y, coords.y);

      // Select elements inside bounds
      const newlySelected = elements
        .filter((el) => {
          if (el.type === "drawing") {
            // Select drawing if any of its points lie inside selection box
            return el.points.some(
              (pt) =>
                pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY,
            );
          } else {
            // Normal bounding box elements (sticky notes, shapes, texts, images)
            const bounded = el as any;
            const elWidth = bounded.width || 150;
            const elHeight = bounded.height || 150;
            return (
              bounded.x < maxX &&
              bounded.x + elWidth > minX &&
              bounded.y < maxY &&
              bounded.y + elHeight > minY
            );
          }
        })
        .map((el) => el.id);

      setSelectedIds(newlySelected);
      setSelectedId(newlySelected[0] || null);
      return;
    }

    // 2. Drawing freehand locally
    if (
      isDrawingRef.current &&
      (activeTool === "pencil" || activeTool === "highlighter")
    ) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      
      // Optimization: Only add point if it moved at least 2 canvas pixels away from the last point
      // This prevents jitter and reduces data size significantly
      const lastPoint = drawingPointsRef.current[drawingPointsRef.current.length - 1];
      if (lastPoint && !e.shiftKey) {
        const dist = Math.sqrt(Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2));
        if (dist < 2) return;
      }

      let updated: Point[];

      if (e.shiftKey) {
        // Draw direct straight line from the first point to current freehand coords
        const start = drawingPointsRef.current[0] || coords;
        updated = [start, coords];
      } else {
        updated = [...drawingPointsRef.current, coords];
      }

      drawingPointsRef.current = updated;
      setLocalDrawingPoints(updated);
      return;
    }

    // 4. Moving selected elements
    if (isDragging && selectedIds.length > 0) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      // Update locally first for instantaneous rendering smoothness
      setElements((prev) =>
        prev.map((el) => {
          if (selectedIds.includes(el.id)) {
            const startPos = elementStartPositions[el.id];
            if (startPos) {
              if (el.type !== "drawing") {
                return {
                  ...el,
                  x: startPos.x + dx,
                  y: startPos.y + dy,
                };
              } else {
                return {
                  ...el,
                  points: startPos.points.map((p: any) => ({
                    x: p.x + dx,
                    y: p.y + dy,
                  })),
                };
              }
            }
          }
          return el;
        }),
      );
      return;
    }

    // 5. Resizing an element
    if (isResizing && selectedId) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id === selectedId && el.type !== "drawing") {
            if (el.type === "image") {
              const startW = elementStartSize.w;
              const startH = elementStartSize.h;
              const ratio = startW > 0 ? startH / startW : 1;
              const newW = Math.max(40, startW + dx);
              const newH = Math.max(40, newW * ratio);
              return {
                ...el,
                width: newW,
                height: newH,
              };
            }
            return {
              ...el,
              width: Math.max(60, elementStartSize.w + dx),
              height: Math.max(60, elementStartSize.h + dy),
            };
          }
          return el;
        }),
      );
      return;
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    containerRectRef.current = null;
    // 0. Finish drag selection box
    if (dragSelectStart) {
      setDragSelectStart(null);
      setDragSelectEnd(null);
      return;
    }

    // 1. Finish background panning
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // 2. Finish local drawing and save stroke as a single document to Firebase
    if (activeTool === "pencil" || activeTool === "highlighter") {
      isDrawingRef.current = false;
      const points = drawingPointsRef.current;
      if (points.length > 1) {
        const id = "draw-" + Date.now() + Math.floor(Math.random() * 100);
        const isHighlighter = activeTool === "highlighter";
        const newStroke: DrawingElement = {
          id,
          type: "drawing",
          points,
          color: isHighlighter ? `${activeColor}80` : activeColor, // add alpha opacity for highlighter
          width: isHighlighter ? strokeWidth * 2.5 : strokeWidth,
          isHighlighter,
          zIndex: elements.length + 1,
        };

        try {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", id),
            newStroke,
          );
          pushToUndo({ type: "add", elementId: id, afterData: newStroke });

          if (autoCorrectHandwriting && !isHighlighter) {
            triggerAiBeautification(newStroke);
          }
        } catch (err) {
          console.error("Error saving sketch to Firebase:", err);
        }
      }
      drawingPointsRef.current = [];
      setLocalDrawingPoints([]);
      return;
    }

    // 4. Update elements coordinates in Firestore on move end
    if (isDragging && selectedIds.length > 0) {
      setIsDragging(false);

      const movedElements = elements.filter(
        (el) => selectedIds.includes(el.id),
      );

      await Promise.all(
        movedElements.map(async (el) => {
          const startPos = elementStartPositions[el.id];
          if (startPos) {
            if (el.type !== "drawing") {
              const boundedEl = el as any;
              const hasMoved =
                boundedEl.x !== startPos.x || boundedEl.y !== startPos.y;
              if (hasMoved) {
                pushToUndo({
                  type: "update",
                  elementId: el.id,
                  beforeData: {
                    x: startPos.x,
                    y: startPos.y,
                  },
                  afterData: {
                    x: boundedEl.x,
                    y: boundedEl.y,
                  },
                });
                try {
                  await setDoc(
                    doc(db, "whiteboards", boardId, "elements", el.id),
                    {
                      x: boundedEl.x,
                      y: boundedEl.y,
                    },
                    { merge: true },
                  );
                } catch (err) {
                  console.error("Error updating moved element coordinates:", err);
                }
              }
            } else {
              const drawingEl = el as any;
              const hasMoved =
                drawingEl.points.length > 0 &&
                drawingEl.points[0].x !== startPos.points[0].x;
              if (hasMoved) {
                pushToUndo({
                  type: "update",
                  elementId: el.id,
                  beforeData: {
                    points: startPos.points,
                  },
                  afterData: {
                    points: drawingEl.points,
                  },
                });
                try {
                  await setDoc(
                    doc(db, "whiteboards", boardId, "elements", el.id),
                    {
                      points: drawingEl.points,
                    },
                    { merge: true },
                  );
                } catch (err) {
                  console.error("Error updating moved drawing coordinates:", err);
                }
              }
            }
          }
        }),
      );
      return;
    }

    // 5. Update size in Firestore on resize end
    if (isResizing && selectedId) {
      setIsResizing(false);
      const el = elements.find((e) => e.id === selectedId);
      if (el && el.type !== "drawing") {
        const hasResized =
          el.width !== elementStartSize.w || el.height !== elementStartSize.h;
        if (hasResized) {
          pushToUndo({
            type: "update",
            elementId: selectedId,
            beforeData: {
              width: elementStartSize.w,
              height: elementStartSize.h,
            },
            afterData: {
              width: el.width,
              height: el.height,
            },
          });
        }
        try {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", selectedId),
            {
              width: el.width,
              height: el.height,
            },
            { merge: true },
          );
        } catch (err) {
          console.error("Error updating resized element:", err);
        }
      }
      return;
    }
  };

  // Delete an element
  const handleDeleteElement = (id: string) => {
    const target = elements.find((el) => el.id === id);
    if (target) {
      pushToUndo({ type: "delete", elementId: id, beforeData: target });
    }

    deleteDoc(doc(db, "whiteboards", boardId, "elements", id))
      .then(() => {
        if (selectedId === id) setSelectedId(null);
      })
      .catch((err) => console.error("Error deleting element:", err));
  };

  // Undo the last action from the local stack
  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, action]);

    try {
      if (action.type === "add") {
        await deleteDoc(
          doc(db, "whiteboards", boardId, "elements", action.elementId),
        );
        if (selectedId === action.elementId) {
          setSelectedId(null);
        }
      } else if (action.type === "delete") {
        if (action.beforeData) {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", action.elementId),
            action.beforeData,
          );
        }
      } else if (action.type === "update") {
        if (action.beforeData) {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", action.elementId),
            action.beforeData,
            { merge: true },
          );
        }
      }
    } catch (err) {
      console.error("Error executing undo:", err);
    }
  };

  // Redo the last undone action
  const handleRedo = async () => {
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, action]);

    try {
      if (action.type === "add") {
        if (action.afterData) {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", action.elementId),
            action.afterData,
          );
        }
      } else if (action.type === "delete") {
        await deleteDoc(
          doc(db, "whiteboards", boardId, "elements", action.elementId),
        );
        if (selectedId === action.elementId) {
          setSelectedId(null);
        }
      } else if (action.type === "update") {
        if (action.afterData) {
          await setDoc(
            doc(db, "whiteboards", boardId, "elements", action.elementId),
            action.afterData,
            { merge: true },
          );
        }
      }
    } catch (err) {
      console.error("Error executing redo:", err);
    }
  };

  // Paste elements from clipboard with a slight offset
  const handlePaste = async () => {
    if (!canWrite || clipboardElements.length === 0) return;
    
    const offset = 40;
    const batch = writeBatch(db);
    const maxZ = elements.length > 0 ? Math.max(...elements.map(e => e.zIndex || 0)) : 0;
    const newPasteIds: string[] = [];
    const pastedElements: BoardElement[] = [];

    for (let i = 0; i < clipboardElements.length; i++) {
      const el = clipboardElements[i];
      const newId = `copy-${Math.random().toString(36).substring(2, 11)}`;
      
      const newEl = JSON.parse(JSON.stringify(el)) as BoardElement;
      newEl.id = newId;
      newEl.zIndex = maxZ + i + 1;
      newEl.updatedAt = Date.now();

      // Apply offset to positional elements
      if ('x' in newEl && 'y' in newEl) {
        newEl.x += (offset / zoom);
        newEl.y += (offset / zoom);
      }
      
      // Apply offset to drawing points
      if (newEl.type === 'drawing' && 'points' in newEl) {
        newEl.points = newEl.points.map((p: any) => ({ x: p.x + (offset / zoom), y: p.y + (offset / zoom) }));
      }

      const { id, ...data } = newEl;
      const elementRef = doc(db, "whiteboards", boardId, "elements", newId);
      batch.set(elementRef, data);
      newPasteIds.push(newId);
      pastedElements.push(newEl);
      
      pushToUndo({ type: "add", elementId: newId, afterData: newEl });
    }

    try {
      await batch.commit();
      setSelectedIds(newPasteIds);
      setSelectedId(null);
      setClipboardElements(pastedElements);
    } catch (err) {
      console.error("Error pasting elements:", err);
    }
  };

  // Keyboard shortcut listeners (standard whiteboards experience!)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT"
      ) {
        return; // ignore when typing
      }

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (!canWrite) {
          triggerReadOnlyAlert();
          return;
        }
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        if (!canWrite) {
          triggerReadOnlyAlert();
          return;
        }
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === "c") {
        const toCopy = elements.filter(el => selectedIds.includes(el.id) || el.id === (selectedId || ''));
        if (toCopy.length > 0) {
          setClipboardElements(JSON.parse(JSON.stringify(toCopy)));
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === "v") {
        if (clipboardElements.length > 0) {
          if (!canWrite) {
            triggerReadOnlyAlert();
            return;
          }
          handlePaste();
        }
        return;
      }

      if (key === "v" && !(e.ctrlKey || e.metaKey)) setActiveTool("select");
      else if (key === "h" && !(e.ctrlKey || e.metaKey)) setActiveTool("pan");
      else if (["p", "n", "s", "t", "l", "e", "g"].includes(key) && !(e.ctrlKey || e.metaKey)) {
        if (!canWrite) {
          triggerReadOnlyAlert();
          return;
        }
        if (key === "p") setActiveTool("pencil");
        else if (key === "n") setActiveTool("sticky");
        else if (key === "s") setActiveTool("shape");
        else if (key === "g") setActiveTool("cartesian");
        else if (key === "t") setActiveTool("text");
        else if (key === "e") setActiveTool("eraser");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!canWrite) {
          triggerReadOnlyAlert();
          return;
        }
        const idsToDelete = selectedId ? [selectedId, ...selectedIds] : selectedIds;
        const uniqueIds = Array.from(new Set(idsToDelete));
        
        if (uniqueIds.length > 0) {
          uniqueIds.forEach((id) => handleDeleteElement(id));
          setSelectedIds([]);
          setSelectedId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectedIds, elements, clipboardElements, canWrite, zoom, boardId, handleUndo, handleRedo]);

  // Click handler to select an element
  const handleSelectElement = (id: string, e: React.MouseEvent) => {
    // Eraser tool clicks delete elements immediately
    if (activeTool === "eraser") {
      e.stopPropagation();
      if (!canWrite) {
        triggerReadOnlyAlert();
        return;
      }
      handleDeleteElement(id);
      return;
    }

    if (activeTool !== "select") {
      // Let events bubble up so drawing or other canvas tools function correctly on top of elements!
      return;
    }

    e.stopPropagation();

    const target = elements.find((el) => el.id === id);
    if (!target) return;

    // Multi-selection with Shift key
    let updatedSelectedIds = [...selectedIds];
    if (e.shiftKey) {
      if (selectedIds.includes(id)) {
        updatedSelectedIds = selectedIds.filter((selected) => selected !== id);
      } else {
        updatedSelectedIds.push(id);
      }
    } else {
      if (!selectedIds.includes(id)) {
        updatedSelectedIds = [id];
      }
    }

    setSelectedIds(updatedSelectedIds);
    setSelectedId(id);

    if (canWrite) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });

      // Store starting position for every element in selection
      const positions: Record<string, any> = {};
      elements.forEach((el) => {
        if (updatedSelectedIds.includes(el.id)) {
          if ((el as any).locked) return;
          if (el.type !== "drawing") {
            const boundedEl = el as any;
            positions[el.id] = { x: boundedEl.x, y: boundedEl.y };
          } else {
            positions[el.id] = { points: [...el.points] };
          }
        }
      });
      setElementStartPositions(positions);
    }
  };

  // Update specific values of an element
  const handleUpdateElement = (id: string, updates: Partial<BoardElement>) => {
    const el = elements.find((e) => e.id === id);
    if (el) {
      // Create a 'beforeData' object containing only the keys that are being updated
      const beforeData: any = {};
      Object.keys(updates).forEach((key) => {
        beforeData[key] =
          (el as any)[key] !== undefined ? (el as any)[key] : null;
      });
      pushToUndo({
        type: "update",
        elementId: id,
        beforeData,
        afterData: updates,
      });
    }

    setDoc(doc(db, "whiteboards", boardId, "elements", id), updates, {
      merge: true,
    }).catch((err) => console.error("Error updating element:", err));
  };

  // Color change handler that also updates selected element colors
  const handleColorChange = async (color: string) => {
    setActiveColor(color);
    const activeSelection =
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
    if (activeSelection.length > 0) {
      await Promise.all(
        activeSelection.map(async (id) => {
          try {
            const el = elements.find((e) => e.id === id);
            if (
              el &&
              el.type === "shape" &&
              (el.shapeType === "cartesian" ||
                el.shapeType === "advanced-cartesian" ||
                el.shapeType === "numberline" ||
                el.shapeType === "line")
            ) {
              await setDoc(
                doc(db, "whiteboards", boardId, "elements", id),
                { borderColor: color },
                { merge: true },
              );
            } else {
              await setDoc(
                doc(db, "whiteboards", boardId, "elements", id),
                { color },
                { merge: true },
              );
            }
          } catch (err) {
            console.error("Error updating selected element color:", err);
          }
        }),
      );
    }
  };

  // Clear all items on the board
  const handleClearBoard = async () => {
    try {
      const batch = writeBatch(db);
      elements.forEach((el) => {
        const docRef = doc(db, "whiteboards", boardId, "elements", el.id);
        batch.delete(docRef);
      });
      await batch.commit();
      setSelectedId(null);
      setSelectedIds([]);
      setUndoStack([]);
      setRedoStack([]);
    } catch (err) {
      console.error("Error clearing whiteboard:", err);
    }
  };

  // Toggle student writing permission on the board (Teacher Only)
  const handleToggleStudentsCanWrite = async () => {
    if (!isTeacher) return;
    try {
      await setDoc(
        doc(db, "whiteboards", boardId),
        {
          studentsCanWrite: !studentsCanWrite,
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Error toggling student writing permissions:", err);
    }
  };

  // --- AI CLASSROOM ASSISTANT HELPER FUNCTIONS ---
  const triggerAiBeautification = async (stroke: DrawingElement) => {
    if (!userApiKey || !userApiKey.trim()) {
      return; // Do nothing silently if user has not provided their own API key
    }
    try {
      const res = await fetch("/api/ai/beautify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({ points: stroke.points }),
      });
      if (!res.ok) {
        const errData = await res.json();
        console.error("AI Beautification failed:", errData.error);
        return;
      }
      const data = await res.json();

      if (data.type === "shape" && data.shapeType) {
        // Delete original stroke
        await deleteDoc(doc(db, "whiteboards", boardId, "elements", stroke.id));

        // Add new shape element
        const shapeId = "shape-" + Date.now() + Math.floor(Math.random() * 100);
        const newShape: ShapeElement = {
          id: shapeId,
          type: "shape",
          shapeType: data.shapeType as ShapeType,
          x: data.bounds.x,
          y: data.bounds.y,
          width: Math.max(80, data.bounds.width),
          height: Math.max(80, data.bounds.height),
          text: "",
          color: activeColor,
          borderColor: "#1e293b",
          zIndex: elements.length + 10,
          reactions: {},
        };
        await setDoc(
          doc(db, "whiteboards", boardId, "elements", shapeId),
          newShape,
        );
        pushToUndo({ type: "add", elementId: shapeId, afterData: newShape });
      } else if (data.type === "text" && data.text) {
        // Delete original stroke
        await deleteDoc(doc(db, "whiteboards", boardId, "elements", stroke.id));

        // Add new text element
        const textId = "text-" + Date.now() + Math.floor(Math.random() * 100);
        const newText: TextElement = {
          id: textId,
          type: "text",
          x: data.bounds.x,
          y: data.bounds.y,
          width: Math.max(120, data.bounds.width + 40),
          height: Math.max(40, data.bounds.height + 20),
          text: data.text,
          color: "#1e293b",
          fontSize: 18,
          zIndex: elements.length + 10,
          reactions: {},
        };
        await setDoc(
          doc(db, "whiteboards", boardId, "elements", textId),
          newText,
        );
        pushToUndo({ type: "add", elementId: textId, afterData: newText });
      }
    } catch (err) {
      console.error("Error beautifying stroke:", err);
    }
  };

  const handleBeautifySelection = async () => {
    if (!userApiKey || !userApiKey.trim()) {
      alert(
        "AI features are exclusive to users with their own API keys. Please enter your Google AI Studio API Key in the AI Assistant settings panel (bottom right icon) to activate this feature.",
      );
      setIsAiPanelOpen(true);
      return;
    }

    const selectedDrawings = elements.filter(
      (el) => selectedIds.includes(el.id) && el.type === "drawing",
    ) as DrawingElement[];

    if (selectedDrawings.length === 0) {
      alert(
        "Please select one or more freehand drawing strokes on the canvas first (using the Select tool).",
      );
      return;
    }

    setIsAiLoading(true);
    try {
      const allPoints = selectedDrawings
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
        .flatMap((d) => d.points);

      const res = await fetch("/api/ai/beautify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({ points: allPoints }),
      });
      if (!res.ok) {
        const errData = await res.json();
        alert("AI Beautification failed: " + errData.error);
        return;
      }
      const data = await res.json();

      if (data.type === "shape" && data.shapeType) {
        await Promise.all(
          selectedDrawings.map((d) =>
            deleteDoc(doc(db, "whiteboards", boardId, "elements", d.id)),
          ),
        );

        const shapeId = "shape-" + Date.now() + Math.floor(Math.random() * 100);
        const newShape: ShapeElement = {
          id: shapeId,
          type: "shape",
          shapeType: data.shapeType as ShapeType,
          x: data.bounds.x,
          y: data.bounds.y,
          width: Math.max(100, data.bounds.width),
          height: Math.max(100, data.bounds.height),
          text: "",
          color: activeColor,
          borderColor: "#1e293b",
          zIndex: elements.length + 10,
          reactions: {},
        };
        await setDoc(
          doc(db, "whiteboards", boardId, "elements", shapeId),
          newShape,
        );
        setSelectedIds([shapeId]);
        setSelectedId(shapeId);
      } else if (data.type === "text" && data.text) {
        await Promise.all(
          selectedDrawings.map((d) =>
            deleteDoc(doc(db, "whiteboards", boardId, "elements", d.id)),
          ),
        );

        const textId = "text-" + Date.now() + Math.floor(Math.random() * 100);
        const newText: TextElement = {
          id: textId,
          type: "text",
          x: data.bounds.x,
          y: data.bounds.y,
          width: Math.max(150, data.bounds.width + 40),
          height: Math.max(50, data.bounds.height + 20),
          text: data.text,
          color: "#1e293b",
          fontSize: 18,
          zIndex: elements.length + 10,
          reactions: {},
        };
        await setDoc(
          doc(db, "whiteboards", boardId, "elements", textId),
          newText,
        );
        setSelectedIds([textId]);
        setSelectedId(textId);
      } else {
        alert(
          "AI couldn't clearly recognize this as a simple shape or text. Try writing or drawing more clearly!",
        );
      }
    } catch (err) {
      console.error("Error beautifying selection:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSolveProblem = async (customPrompt?: string) => {
    if (!userApiKey || !userApiKey.trim()) {
      alert(
        "AI features are exclusive to users with their own API keys. Please enter your Google AI Studio API Key in the AI Assistant settings panel (bottom right icon) to activate this feature.",
      );
      setIsAiPanelOpen(true);
      return;
    }

    if (selectedIds.length === 0) {
      alert(
        "Please select the specific parts or equations on the whiteboard first (using the Select tool) to activate the solver.",
      );
      return;
    }
    setIsAiLoading(true);
    setAiResponseText("");
    setAiResponseTitle("");

    try {
      const targetElements = elements.filter((el) =>
        selectedIds.includes(el.id),
      );

      const res = await fetch("/api/ai/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({
          elements: targetElements,
          prompt: customPrompt || aiProblemInput,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        alert("AI Solver failed: " + errData.error);
        return;
      }

      const data = await res.json();
      setAiResponseText(data.explanation);
      setAiResponseTitle(data.suggestedTitle);

      if (data.elements && data.elements.length > 0) {
        let centerX = 100;
        let centerY = 100;
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          centerX = (rect.width / 2 - panX) / zoom;
          centerY = (rect.height / 2 - panY) / zoom;
        }

        const shiftX = Math.round(centerX - 400);
        const shiftY = Math.round(centerY - 200);

        const createdIds: string[] = [];
        await Promise.all(
          data.elements.map(async (el: any) => {
            const id = el.id.startsWith("ai-")
              ? el.id
              : `ai-${el.id}-${Date.now()}`;
            const posX = Math.round((el.x || 0) + shiftX);
            const posY = Math.round((el.y || 0) + shiftY);

            const baseElement: any = {
              id,
              type: el.type,
              x: posX,
              y: posY,
              width: el.width || 120,
              height: el.height || 80,
              text: el.text || "",
              zIndex: el.zIndex || elements.length + 10,
              reactions: {},
            };

            if (el.type === "shape") {
              baseElement.shapeType = el.shapeType || "rect";
              baseElement.color = el.color || "#bfdbfe";
              baseElement.borderColor = el.borderColor || "#1e293b";
            } else if (el.type === "sticky") {
              baseElement.color = el.color || "#fef08a";
            } else if (el.type === "text") {
              baseElement.color = el.color || "#1e293b";
              baseElement.fontSize = el.fontSize || 16;
            }
            await setDoc(
              doc(db, "whiteboards", boardId, "elements", id),
              baseElement,
            );
            createdIds.push(id);
          }),
        );

        if (createdIds.length > 0) {
          setSelectedIds(createdIds);
          setSelectedId(createdIds[0]);
        }
      }
    } catch (err) {
      console.error("Error solving problem:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(3, prev + 0.15));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.15, prev - 0.15));
  const handleZoomReset = () => setZoom(1);

  // Mouse wheel zoom (intuitive infinite workspace feel!)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.05;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const wheelValue = e.deltaY;
    const zoomFactor = wheelValue < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const newZoom = Math.min(3, Math.max(0.15, zoom * zoomFactor));

    // Translation logic: center zoom calculation on current cursor coordinate
    const canvasMouseX = (mouseX - panX) / zoom;
    const canvasMouseY = (mouseY - panY) / zoom;

    setPanX(mouseX - canvasMouseX * newZoom);
    setPanY(mouseY - canvasMouseY * newZoom);
    setZoom(newZoom);
  };

  // Share Board link copying
  const copyBoardLink = () => {
    const link = `${window.location.origin}/?board=${boardId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div
      className="flex-1 h-screen relative flex flex-col bg-[#F3F4F6] overflow-hidden"
      id="whiteboard-workspace"
    >
      {/* Upper Navigation Control Bar */}
      <nav className="bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between z-30 shadow-xs absolute top-0 left-0 right-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToDashboard}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center space-x-1 font-bold text-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">All Boards</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

          <div>
            <h2 className="text-sm font-semibold leading-tight text-slate-900 flex items-center space-x-1.5">
              <span>{boardName}</span>
              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold">
                Active
              </span>
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">
              Workspace ID: {boardId.slice(0, 8)}...
            </p>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold text-xs transition-all cursor-pointer ${
              undoStack.length > 0
                ? "bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-950 hover:scale-[1.02] active:scale-[0.98]"
                : "text-slate-300 bg-slate-50 border border-slate-150 cursor-not-allowed"
            }`}
            title="Undo last action (Ctrl+Z)"
          >
            <Undo
              className={`w-3.5 h-3.5 ${undoStack.length > 0 ? "text-slate-600" : "text-slate-300"}`}
            />
            <span>Undo</span>
            {undoStack.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-extrabold">
                {undoStack.length}
              </span>
            )}
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold text-xs transition-all cursor-pointer ${
              redoStack.length > 0
                ? "bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-950 hover:scale-[1.02] active:scale-[0.98]"
                : "text-slate-300 bg-slate-50 border border-slate-150 cursor-not-allowed"
            }`}
            title="Redo last action (Ctrl+Y)"
          >
            <Redo
              className={`w-3.5 h-3.5 ${redoStack.length > 0 ? "text-slate-600" : "text-slate-300"}`}
            />
            <span>Redo</span>
            {redoStack.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-extrabold">
                {redoStack.length}
              </span>
            )}
          </button>
        </div>

        {/* Current Collaborator Profile details and Share action */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-100 px-2.5 py-1 rounded-full text-xs font-bold text-slate-600 border border-slate-200">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: currentUser.color }}
            />
            <span>{currentUser.name} (You)</span>
          </div>

          {/* Teacher control to allow/disallow student writing */}
          {isTeacher ? (
            <button
              onClick={handleToggleStudentsCanWrite}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold text-xs transition-all cursor-pointer border ${
                studentsCanWrite
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 animate-pulse"
              }`}
              title={
                studentsCanWrite
                  ? "Click to lock board for students (Read Only)"
                  : "Click to unlock board for students (Collaborative)"
              }
            >
              {studentsCanWrite ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Students Can Write</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Students Locked</span>
                </>
              )}
            </button>
          ) : (
            /* Student status indicator */
            <div
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold text-xs border ${
                studentsCanWrite
                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {studentsCanWrite ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Collaborative Mode</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                  <span>View Only Mode</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={`px-3.5 py-1.5 rounded text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              isAiPanelOpen
                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-md border-purple-600 scale-102"
                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs"
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${isAiPanelOpen ? "text-white animate-pulse" : "text-purple-600"}`}
            />
            <span>AI Assistant</span>
          </button>

          <button
            onClick={copyBoardLink}
            className={`px-3.5 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
              copiedLink
                ? "bg-green-500 text-white shadow-sm"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            }`}
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Canvas</span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* Floating vertical sidebar toolbar */}
      <Toolbar
        activeTool={activeTool}
        onChangeTool={(tool) => {
          if (!canWrite && tool !== "select" && tool !== "pan") {
            triggerReadOnlyAlert();
            return;
          }
          setActiveTool(tool);
        }}
        activeColor={activeColor}
        onChangeColor={handleColorChange}
        activeShape={activeShape}
        onChangeShape={setActiveShape}
        onClearBoard={() => {
          if (!canWrite) {
            triggerReadOnlyAlert();
            return;
          }
          setShowClearConfirm(true);
        }}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        strokeWidth={strokeWidth}
        onChangeStrokeWidth={setStrokeWidth}
        gridMode={gridMode}
        onChangeGridMode={setGridMode}
        hasSelection={selectedIds.length > 0 || selectedId !== null}
        isPdfMode={isPdfBoard}
      />

      {/* Main Interactive Interactive Zoomable & Pannable Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full relative outline-none select-none ${
          activeTool === "pan"
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-default"
        }`}
        style={{
          // Grid dot, math grid, or plain background pattern that scales and translates correctly
          backgroundImage:
            isPdfBoard || gridMode === "none"
              ? "none"
              : gridMode === "math"
                ? `linear-gradient(to right, rgba(203, 213, 225, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(203, 213, 225, 0.45) 1px, transparent 1px)`
                : `radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${panX}px ${panY}px`,
          backgroundColor: isPdfBoard ? "#e2e8f0" : gridMode === "none" ? "#ffffff" : "#f8fafc",
        }}
      >
        {/* Render Layer of Infinite Board Elements (Shapes, Drawings, Connectors, cursors) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 1. Interactive DOM elements Layer (Sticky notes, Shapes, Textboxes) */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {elements.map((el) => {
              const isSelected = selectedIds.includes(el.id);
              const isInteractive =
                activeTool === "select" || activeTool === "eraser";

              // Renders Sticky Note Elements
              if (el.type === "sticky") {
                return (
                  <div
                    key={el.id}
                    className={
                      isInteractive
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }
                  >
                    <StickyComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) =>
                        handleUpdateElement(el.id, updates)
                      }
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={
                        isDragging || isResizing || selectedIds.length > 1
                      }
                      activeTool={activeTool}
                      canWrite={canWrite}
                    />
                  </div>
                );
              }

              // Renders Shape Elements
              if (el.type === "shape") {
                return (
                  <div
                    key={el.id}
                    className={
                      isInteractive
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }
                  >
                    <ShapeComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) =>
                        handleUpdateElement(el.id, updates)
                      }
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={
                        isDragging || isResizing || selectedIds.length > 1
                      }
                      activeTool={activeTool}
                      canWrite={canWrite}
                    />
                  </div>
                );
              }

              // Renders Text Box Elements
              if (el.type === "text") {
                return (
                  <div
                    key={el.id}
                    className={
                      isInteractive
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }
                  >
                    <TextComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) =>
                        handleUpdateElement(el.id, updates)
                      }
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={
                        isDragging || isResizing || selectedIds.length > 1
                      }
                      activeTool={activeTool}
                      canWrite={canWrite}
                    />
                  </div>
                );
              }

              // Renders Image Elements
              if (el.type === "image") {
                const isPdfPage = el.id.startsWith("pdf-page-");
                return (
                  <div
                    key={el.id}
                    className={
                      isInteractive && !isPdfPage
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }
                  >
                    <ImageComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) =>
                        handleUpdateElement(el.id, updates)
                      }
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={
                        isDragging || isResizing || selectedIds.length > 1
                      }
                      activeTool={activeTool}
                      canWrite={canWrite}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* Drag Selection Box Overlay */}
          {dragSelectStart && dragSelectEnd && (
            <div
              className="absolute border border-blue-500 bg-blue-500/10 rounded-sm pointer-events-none z-50"
              style={{
                left: Math.min(dragSelectStart.x, dragSelectEnd.x),
                top: Math.min(dragSelectStart.y, dragSelectEnd.y),
                width: Math.abs(dragSelectStart.x - dragSelectEnd.x),
                height: Math.abs(dragSelectStart.y - dragSelectEnd.y),
              }}
            />
          )}

          {/* 2. Global Svg Vector Overlay (Connector Lines, Drawings, Sketches) */}
          <svg
            width="100%"
            height="100%"
            className="absolute inset-0 overflow-visible pointer-events-none z-20"
          >
            {/* Render saved drawings */}
            {elements
              .filter((el) => el.type === "drawing")
              .map((el: any) => {
                const pathData = getSvgPathFromPoints(el.points);
                const isSelected = selectedIds.includes(el.id);
                const isInteractive =
                  activeTool === "select" || activeTool === "eraser";
                return (
                  <g
                    key={el.id}
                    className={
                      isInteractive
                        ? "pointer-events-auto cursor-pointer"
                        : "pointer-events-none"
                    }
                    onMouseDown={(e) => handleSelectElement(el.id, e)}
                  >
                    {/* Invisible thicker hit area for easier clicking */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={el.width + 16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={pathData}
                      fill="none"
                      stroke={el.color}
                      strokeWidth={el.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={
                        el.isHighlighter
                          ? "mix-blend-multiply"
                          : "drop-shadow-sm"
                      }
                      style={
                        isSelected
                          ? { filter: "drop-shadow(0 0 4px #3b82f6)" }
                          : {}
                      }
                    />
                  </g>
                );
              })}
            {/* Render current local drawing */}
            {localDrawingPoints.length > 0 && (
              <path
                d={getSvgPathFromPoints(localDrawingPoints)}
                fill="none"
                stroke={
                  activeTool === "highlighter"
                    ? `${activeColor}80`
                    : activeColor
                }
                strokeWidth={
                  activeTool === "highlighter" ? strokeWidth * 2.5 : strokeWidth
                }
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  activeTool === "highlighter"
                    ? "mix-blend-multiply"
                    : "drop-shadow-sm"
                }
              />
            )}
          </svg>

          {/* 3. Real-Time Collaborative Cursors Tracker Overlay */}
          <LiveCursors boardId={boardId} currentUser={currentUser} />
        </div>
      </div>

      {/* Interactive Shortcuts and Quick-Tools Widget */}
      <div
        className="absolute bottom-6 right-6 z-30 flex flex-col items-end"
        id="shortcuts-panel"
      >
        {!isShortcutsExpanded ? (
          <button
            onClick={() => setIsShortcutsExpanded(true)}
            className="bg-white text-slate-700 hover:text-blue-600 border border-slate-200 shadow-lg rounded-full p-3.5 flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95 group relative"
            title="Show Keyboard Shortcuts"
          >
            <Keyboard className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500"></span>
            </span>
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-80 p-4 animate-scale-up text-slate-800 flex flex-col space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Keyboard className="w-4 h-4 text-blue-600" />
                <span>Shortcuts & Quick Tools</span>
              </div>
              <button
                onClick={() => setIsShortcutsExpanded(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Collapse Panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Intro description */}
            <p className="text-[11px] text-slate-500 leading-normal">
              Press the hotkey on your keyboard or click the buttons below to
              switch tools instantly:
            </p>

            {/* Interactive Shortcut Row List */}
            <div className="flex flex-col space-y-1">
              {[
                { key: "V", label: "Select & Edit", tool: "select" },
                { key: "H", label: "Pan Canvas", tool: "pan" },
                { key: "P", label: "Pen / Ink Drawing", tool: "pencil" },
                { key: "N", label: "Sticky Note", tool: "sticky" },
                { key: "S", label: "Shapes Selector", tool: "shape" },
                { key: "T", label: "Text Box", tool: "text" },
                { key: "E", label: "Eraser Tool", tool: "eraser" },
              ].map((item) => {
                const isActive = activeTool === item.tool;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActiveTool(item.tool as Tool);
                    }}
                    className={`group w-full flex items-center justify-between p-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-xs"
                        : "hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <kbd
                        className={`min-w-[20px] h-5 px-1.5 py-0.5 font-mono text-[10px] font-bold border rounded shadow-xs flex items-center justify-center transition-colors ${
                          isActive
                            ? "bg-blue-600 border-blue-700 text-white"
                            : "bg-white border-slate-300 text-slate-600 group-hover:bg-slate-100"
                        }`}
                      >
                        {item.key}
                      </kbd>
                      <span className="font-semibold">{item.label}</span>
                    </div>
                    {isActive && (
                      <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-95">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* General Non-Tool Shortcuts */}
            <div className="border-t border-slate-100 pt-2.5 flex flex-col space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                Other Commands
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">
                  Delete Selected Item
                </span>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">
                    Del
                  </kbd>
                  <span className="text-[10px] text-slate-400">or</span>
                  <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">
                    ⌫
                  </kbd>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">
                  Paste Board Images
                </span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">
                  Ctrl + V
                </kbd>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">
                  Undo Last Action
                </span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">
                  Ctrl + Z
                </kbd>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Read-Only Mode Floating Notice Banner */}
      {showReadOnlyAlert && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 bg-amber-500 text-white font-bold text-xs px-5 py-3 rounded-full shadow-2xl z-50 flex items-center space-x-2 border border-amber-400 animate-bounce">
          <Lock className="w-3.5 h-3.5 text-white" />
          <span>
            View-Only Mode: The teacher has locked writing access on this board.
          </span>
        </div>
      )}

      {/* Clear Board Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 flex flex-col space-y-4 animate-scale-up text-slate-800">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold">Clear Entire Whiteboard?</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete all elements, shapes, drawings,
              and connection lines on this board? This action is permanent,
              synchronizes for all users in real time, and cannot be undone.
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowClearConfirm(false);
                  await handleClearBoard();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-sm shadow-rose-600/10"
              >
                Clear Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Classroom Assistant Sliding/Floating Side Panel */}
      {isAiPanelOpen && (
        <div
          className="absolute right-4 top-16 bottom-24 w-[420px] bg-white rounded-2xl border border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden text-slate-800"
          id="ai-assistant-panel"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-purple-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-purple-600 text-white rounded-lg">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  AI Tutor & Problem Solver
                </h3>
                <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">
                  Gemini classroom assistant
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAiPanelOpen(false)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Custom API Key Section */}
            <div className="space-y-2.5 bg-gradient-to-r from-purple-50/70 to-indigo-50/70 p-3.5 rounded-xl border border-purple-100/65 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <Key className="w-3.5 h-3.5 text-purple-600" />
                  <span>Personal API limits</span>
                </h4>
                <span
                  className={`text-[9px] px-1.5 py-0.5 font-bold rounded-md ${
                    userApiKey
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}
                >
                  {userApiKey ? "AI Features Active" : "AI Features Locked"}
                </span>
              </div>

              <p className="text-[10px] text-slate-500 leading-normal">
                AI Classroom Assistant features are exclusive to users with
                their own Google API key. Enter your personal, 100% free{" "}
                <strong>Google AI Studio Key</strong> below. This key is saved
                strictly inside your local browser storage.
              </p>

              {/* Secure explanation and quick-link */}
              <div className="bg-white/80 border border-purple-100/50 rounded-lg p-2.5 space-y-2">
                <div className="text-[9px] text-slate-400 flex items-start space-x-1.5 leading-normal">
                  <span className="shrink-0 text-[10px] leading-none">🔒</span>
                  <span>
                    Note: Because API keys are secure developer credentials,
                    they cannot be programmatically read from your Google
                    account session.
                  </span>
                </div>
                <div className="flex justify-start">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold py-1 px-2.5 rounded-md text-[9px] shadow-sm transition-all cursor-pointer"
                  >
                    <span>Get Free API Key from Google AI Studio</span>
                    <svg
                      className="w-2.5 h-2.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              </div>

              <div className="relative mt-1 flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder="AI_Studio_API_Key..."
                  value={userApiKey}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setUserApiKey(val);
                    if (val) {
                      const encrypted = secureEncrypt(val, currentUser?.id);
                      localStorage.setItem("user_gemini_api_key", encrypted);
                    } else {
                      localStorage.removeItem("user_gemini_api_key");
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 pr-20 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-colors placeholder:text-slate-400 text-slate-700"
                />
                <div className="absolute right-2 flex items-center space-x-1.5">
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    type="button"
                    className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                    title={showApiKey ? "Hide Key" : "Show Key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {userApiKey && (
                    <button
                      onClick={() => {
                        setUserApiKey("");
                        localStorage.removeItem("user_gemini_api_key");
                      }}
                      className="text-rose-500 hover:text-rose-700 text-[10px] font-bold cursor-pointer p-0.5"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Handwriting Options */}
            <div className="space-y-2.5">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Handwriting Assist
              </h4>

              {/* Toggle autocorrect */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-start space-x-2.5">
                  <PenTool className="w-4 h-4 text-purple-600 mt-0.5 animate-pulse" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      Auto-Correct Drawings
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Automatically replace messy pencil drawings with crisp
                      geometric shapes or clean typed text.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setAutoCorrectHandwriting(!autoCorrectHandwriting)
                  }
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                    autoCorrectHandwriting ? "bg-purple-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-sm transform duration-200 ${
                      autoCorrectHandwriting ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Manual Beautify Selection */}
              <button
                onClick={handleBeautifySelection}
                disabled={isAiLoading}
                className="w-full flex items-center justify-center space-x-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-semibold py-2 rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Beautify Selected Handwriting</span>
              </button>
            </div>

            {/* Solver Options */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Visual Math Solver
                </h4>
                {selectedIds.length > 0 ? (
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold rounded-full border border-green-200 flex items-center space-x-1 animate-pulse">
                    <span>●</span>
                    <span>{selectedIds.length} items selected</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200">
                    Selection required
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 leading-normal">
                To keep solving safe and precise, the solver only processes
                specific elements you select.
              </div>

              {selectedIds.length === 0 ? (
                <div className="p-3 bg-amber-50/75 border border-amber-200/50 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-amber-950 flex items-center space-x-1.5">
                    <span>💡 How to Solve:</span>
                  </div>
                  <p className="text-[10.5px] text-amber-800 leading-relaxed">
                    Use the <strong>Select tool (pointer icon)</strong> to click
                    or drag a selection box around your handwritten formulas,
                    math notes, or drawings, then click below to activate the
                    solver.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-indigo-950">
                    🎯 Selected Elements Ready
                  </div>
                  <p className="text-[10.5px] text-indigo-800 leading-relaxed">
                    The solver will analyze the {selectedIds.length} selected
                    element(s) to solve the math and generate editable diagrams
                    in your view.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Specify Custom Problem (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Tom has 12 apples, and Sarah has twice as many. Show the bar model and find total apples."
                  value={aiProblemInput}
                  onChange={(e) => setAiProblemInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-colors resize-none placeholder:text-slate-400 text-slate-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSolveProblem()}
                  disabled={isAiLoading || selectedIds.length === 0}
                  className="flex items-center justify-center space-x-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAiLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Brain className="w-3.5 h-3.5" />
                  )}
                  <span>Solve Selected</span>
                </button>

                <button
                  onClick={() =>
                    handleSolveProblem(
                      "Solve and draw a Singapore Math bar model illustration",
                    )
                  }
                  disabled={isAiLoading || selectedIds.length === 0}
                  className="flex items-center justify-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAiLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Singapore Model</span>
                </button>
              </div>
            </div>

            {/* AI Solver output response detail */}
            {(aiResponseText || isAiLoading) && (
              <div className="space-y-2 pt-3 border-t border-slate-100 flex flex-col min-h-[160px]">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>Solution Output</span>
                  {isAiLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                  )}
                </h4>

                {isAiLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-8 text-center space-y-2 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                    <p className="text-xs font-bold text-slate-700">
                      Tutor thinking...
                    </p>
                    <p className="text-[10px] text-slate-500 max-w-xs px-4">
                      Analyzing whiteboard elements and generating visual
                      Singapore Math diagrams.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 p-3.5 bg-purple-50/50 border border-purple-100 rounded-xl overflow-y-auto max-h-[250px] text-xs leading-relaxed text-slate-700">
                    {aiResponseTitle && (
                      <div className="font-bold text-purple-900 mb-2 border-b border-purple-100/50 pb-1 flex items-center space-x-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>{aiResponseTitle}</span>
                      </div>
                    )}
                    <div className="markdown-body">
                      <Markdown>{aiResponseText}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
