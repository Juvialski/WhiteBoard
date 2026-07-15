import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  doc, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  BoardElement, 
  Point, 
  UserProfile, 
  StickyElement, 
  ShapeElement, 
  TextElement, 
  DrawingElement, 
  ConnectorElement,
  ShapeType,
  ImageElement
} from '../types';
import Toolbar, { Tool } from './Toolbar';
import StickyComponent from './StickyComponent';
import ShapeComponent from './ShapeComponent';
import TextComponent from './TextComponent';
import ImageComponent from './ImageComponent';
import ConnectorRenderer from './ConnectorRenderer';
import LiveCursors from './LiveCursors';
import { ChevronLeft, Share2, Copy, Check, Users, Sparkles, Keyboard, HelpCircle, X, Undo } from 'lucide-react';

// Client-side image compression utility to handle high volumes of pasted images safely
// within Firestore documents without needing Firebase Storage.
const compressImage = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Output as highly-compressed JPEG (typically reduces size to 15KB - 40KB)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
        resolve(compressedBase64);
      };
      img.onerror = () => resolve(null);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

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
  onBackToDashboard
}: WhiteboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas Viewport State
  const [panX, setPanX] = useState(window.innerWidth / 2 - 400);
  const [panY, setPanY] = useState(window.innerHeight / 2 - 300);
  const [zoom, setZoom] = useState(1);

  // Whiteboard Elements State
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Undo History state
  interface UndoAction {
    type: 'add' | 'delete' | 'update';
    elementId: string;
    beforeData?: any;
  }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const pushToUndo = (action: UndoAction) => {
    setUndoStack((prev) => [...prev, action]);
  };

  // Active Tool state
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [activeColor, setActiveColor] = useState('#fef08a'); // default yellow sticky color
  const [activeShape, setActiveShape] = useState<ShapeType>('rect');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [gridMode, setGridMode] = useState<'dots' | 'math'>('dots');

  // Interaction State flags
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [elementStartPos, setElementStartPos] = useState<Point>({ x: 0, y: 0 });
  const [elementStartSize, setElementStartSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // In-progress local drawings (drawn locally on canvas for zero-latency feedback)
  const [localDrawingPoints, setLocalDrawingPoints] = useState<Point[]>([]);
  
  // Drawing state tracking via refs to bypass React state-update asynchronous latency/closures
  const isDrawingRef = useRef(false);
  const drawingPointsRef = useRef<Point[]>([]);
  
  // Dynamic temporary connector line state
  const [tempConnector, setTempConnector] = useState<{ startX: number; startY: number; fromId?: string; currentX: number; currentY: number } | null>(null);

  // Copy share button state
  const [copiedLink, setCopiedLink] = useState(false);
  const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(true);

  // Fetch board elements in real time
  useEffect(() => {
    const elementsRef = collection(db, 'whiteboards', boardId, 'elements');
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

  // Clean selection when changing tools
  useEffect(() => {
    setSelectedId(null);
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

    const cursorRef = doc(db, 'whiteboards', boardId, 'cursors', currentUser.id);
    setDoc(cursorRef, {
      name: currentUser.name,
      color: currentUser.color,
      x: canvasX,
      y: canvasY,
      lastActive: now,
    }, { merge: true }).catch((err) => console.error('Cursor sync error:', err));
  };

  // Convert screen coordinates into absolute canvas coordinates
  const screenToCanvasCoords = (clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    return { x, y };
  };

  // Listen for custom Resize events from child elements
  useEffect(() => {
    const handleResizeStart = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { elementId, originalEvent } = customEvent.detail;
      const targetElement = elements.find(el => el.id === elementId);
      if (!targetElement || targetElement.type === 'drawing' || targetElement.type === 'connector') return;

      setSelectedId(elementId);
      setIsResizing(true);
      setDragStart({ x: originalEvent.clientX, y: originalEvent.clientY });
      setElementStartSize({ w: targetElement.width, h: targetElement.height });
      setElementStartPos({ x: targetElement.x, y: targetElement.y });
    };

    window.addEventListener('init-resize', handleResizeStart);
    return () => window.removeEventListener('init-resize', handleResizeStart);
  }, [elements]);

  // Handle Paste events for Images!
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return; // ignore if user is typing in a sticky note or text input
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
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

          const id = 'img-' + Date.now() + Math.floor(Math.random() * 100);

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
              type: 'image',
              x: Math.round(x - w / 2),
              y: Math.round(y - h / 2),
              width: w,
              height: h,
              src: base64Str,
              zIndex: elements.length + 1,
            };

            setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newImageElement)
              .then(() => {
                pushToUndo({ type: 'add', elementId: id });
              })
              .catch((err) => console.error('Error saving pasted image:', err));
          };
          img.src = base64Str;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [boardId, elements.length, panX, panY, zoom]);

  // Handle Board Canvas Mouse Events
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary clicks trigger actions
    if (e.button !== 0) return;

    const coords = screenToCanvasCoords(e.clientX, e.clientY);

    // 1. Hand tool / Pan Canvas mode
    if ((activeTool === 'pan' || e.shiftKey) && activeTool !== 'pencil' && activeTool !== 'highlighter') {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // 2. Pencil / Highlighter drawing tool
    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      isDrawingRef.current = true;
      drawingPointsRef.current = [coords];
      setLocalDrawingPoints([coords]);
      return;
    }

    // 3. Connectors placement
    if (activeTool === 'connector') {
      // Find if clicking near an existing element
      const clickedEl = elements.find(el => {
        if (el.type === 'drawing' || el.type === 'connector') return false;
        return (
          coords.x >= el.x &&
          coords.x <= el.x + el.width &&
          coords.y >= el.y &&
          coords.y <= el.y + el.height
        );
      });

      setTempConnector({
        startX: coords.x,
        startY: coords.y,
        fromId: clickedEl?.id,
        currentX: coords.x,
        currentY: coords.y
      });
      return;
    }

    // 4. Click to spawn Stickies, Shapes, and Text instantly
    if (activeTool === 'sticky') {
      const id = 'sticky-' + Date.now() + Math.floor(Math.random() * 100);
      const newSticky: StickyElement = {
        id,
        type: 'sticky',
        x: coords.x - 75, // center horizontally on tap
        y: coords.y - 75,
        width: 150,
        height: 150,
        text: '',
        color: activeColor,
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newSticky);
      pushToUndo({ type: 'add', elementId: id });
      setActiveTool('select');
      setSelectedId(id);
      return;
    }

    if (activeTool === 'shape') {
      const id = 'shape-' + Date.now() + Math.floor(Math.random() * 100);
      const newShape: ShapeElement = {
        id,
        type: 'shape',
        shapeType: activeShape,
        x: coords.x - 75,
        y: coords.y - 75,
        width: 150,
        height: 150,
        text: '',
        color: activeColor,
        borderColor: '#1e293b', // deep charcoal border
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newShape);
      pushToUndo({ type: 'add', elementId: id });
      setActiveTool('select');
      setSelectedId(id);
      return;
    }

    if (activeTool === 'text') {
      const id = 'text-' + Date.now() + Math.floor(Math.random() * 100);
      const newText: TextElement = {
        id,
        type: 'text',
        x: coords.x - 100,
        y: coords.y - 25,
        width: 200,
        height: 50,
        text: '',
        color: activeColor === '#4b5563' ? '#4b5563' : '#1e293b',
        fontSize: 18,
        zIndex: elements.length + 1,
        reactions: {},
      };
      setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newText);
      pushToUndo({ type: 'add', elementId: id });
      setActiveTool('select');
      setSelectedId(id);
      return;
    }

    // 5. Default selection click
    if (activeTool === 'select') {
      // Clear selection if clicking on the empty background
      setSelectedId(null);
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

    // 2. Drawing freehand locally
    if (isDrawingRef.current && (activeTool === 'pencil' || activeTool === 'highlighter')) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
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

    // 3. Drawing temporary connector line
    if (tempConnector) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      setTempConnector((prev) => prev ? { ...prev, currentX: coords.x, currentY: coords.y } : null);
      return;
    }

    // 4. Moving an element
    if (isDragging && selectedId) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      // Update locally first for instantaneous rendering smoothness
      setElements((prev) => 
        prev.map((el) => {
          if (el.id === selectedId && el.type !== 'drawing' && el.type !== 'connector') {
            return {
              ...el,
              x: elementStartPos.x + dx,
              y: elementStartPos.y + dy,
            };
          }
          return el;
        })
      );
      return;
    }

    // 5. Resizing an element
    if (isResizing && selectedId) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id === selectedId && el.type !== 'drawing' && el.type !== 'connector') {
            return {
              ...el,
              width: Math.max(60, elementStartSize.w + dx),
              height: Math.max(60, elementStartSize.h + dy),
            };
          }
          return el;
        })
      );
      return;
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    // 1. Finish background panning
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // 2. Finish local drawing and save stroke as a single document to Firebase
    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      isDrawingRef.current = false;
      const points = drawingPointsRef.current;
      if (points.length > 1) {
        const id = 'draw-' + Date.now() + Math.floor(Math.random() * 100);
        const isHighlighter = activeTool === 'highlighter';
        const newStroke: DrawingElement = {
          id,
          type: 'drawing',
          points,
          color: isHighlighter ? `${activeColor}80` : activeColor, // add alpha opacity for highlighter
          width: isHighlighter ? strokeWidth * 2.5 : strokeWidth,
          isHighlighter,
          zIndex: elements.length + 1,
        };

        try {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newStroke);
          pushToUndo({ type: 'add', elementId: id });
        } catch (err) {
          console.error('Error saving sketch to Firebase:', err);
        }
      }
      drawingPointsRef.current = [];
      setLocalDrawingPoints([]);
      return;
    }

    // 3. Connectors creation on mouse up
    if (tempConnector && activeTool === 'connector') {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      
      // Find if released near a target shape
      const targetEl = elements.find(el => {
        if (el.type === 'drawing' || el.type === 'connector') return false;
        return (
          coords.x >= el.x &&
          coords.x <= el.x + el.width &&
          coords.y >= el.y &&
          coords.y <= el.y + el.height
        );
      });

      // Avoid self-connecting
      if (targetEl && targetEl.id !== tempConnector.fromId) {
        const id = 'connector-' + Date.now() + Math.floor(Math.random() * 100);
        const newConnector: ConnectorElement = {
          id,
          type: 'connector',
          fromId: tempConnector.fromId,
          fromX: tempConnector.startX,
          fromY: tempConnector.startY,
          toId: targetEl.id,
          toX: coords.x,
          toY: coords.y,
          color: activeColor === '#fef08a' ? '#f97316' : activeColor, // standard connectors color
          zIndex: elements.length + 1
        };

        try {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', id), newConnector);
          pushToUndo({ type: 'add', elementId: id });
        } catch (err) {
          console.error('Error saving connection line:', err);
        }
      }

      setTempConnector(null);
      setActiveTool('select');
      return;
    }

    // 4. Update elements coordinates in Firestore on move end
    if (isDragging && selectedId) {
      setIsDragging(false);
      const el = elements.find((e) => e.id === selectedId);
      if (el && el.type !== 'drawing' && el.type !== 'connector') {
        const hasMoved = el.x !== elementStartPos.x || el.y !== elementStartPos.y;
        if (hasMoved) {
          pushToUndo({
            type: 'update',
            elementId: selectedId,
            beforeData: {
              x: elementStartPos.x,
              y: elementStartPos.y,
            },
          });
        }
        try {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', selectedId), {
            x: el.x,
            y: el.y,
          }, { merge: true });
        } catch (err) {
          console.error('Error updating moved element coordinates:', err);
        }
      }
      return;
    }

    // 5. Update size in Firestore on resize end
    if (isResizing && selectedId) {
      setIsResizing(false);
      const el = elements.find((e) => e.id === selectedId);
      if (el && el.type !== 'drawing' && el.type !== 'connector') {
        const hasResized = el.width !== elementStartSize.w || el.height !== elementStartSize.h;
        if (hasResized) {
          pushToUndo({
            type: 'update',
            elementId: selectedId,
            beforeData: {
              width: elementStartSize.w,
              height: elementStartSize.h,
            },
          });
        }
        try {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', selectedId), {
            width: el.width,
            height: el.height,
          }, { merge: true });
        } catch (err) {
          console.error('Error updating resized element:', err);
        }
      }
      return;
    }
  };

  // Delete an element
  const handleDeleteElement = (id: string) => {
    const target = elements.find((el) => el.id === id);
    if (target) {
      pushToUndo({ type: 'delete', elementId: id, beforeData: target });
    }

    deleteDoc(doc(db, 'whiteboards', boardId, 'elements', id))
      .then(() => {
        if (selectedId === id) setSelectedId(null);
      })
      .catch((err) => console.error('Error deleting element:', err));
  };

  // Undo the last action from the local stack
  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));

    try {
      if (action.type === 'add') {
        await deleteDoc(doc(db, 'whiteboards', boardId, 'elements', action.elementId));
        if (selectedId === action.elementId) {
          setSelectedId(null);
        }
      } else if (action.type === 'delete') {
        if (action.beforeData) {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', action.elementId), action.beforeData);
        }
      } else if (action.type === 'update') {
        if (action.beforeData) {
          await setDoc(doc(db, 'whiteboards', boardId, 'elements', action.elementId), action.beforeData, { merge: true });
        }
      }
    } catch (err) {
      console.error('Error executing undo:', err);
    }
  };

  // Keyboard shortcut listeners (standard whiteboards experience!)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return; // ignore when typing
      }

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (key === 'v') setActiveTool('select');
      else if (key === 'h') setActiveTool('pan');
      else if (key === 'p') setActiveTool('pencil');
      else if (key === 'n') setActiveTool('sticky');
      else if (key === 's') setActiveTool('shape');
      else if (key === 't') setActiveTool('text');
      else if (key === 'l') setActiveTool('connector');
      else if (key === 'e') setActiveTool('eraser');
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          handleDeleteElement(selectedId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, handleUndo]);

  // Click handler to select an element
  const handleSelectElement = (id: string, e: React.MouseEvent) => {
    // Eraser tool clicks delete elements immediately
    if (activeTool === 'eraser') {
      e.stopPropagation();
      handleDeleteElement(id);
      return;
    }

    if (activeTool !== 'select') {
      // Let events bubble up so drawing or other canvas tools function correctly on top of elements!
      return;
    }

    e.stopPropagation();

    const target = elements.find((el) => el.id === id);
    if (!target || target.type === 'drawing') return;

    setSelectedId(id);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setElementStartPos({ x: target.x, y: target.y });
  };

  // Update specific values of an element
  const handleUpdateElement = (id: string, updates: Partial<BoardElement>) => {
    const el = elements.find((e) => e.id === id);
    if (el) {
      // Create a 'beforeData' object containing only the keys that are being updated
      const beforeData: any = {};
      Object.keys(updates).forEach((key) => {
        beforeData[key] = (el as any)[key] !== undefined ? (el as any)[key] : null;
      });
      pushToUndo({
        type: 'update',
        elementId: id,
        beforeData,
      });
    }

    setDoc(doc(db, 'whiteboards', boardId, 'elements', id), updates, { merge: true })
      .catch((err) => console.error('Error updating element:', err));
  };



  // Clear all items on the board
  const handleClearBoard = async () => {
    if (!window.confirm('Are you sure you want to clear the entire whiteboard? This will delete all shapes, sticky notes, and drawings.')) {
      return;
    }

    try {
      const batch = writeBatch(db);
      elements.forEach((el) => {
        const docRef = doc(db, 'whiteboards', boardId, 'elements', el.id);
        batch.delete(docRef);
      });
      await batch.commit();
      setSelectedId(null);
    } catch (err) {
      console.error('Error clearing whiteboard:', err);
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
    <div className="flex-1 h-screen relative flex flex-col bg-[#F3F4F6] overflow-hidden" id="whiteboard-workspace">
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
              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold">Active</span>
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">Workspace ID: {boardId.slice(0, 8)}...</p>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold text-xs transition-all cursor-pointer ${
              undoStack.length > 0
                ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-950 hover:scale-[1.02] active:scale-[0.98]'
                : 'text-slate-300 bg-slate-50 border border-slate-150 cursor-not-allowed'
            }`}
            title="Undo last action (Ctrl+Z)"
          >
            <Undo className={`w-3.5 h-3.5 ${undoStack.length > 0 ? 'text-slate-600' : 'text-slate-300'}`} />
            <span>Undo</span>
            {undoStack.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-extrabold">
                {undoStack.length}
              </span>
            )}
          </button>
        </div>

        {/* Current Collaborator Profile details and Share action */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-100 px-2.5 py-1 rounded-full text-xs font-bold text-slate-600 border border-slate-200">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentUser.color }} />
            <span>{currentUser.name} (You)</span>
          </div>

          <button
            onClick={copyBoardLink}
            className={`px-3.5 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
              copiedLink 
                ? 'bg-green-500 text-white shadow-sm' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
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
        onChangeTool={setActiveTool}
        activeColor={activeColor}
        onChangeColor={setActiveColor}
        activeShape={activeShape}
        onChangeShape={setActiveShape}
        onClearBoard={handleClearBoard}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        strokeWidth={strokeWidth}
        onChangeStrokeWidth={setStrokeWidth}
        gridMode={gridMode}
        onChangeGridMode={setGridMode}
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
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        }`}
        style={{
          // Grid dot or math grid background pattern that scales and translates correctly
          backgroundImage: gridMode === 'math'
            ? `linear-gradient(to right, rgba(203, 213, 225, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(203, 213, 225, 0.45) 1px, transparent 1px)`
            : `radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${panX}px ${panY}px`,
          backgroundColor: '#f8fafc'
        }}
      >
        {/* Render Layer of Infinite Board Elements (Shapes, Drawings, Connectors, cursors) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* 1. Interactive DOM elements Layer (Sticky notes, Shapes, Textboxes) */}
          <div className="absolute inset-0 pointer-events-none">
            {elements.map((el) => {
              const isSelected = selectedId === el.id;

              // Renders Sticky Note Elements
              if (el.type === 'sticky') {
                return (
                  <div key={el.id} className="pointer-events-auto">
                    <StickyComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) => handleUpdateElement(el.id, updates)}
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={isDragging || isResizing}
                    />
                  </div>
                );
              }

              // Renders Shape Elements
              if (el.type === 'shape') {
                return (
                  <div key={el.id} className="pointer-events-auto">
                    <ShapeComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) => handleUpdateElement(el.id, updates)}
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={isDragging || isResizing}
                    />
                  </div>
                );
              }

              // Renders Text Box Elements
              if (el.type === 'text') {
                return (
                  <div key={el.id} className="pointer-events-auto">
                    <TextComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) => handleUpdateElement(el.id, updates)}
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={isDragging || isResizing}
                    />
                  </div>
                );
              }

              // Renders Image Elements
              if (el.type === 'image') {
                return (
                  <div key={el.id} className="pointer-events-auto">
                    <ImageComponent
                      element={el}
                      isSelected={isSelected}
                      currentUser={currentUser}
                      zoom={zoom}
                      onSelect={(e) => handleSelectElement(el.id, e)}
                      onUpdate={(updates) => handleUpdateElement(el.id, updates)}
                      onDelete={() => handleDeleteElement(el.id)}
                      isDraggingOrResizing={isDragging || isResizing}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>

          {/* 2. Global Svg Vector Overlay (Connector Lines, Drawings, Sketches) */}
          <svg 
            width="100%" 
            height="100%" 
            className="absolute inset-0 overflow-visible pointer-events-none"
          >
            {/* Draw active/temp connector line */}
            {tempConnector && (
              <line
                x1={tempConnector.startX}
                y1={tempConnector.startY}
                x2={tempConnector.currentX}
                y2={tempConnector.currentY}
                stroke="#3b82f6"
                strokeWidth="2.5"
                strokeDasharray="4,4"
              />
            )}

            {/* Draw SVG connectors */}
            {elements
              .filter((el): el is ConnectorElement => el.type === 'connector')
              .map((conn) => (
                <g key={conn.id}>
                  <ConnectorRenderer
                    connector={conn}
                    elements={elements}
                    isSelected={selectedId === conn.id}
                    onSelect={(e) => handleSelectElement(conn.id, e)}
                    onDelete={() => handleDeleteElement(conn.id)}
                  />
                </g>
              ))}

            {/* Draw collaborative freehand drawings/sketches */}
            {elements
              .filter((el): el is DrawingElement => el.type === 'drawing')
              .map((draw) => {
                if (draw.points.length < 2) return null;
                const pathData = `M ${draw.points[0].x} ${draw.points[0].y} ` + 
                  draw.points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
                
                return (
                  <path
                    key={draw.id}
                    d={pathData}
                    fill="none"
                    stroke={draw.color}
                    strokeWidth={draw.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-all duration-150 ${activeTool === 'eraser' ? 'hover:stroke-rose-600/50 cursor-pointer pointer-events-auto' : ''}`}
                    onClick={(e) => {
                      if (activeTool === 'eraser') {
                        e.stopPropagation();
                        handleDeleteElement(draw.id);
                      }
                    }}
                  />
                );
              })}

            {/* Render local in-progress draw strokes instantly (eliminates latency!) */}
            {localDrawingPoints.length > 1 && (
              <path
                d={`M ${localDrawingPoints[0].x} ${localDrawingPoints[0].y} ` + 
                  localDrawingPoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')}
                fill="none"
                stroke={activeTool === 'highlighter' ? `${activeColor}80` : activeColor}
                strokeWidth={activeTool === 'highlighter' ? strokeWidth * 2.5 : strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {/* 3. Real-Time Collaborative Cursors Tracker Overlay */}
          <LiveCursors boardId={boardId} currentUser={currentUser} />
        </div>
      </div>

      {/* Interactive Shortcuts and Quick-Tools Widget */}
      <div className="absolute bottom-6 right-6 z-30 flex flex-col items-end" id="shortcuts-panel">
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
              Press the hotkey on your keyboard or click the buttons below to switch tools instantly:
            </p>

            {/* Interactive Shortcut Row List */}
            <div className="flex flex-col space-y-1">
              {[
                { key: 'V', label: 'Select & Edit', tool: 'select' },
                { key: 'H', label: 'Pan Canvas', tool: 'pan' },
                { key: 'P', label: 'Pen / Ink Drawing', tool: 'pencil' },
                { key: 'N', label: 'Sticky Note', tool: 'sticky' },
                { key: 'S', label: 'Shapes Selector', tool: 'shape' },
                { key: 'T', label: 'Text Box', tool: 'text' },
                { key: 'L', label: 'Connector Line', tool: 'connector' },
                { key: 'E', label: 'Eraser Tool', tool: 'eraser' }
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
                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100 shadow-xs'
                        : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <kbd className={`min-w-[20px] h-5 px-1.5 py-0.5 font-mono text-[10px] font-bold border rounded shadow-xs flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-blue-600 border-blue-700 text-white'
                          : 'bg-white border-slate-300 text-slate-600 group-hover:bg-slate-100'
                      }`}>
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
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Other Commands</div>
              
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">Delete Selected Item</span>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">Del</kbd>
                  <span className="text-[10px] text-slate-400">or</span>
                  <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">⌫</kbd>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">Paste Board Images</span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">Ctrl + V</kbd>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-500">Undo Last Action</span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-bold bg-slate-50 border border-slate-300 rounded shadow-xs text-slate-600">Ctrl + Z</kbd>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
