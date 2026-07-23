import React, { useState, useEffect, useRef } from "react";
import { get as idbGet, set as idbSet } from "idb-keyval";
import {
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
  increment,
  updateDoc,
  deleteField,
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
  Collaborator,
  ConnectorElement,
  MathElement,
} from "../types";

import Toolbar, { Tool } from "./Toolbar";
import StickyComponent from "./StickyComponent";
import ShapeComponent from "./ShapeComponent";
import TextComponent from "./TextComponent";
import MathComponent from "./MathComponent";
import ImageComponent from "./ImageComponent";
import AudioComponent from "./AudioComponent";
import StampComponent from "./StampComponent";
import PdfPageNavigation from "./PdfPageNavigation";
import VoiceRecordModal from "./VoiceRecordModal";
import StampPickerModal from "./StampPickerModal";
import LiveCursors from "./LiveCursors";
import Minimap from "./Minimap";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import ClearCanvasModal from "./ClearCanvasModal";
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
  Zap,
  ZapOff,
  Download,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  Flame,
  Timer as TimerIcon,
  Video,
} from "lucide-react";
import Markdown from "react-markdown";
import WorkspaceTimer from "./WorkspaceTimer";
import { secureEncrypt, secureDecrypt } from "../utils/crypto";
import { exportPdfWithDrawings } from "../utils/pdf";

interface CompressedImage {
  base64Str: string;
  width: number;
  height: number;
}

interface LaserPoint {
  x: number;
  y: number;
  timestamp: number;
  color: string;
}

// Client-side image compression utility to handle high volumes of pasted images safely
// within Firestore documents without needing Firebase Storage.
const compressImage = (file: File): Promise<CompressedImage | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Downscale to max 1600px on any dimension to minimize storage footprint while retaining pristine sharpness
        const MAX_DIM = 1600;
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
        // Output as high-quality JPEG (balanced visually and file size-wise)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ base64Str: compressedBase64, width, height });
      };
      img.onerror = () => resolve(null);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

// Helper to sanitize objects for Firestore (removes undefined fields)
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      clean[key] = sanitizeForFirestore(val);
    }
  }
  return clean;
}

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

// Helpers for smart connection lines / connectors between shapes
function getElementSocketCoords(el: BoardElement, socket: "top" | "right" | "bottom" | "left"): Point {
  const bounded = el as any;
  const w = bounded.width || 150;
  const h = bounded.height || 150;
  switch (socket) {
    case "top":
      return { x: bounded.x + w / 2, y: bounded.y };
    case "right":
      return { x: bounded.x + w, y: bounded.y + h / 2 };
    case "bottom":
      return { x: bounded.x + w / 2, y: bounded.y + h };
    case "left":
      return { x: bounded.x, y: bounded.y + h / 2 };
  }
}

function getConnectorPath(start: Point, end: Point, fromSocket: string, toSocket?: string): string {
  if (!toSocket) {
    // Smooth Bezier path to user mouse/cursor during dragging
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let cp1 = { x: start.x, y: start.y };
    const strength = Math.min(100, Math.max(30, Math.hypot(dx, dy) * 0.3));
    switch (fromSocket) {
      case "top": cp1.y -= strength; break;
      case "right": cp1.x += strength; break;
      case "bottom": cp1.y += strength; break;
      case "left": cp1.x -= strength; break;
    }
    return `M ${start.x} ${start.y} Q ${cp1.x} ${cp1.y} ${end.x} ${end.y}`;
  }
  
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let cp1 = { x: start.x, y: start.y };
  let cp2 = { x: end.x, y: end.y };
  
  const strength = Math.min(100, Math.max(30, Math.hypot(dx, dy) * 0.3));
  
  switch (fromSocket) {
    case "top": cp1.y -= strength; break;
    case "right": cp1.x += strength; break;
    case "bottom": cp1.y += strength; break;
    case "left": cp1.x -= strength; break;
  }
  
  switch (toSocket) {
    case "top": cp2.y -= strength; break;
    case "right": cp2.x += strength; break;
    case "bottom": cp2.y += strength; break;
    case "left": cp2.x -= strength; break;
  }
  
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

// High-performance point simplification/downsampling to shrink stroke coordinate sizes
function simplifyPoints(points: Point[], tolerance: number = 1.0): Point[] {
  if (points.length <= 2) return points;
  
  const result: Point[] = [points[0]];
  let lastPoint = points[0];
  
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - lastPoint.x;
    const dy = p.y - lastPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > tolerance) {
      result.push(p);
      lastPoint = p;
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// Memoized individual drawing component for high performance during zoom/pan re-renders
const DrawingItem = React.memo(({ 
  el, 
  isSelected, 
  isInteractive, 
  activeTool, 
  handleSelectElement 
}: { 
  el: any, 
  isSelected: boolean, 
  isInteractive: boolean, 
  activeTool: string, 
  handleSelectElement: (id: string, e: React.MouseEvent) => void 
}) => {
  const pathData = React.useMemo(() => getSvgPathFromPoints(el.points), [el.points]);
  
  return (
    <g
      className={
        isInteractive
          ? "pointer-events-auto cursor-pointer"
          : "pointer-events-none"
      }
      onPointerDown={(e) => handleSelectElement(el.id, e)}
    >
      {/* Invisible thicker hit area for easier clicking */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={(el.width || 2) + 16}
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
});

const RemoteStreamItem = React.memo(({ stream }: { stream: any }) => {
  const pathData = React.useMemo(() => getSvgPathFromPoints(stream.points), [stream.points]);
  return (
    <path
      d={pathData}
      fill="none"
      stroke={stream.color}
      strokeWidth={stream.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        stream.isHighlighter
          ? "mix-blend-multiply"
          : "drop-shadow-sm"
      }
    />
  );
});

const RemoteDrawingStreamsLayer = React.memo(({ streamsRef, dirtyRef }: { streamsRef: any, dirtyRef: any }) => {
  const [streams, setStreams] = useState<any>({});
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current) {
        setStreams({ ...streamsRef.current });
        dirtyRef.current = false;
      }
    }, 1000 / 30);
    return () => clearInterval(interval);
  }, [streamsRef, dirtyRef]);

  return (
    <>
      {Object.entries(streams).map(([userId, stream]: any) => {
        if (!stream || stream.points.length === 0) return null;
        return <RemoteStreamItem key={`stream-${userId}`} stream={stream} />;
      })}
    </>
  );
});

const ElementWrapper = React.memo(({
  el,
  isSelected,
  isInteractive,
  currentUser,
  zoom,
  isDragging,
  isResizing,
  selectedIdsLength,
  activeTool,
  canWrite,
  onSelectElement,
  onUpdateElement,
  onDeleteElement
}: {
  el: BoardElement;
  isSelected: boolean;
  isInteractive: boolean;
  currentUser: UserProfile;
  zoom: number;
  isDragging: boolean;
  isResizing: boolean;
  selectedIdsLength: number;
  activeTool: string;
  canWrite: boolean;
  onSelectElement: (id: string, e: React.MouseEvent) => void;
  onUpdateElement: (id: string, updates: Partial<BoardElement>) => void;
  onDeleteElement: (id: string) => void;
}) => {
  const onSelect = React.useCallback((e: React.MouseEvent) => {
    onSelectElement(el.id, e);
  }, [el.id, onSelectElement]);

  const onUpdate = React.useCallback((updates: any) => {
    onUpdateElement(el.id, updates);
  }, [el.id, onUpdateElement]);

  const onDelete = React.useCallback(() => {
    onDeleteElement(el.id);
  }, [el.id, onDeleteElement]);

  const isDraggingOrResizing = isDragging || isResizing || selectedIdsLength > 1;

  if (el.type === "sticky") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <StickyComponent
          element={el}
          isSelected={isSelected}
          currentUser={currentUser}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isDraggingOrResizing={isDraggingOrResizing}
          activeTool={activeTool}
          canWrite={canWrite}
        />
      </div>
    );
  }

  if (el.type === "shape") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <ShapeComponent
          element={el}
          isSelected={isSelected}
          currentUser={currentUser}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isDraggingOrResizing={isDraggingOrResizing}
          activeTool={activeTool}
          canWrite={canWrite}
        />
      </div>
    );
  }

  if (el.type === "text") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <TextComponent
          element={el}
          isSelected={isSelected}
          currentUser={currentUser}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isDraggingOrResizing={isDraggingOrResizing}
          activeTool={activeTool}
          canWrite={canWrite}
        />
      </div>
    );
  }

  if (el.type === "math") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <MathComponent
          element={el}
          isSelected={isSelected}
          currentUser={currentUser}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isDraggingOrResizing={isDraggingOrResizing}
          activeTool={activeTool}
          canWrite={canWrite}
        />
      </div>
    );
  }

  if (el.type === "image") {
    const isPdfPage = el.id.startsWith("pdf-page-");
    return (
      <div className={isInteractive && !isPdfPage ? "pointer-events-auto" : "pointer-events-none"}>
        <ImageComponent
          element={el}
          isSelected={isSelected}
          currentUser={currentUser}
          zoom={zoom}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isDraggingOrResizing={isDraggingOrResizing}
          activeTool={activeTool}
          canWrite={canWrite}
        />
      </div>
    );
  }

  if (el.type === "audio") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <AudioComponent
          element={el as any}
          isSelected={isSelected}
          isInteractive={isInteractive}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          currentUser={currentUser}
        />
      </div>
    );
  }

  if (el.type === "stamp") {
    return (
      <div className={isInteractive ? "pointer-events-auto" : "pointer-events-none"}>
        <StampComponent
          element={el as any}
          isSelected={isSelected}
          isInteractive={isInteractive}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          currentUser={currentUser}
        />
      </div>
    );
  }

  return null;
});

interface WhiteboardCanvasProps {
  boardId: string;
  boardName: string;
  currentUser: UserProfile;
  onBackToDashboard: () => void;
}

const getShardId = (id: string, maxShards: number = 10) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % maxShards;
};

const getBlobRefId = (isDrawing: boolean, id: string) => {
  const shardId = getShardId(id, 10);
  const prefix = isDrawing ? "drawings_blob" : "elements_blob";
  return shardId === 0 ? prefix : `${prefix}_${shardId}`;
};

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

  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    panXRef.current = panX;
  }, [panX]);

  useEffect(() => {
    panYRef.current = panY;
  }, [panY]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Whiteboard Elements State (loads instantly from LocalStorage cache as recovery fallback)
  const [elements, setElements] = useState<BoardElement[]>(() => {
    try {
      const cached = localStorage.getItem(`whiteboard_elements_${boardId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error("Error loading cached elements:", e);
    }
    return [];
  });
  
  const [clipboardElements, setClipboardElements] = useState<BoardElement[]>([]);
  const [boardData, setBoardData] = useState<Whiteboard | null>(null);
  const [isTopBarHidden, setIsTopBarHidden] = useState(false);

  // Live Screen Following & Modal States
  const [followedUserId, setFollowedUserId] = useState<string | null>(null);
  const followedUserIdRef = useRef<string | null>(null);
  followedUserIdRef.current = followedUserId;
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  // Real-Time WebSockets Sync & Caching States
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeCollaboratorIds, setActiveCollaboratorIds] = useState<string[]>([]);
  const socketCollaboratorsRef = useRef<Record<string, Collaborator>>({});
  const remoteDrawingStreamsRef = useRef<Record<string, {
    points: Point[];
    color: string;
    width: number;
    isHighlighter: boolean;
  }>>({});
  const remoteDrawingStreamsDirtyRef = useRef(false);
  const [remoteSelections, setRemoteSelections] = useState<Record<string, {
    userName: string;
    color: string;
    selectedIds: string[];
  }>>({});
  const [wsLatency, setWsLatency] = useState<number | null>(null);

  // Load heavy drawings from local IndexedDB cache instantly upon mounting (resilience)
  useEffect(() => {
    const loadFromIDB = async () => {
      try {
        const cachedDrawings = await idbGet<DrawingElement[]>(`drawings_${boardId}`);
        if (cachedDrawings && cachedDrawings.length > 0) {
          setElements((prev) => {
            const nonDrawings = prev.filter(el => el.type !== "drawing");
            return [...nonDrawings, ...cachedDrawings];
          });
        }
      } catch (err) {
        console.error("IndexedDB cache loading error:", err);
      }
    };
    loadFromIDB();
  }, [boardId]);

  // Connect to the HTTP-integrated local WebSocket server on the same origin
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    let socket: WebSocket;
    let reconnectTimer: any;
    let pingInterval: any;
    
    const connect = () => {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      
      socket.onopen = () => {
        console.log("WebSocket connected to real-time relay for board:", boardId);
        setWsConnected(true);
        // Register client to this specific board room
        socket.send(JSON.stringify({
          type: "join",
          boardId,
          userId: currentUser.id
        }));

        // Connection heartbeat (ping) to keep connection alive and compute latency
        pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "ping",
              id: Date.now()
            }));
          }
        }, 15000);
      };
      
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "cursor") {
            if (msg.userId === currentUser.id) return;
            // Track cursor movement from remote collaborator
            const isNew = !socketCollaboratorsRef.current[msg.userId];
            socketCollaboratorsRef.current[msg.userId] = {
              id: msg.userId,
              name: msg.name,
              color: msg.color,
              role: msg.role,
              x: msg.x,
              y: msg.y,
              panX: msg.panX,
              panY: msg.panY,
              zoom: msg.zoom,
              lastActive: msg.lastActive
            };
            if (isNew) {
              setActiveCollaboratorIds(Object.keys(socketCollaboratorsRef.current));
            }

            // Smooth camera follow logic when actively following a target user
            if (followedUserIdRef.current === msg.userId) {
              if (msg.x !== undefined && msg.y !== undefined && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const curZoom = zoomRef.current || 1;
                const targetPanX = rect.width / 2 - msg.x * curZoom;
                const targetPanY = rect.height / 2 - msg.y * curZoom;
                setPanX((prev) => prev + (targetPanX - prev) * 0.35);
                setPanY((prev) => prev + (targetPanY - prev) * 0.35);
              }
            }
          } else if (msg.type === "request_follow") {
            if (currentUser.role !== "teacher" && msg.teacherId) {
              setFollowedUserId(msg.teacherId);
              showSyncToast(`${msg.teacherName || "Teacher"} is sharing view! Following screen...`, "info");
            }
          } else if (msg.type === "drawing_stream") {
            // Stream sketch points real-time
            remoteDrawingStreamsRef.current[msg.userId] = {
              points: msg.points,
              color: msg.color,
              width: msg.width,
              isHighlighter: msg.isHighlighter
            };
            remoteDrawingStreamsDirtyRef.current = true;
          } else if (msg.type === "drawing_stream_end") {
            // Clear stream when finished drawing
            delete remoteDrawingStreamsRef.current[msg.userId];
            remoteDrawingStreamsDirtyRef.current = true;
          } else if (msg.type === "element_update") {
            const { elementId, elementData, actionType, isMerge } = msg;
            setElements((prev) => {
              let updated: BoardElement[] = [];
              if (actionType === "delete") {
                updated = prev.filter(el => el.id !== elementId);
              } else {
                const exists = prev.some(el => el.id === elementId);
                if (exists) {
                  updated = prev.map(el => el.id === elementId ? (isMerge ? { ...el, ...elementData } : { id: elementId, ...elementData }) : el);
                } else {
                  updated = [...prev, { id: elementId, ...elementData } as BoardElement];
                }
              }
              try {
                localStorage.setItem(`whiteboard_elements_${boardId}`, JSON.stringify(updated));
              } catch (e) {
                console.error("Local storage error:", e);
              }
              return updated;
            });
          } else if (msg.type === "element_focus") {
            setRemoteSelections((prev) => ({
              ...prev,
              [msg.userId]: {
                userName: msg.userName,
                color: msg.color,
                selectedIds: msg.selectedIds
              }
            }));
          } else if (msg.type === "laser_point") {
            if (msg.userId === currentUser.id) return;
            const now = Date.now();
            setRemoteLaserPoints((prev) => {
              const existing = prev[msg.userId] || [];
              const active = existing.filter((p) => now - p.timestamp < 1500);
              return {
                ...prev,
                [msg.userId]: [
                  ...active,
                  {
                    x: msg.x,
                    y: msg.y,
                    timestamp: msg.timestamp || now,
                    color: msg.color || "#ef4444",
                  },
                ],
              };
            });
          } else if (msg.type === "timer_sync") {
            setSyncedTimerState(msg.state);
          } else if (msg.type === "pong") {
            setWsLatency(Date.now() - msg.id);
          }
        } catch (err) {
          console.error("Client WebSocket message parsing error:", err);
        }
      };
      
      socket.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 3s...");
        setWsConnected(false);
        setWsLatency(null);
        if (pingInterval) clearInterval(pingInterval);
        reconnectTimer = setTimeout(connect, 3000);
      };
      
      socket.onerror = () => {
        setWsConnected(false);
      };
    };
    
    connect();
    
    return () => {
      if (socket) {
        socket.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    };
  }, [boardId, currentUser.id]);

  // Keep socket cursors fresh by purging idle collaborators every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const updated = { ...socketCollaboratorsRef.current };
      Object.keys(updated).forEach((userId) => {
        if (now - updated[userId].lastActive > 15000) {
          delete updated[userId];
          changed = true;
        }
      });
      if (changed) {
        socketCollaboratorsRef.current = updated;
        setActiveCollaboratorIds(Object.keys(updated));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);


  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragSelectStart, setDragSelectStart] = useState<Point | null>(null);
  const [dragSelectEnd, setDragSelectEnd] = useState<Point | null>(null);
  const [elementStartPositions, setElementStartPositions] = useState<Record<string, any>>({});

  // Broadcast local selection changes to other users
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "element_focus",
        boardId,
        userId: currentUser.id,
        userName: currentUser.name,
        color: currentUser.color,
        selectedIds
      }));
    }
  }, [selectedIds, boardId, currentUser.id, currentUser.name, currentUser.color, wsConnected]);

  // Keep remote selections in sync with active collaborators
  useEffect(() => {
    const activeUserIds = new Set(activeCollaboratorIds);
    setRemoteSelections((prev) => {
      let changed = false;
      const filtered = { ...prev };
      Object.keys(filtered).forEach((uId) => {
        if (!activeUserIds.has(uId)) {
          delete filtered[uId];
          changed = true;
        }
      });
      return changed ? filtered : prev;
    });
  }, [activeCollaboratorIds]);

  // Elements Ref to always bypass stale closure contexts safely in async event handlers
  const elementsRef = useRef<BoardElement[]>([]);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  // Write Minimization & Offline Persistence States & Refs
  const [activeUsersCount, setActiveUsersCount] = useState<number>(1);
  const [firestoreActiveUsersCount, setFirestoreActiveUsersCount] = useState<number>(1);
  const activeUsersCountRef = useRef<number>(1);
  useEffect(() => {
    activeUsersCountRef.current = activeUsersCount;
  }, [activeUsersCount]);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving-cloud' | 'saved-local' | 'offline'>('synced');
  const hasUnsavedChanges = useRef<boolean>(false);
  const pendingSyncElements = useRef<Record<string, { data: any; action: 'set' | 'delete' }>>({});
  const debounceTimer = useRef<any>(null);

  const [syncNotification, setSyncNotification] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });
  const syncNotificationTimeoutRef = useRef<any>(null);

  const showSyncToast = React.useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', duration: number = 4000) => {
    if (syncNotificationTimeoutRef.current) clearTimeout(syncNotificationTimeoutRef.current);
    setSyncNotification({ message, type, visible: true });
    syncNotificationTimeoutRef.current = setTimeout(() => {
      setSyncNotification(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  // Daily firebase writes and reads tracking state
  const pendingTeacherWrites = useRef<number>(0);
  const pendingAllWrites = useRef<number>(0);
  const pendingReads = useRef<number>(0);
  const statsSyncTimer = useRef<any>(null);

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const triggerStatsSync = React.useCallback(() => {
    if (statsSyncTimer.current) clearTimeout(statsSyncTimer.current);
    statsSyncTimer.current = setTimeout(async () => {
      const teacherCount = pendingTeacherWrites.current;
      const allCount = pendingAllWrites.current;
      const readCount = pendingReads.current;

      if (teacherCount <= 0 && allCount <= 0 && readCount <= 0) return;

      pendingTeacherWrites.current = 0;
      pendingAllWrites.current = 0;
      pendingReads.current = 0;

      try {
        const todayStr = getTodayDateString();
        const boardRef = doc(db, "whiteboards", boardId);
        
        const updateData: any = {};
        if (teacherCount > 0) {
          updateData[`teacherDailyWrites.${todayStr}`] = increment(teacherCount);
        }
        if (allCount > 0) {
          updateData[`dailyWrites.${todayStr}`] = increment(allCount);
        }
        if (readCount > 0) {
          updateData[`dailyReads.${todayStr}`] = increment(readCount);
        }

        await updateDoc(boardRef, updateData);
      } catch (err) {
        console.error("Error syncing daily stats:", err);
        // Restore failed values
        pendingTeacherWrites.current += teacherCount;
        pendingAllWrites.current += allCount;
        pendingReads.current += readCount;
      }
    }, 4000); // sync stats after 4 seconds of inactivity
  }, [boardId]);

  const incrementStats = React.useCallback((type: 'write' | 'read', count: number) => {
    const isTeacher = currentUser.role === "teacher";
    if (type === 'write') {
      pendingAllWrites.current += count;
      if (isTeacher) {
        pendingTeacherWrites.current += count;
      }
    } else {
      pendingReads.current += count;
    }
    triggerStatsSync();
  }, [currentUser.role, triggerStatsSync]);

  useEffect(() => {
    return () => {
      if (statsSyncTimer.current) clearTimeout(statsSyncTimer.current);
    };
  }, []);

  // Undo History state
  interface UndoAction {
    type: "add" | "delete" | "update";
    elementId: string;
    beforeData?: any;
    afterData?: any;
  }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const pushToUndo = React.useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]); // standard clear redo on new action
  }, []);

  // Active Tool state
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [activeColor, setActiveColor] = useState("#000000"); // default black color
  const [activeShape, setActiveShape] = useState<ShapeType>("rect");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [gridMode, setGridMode] = useState<"dots" | "math" | "none">("dots");
  const [isZenMode, setIsZenMode] = useState(false);

  // Interaction State flags
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [tempConnector, setTempConnector] = useState<{
    fromId: string;
    fromSocket: "top" | "right" | "bottom" | "left";
    startPoint: Point;
    currentPoint: Point;
  } | null>(null);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number } | null>(null);
  const [elementStartPos, setElementStartPos] = useState<Point>({ x: 0, y: 0 });
  const [elementStartSize, setElementStartSize] = useState<{
    w: number;
    h: number;
  }>({ w: 0, h: 0 });

  // Floating Workspace Timer & Presenter / Laser Pointer States
  const [isTimerOpen, setIsTimerOpen] = useState(false);
  const [syncedTimerState, setSyncedTimerState] = useState<any>(null);
  const [isPresenterMode, setIsPresenterMode] = useState(false);
  const [localLaserPoints, setLocalLaserPoints] = useState<LaserPoint[]>([]);
  const [remoteLaserPoints, setRemoteLaserPoints] = useState<{ [userId: string]: LaserPoint[] }>({});

  // Kami Tools Modals & Navigation States
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isStampModalOpen, setIsStampModalOpen] = useState(false);
  const [pendingVoiceCoords, setPendingVoiceCoords] = useState<Point | null>(null);
  const [pendingStampCoords, setPendingStampCoords] = useState<Point | null>(null);
  const [activePdfPageIndex, setActivePdfPageIndex] = useState(0);

  const pdfPages = React.useMemo(() => {
    return elements.filter((el) => el.type === "image" && el.id.startsWith("pdf-page-")) as ImageElement[];
  }, [elements]);

  const sortedElements = React.useMemo(() => {
    return [...elements].sort((a, b) => {
      const aIsPdf = a.id.startsWith("pdf-page-");
      const bIsPdf = b.id.startsWith("pdf-page-");

      if (aIsPdf && !bIsPdf) return -1;
      if (!aIsPdf && bIsPdf) return 1;

      const zA = typeof a.zIndex === "number" ? a.zIndex : (aIsPdf ? -1 : 10);
      const zB = typeof b.zIndex === "number" ? b.zIndex : (bIsPdf ? -1 : 10);

      return zA - zB;
    });
  }, [elements]);

  const handleJumpToPdfPage = React.useCallback((pageIndex: number) => {
    const page = pdfPages[pageIndex];
    if (!page) return;
    setActivePdfPageIndex(pageIndex);
    const containerW = containerDimensions.width || 1200;
    const containerH = containerDimensions.height || 800;
    const targetZoom = Math.min(1.2, (containerH - 120) / (page.height || 800));
    const targetPanX = containerW / 2 - (page.x + page.width / 2) * targetZoom;
    const targetPanY = containerH / 2 - (page.y + page.height / 2) * targetZoom;

    setZoom(targetZoom);
    setPanX(targetPanX);
    setPanY(targetPanY);
  }, [pdfPages, containerDimensions]);

  const handleTimerSync = (timerState: any) => {
    setSyncedTimerState(timerState);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "timer_sync",
          boardId,
          state: timerState,
        })
      );
    }
  };

  // Continuous animation loop to decay fading laser trail points smoothly
  useEffect(() => {
    let animId: number;
    const tick = () => {
      const now = Date.now();
      setLocalLaserPoints((prev) => {
        if (prev.length === 0) return prev;
        const active = prev.filter((p) => now - p.timestamp < 1500);
        return active.length !== prev.length ? active : prev;
      });
      setRemoteLaserPoints((prev) => {
        let changed = false;
        const updated: typeof prev = {};
        Object.entries(prev).forEach(([uid, pts]) => {
          const active = pts.filter((p) => now - p.timestamp < 1500);
          if (active.length > 0) {
            updated[uid] = active;
          }
          if (active.length !== pts.length) changed = true;
        });
        return changed ? updated : prev;
      });
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Permission states for Teacher/Student lock controls
  const [showReadOnlyAlert, setShowReadOnlyAlert] = useState(false);
  const alertTimeoutRef = useRef<any>(null);
  const isTeacher = currentUser.role === "teacher";
  const studentsCanWrite = boardData?.studentsCanWrite !== false;
  const canWrite = isTeacher || studentsCanWrite;

  const isPdfBoard = boardName.startsWith("PDF: ");
  const [hasCentered, setHasCentered] = useState(false);

  // Mirror refs for multi-touch and touch gesture synchronization
  const activeToolRef = useRef(activeTool);
  const selectedIdRef = useRef(selectedId);
  const selectedIdsRef = useRef(selectedIds);
  const isPanningRef = useRef(isPanning);
  const isDraggingRef = useRef(isDragging);
  const isResizingRef = useRef(isResizing);
  const activeColorRef = useRef(activeColor);
  const strokeWidthRef = useRef(strokeWidth);
  const dragStartRef = useRef(dragStart);
  const canWriteRef = useRef(canWrite);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    isPanningRef.current = isPanning;
  }, [isPanning]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    isResizingRef.current = isResizing;
  }, [isResizing]);

  useEffect(() => {
    activeColorRef.current = activeColor;
  }, [activeColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  useEffect(() => {
    dragStartRef.current = dragStart;
  }, [dragStart]);

  useEffect(() => {
    canWriteRef.current = canWrite;
  }, [canWrite]);

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

  const handleToggleZenMode = () => {
    const nextZenMode = !isZenMode;
    setIsZenMode(nextZenMode);

    if (nextZenMode) {
      const elem = document.getElementById("whiteboard-workspace");
      if (elem && elem.requestFullscreen) {
        elem.requestFullscreen().catch((err) => {
          console.warn("Fullscreen API rejected or not allowed in iframe:", err);
        });
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn("Error exiting fullscreen:", err);
        });
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsZenMode(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const triggerReadOnlyAlert = () => {
    setShowReadOnlyAlert(true);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => {
      setShowReadOnlyAlert(false);
    }, 3000);
  };

  // In-progress local drawings (drawn locally on canvas for zero-latency feedback)
  const localDrawingPathRef = useRef<SVGPathElement>(null);

  // Drawing state tracking via refs to bypass React state-update asynchronous latency/closures
  const isDrawingRef = useRef(false);
  const drawingPointsRef = useRef<Point[]>([]);
  const lastStreamBroadcast = useRef<number>(0);

  // Clear confirmation modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Copy share button state
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdfWithDrawings = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await exportPdfWithDrawings(elements, boardName);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Failed to export PDF: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

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

  // Fetch board elements in real time with local caching and write-minimizer guards
  useEffect(() => {
    const elementsRefColl = collection(db, "whiteboards", boardId, "elements");
    const q = query(elementsRefColl);

    let isInitialLoad = true;

    let unsubscribe = onSnapshot(q, (snapshot) => {
      let readCount = 0;
      if (isInitialLoad) {
        readCount = snapshot.size || 1;
      } else {
        readCount = snapshot.docChanges().filter(c => c.type !== 'removed').length;
      }
      if (readCount > 0) {
        incrementStats('read', readCount);
      }

      if (!isInitialLoad && hasUnsavedChanges.current && activeUsersCountRef.current <= 1) {
        return;
      }
      isInitialLoad = false;

            const loadedMap = new Map<string, BoardElement>();
      let hasStrays = false;
      const straysToDelete: string[] = [];
      const shardUpdates: Record<string, any> = {};

      snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const docData = docSnap.data();

        if (id.startsWith("elements_blob") || id.startsWith("drawings_blob")) {
          if (docData && docData.data) {
            Object.keys(docData.data).forEach(elId => {
              // Priority to blob data
              loadedMap.set(elId, { id: elId, ...docData.data[elId] } as BoardElement);
            });
          } else if (id.startsWith("drawings_blob") && docData && Array.isArray(docData.drawings)) {
            docData.drawings.forEach((d: any) => loadedMap.set(d.id, d));
          }
        } else {
          // If it's a stray document, we only add it if it's NOT already in a blob
          if (!id.startsWith("chat_") && !id.startsWith("meta_")) {
            hasStrays = true;
            if (/^[a-zA-Z0-9_\-]+$/.test(id)) {
              straysToDelete.push(id);
            } else {
              console.warn("Skipping invalid stray ID:", id);
            }
            const blobId = getBlobRefId(docData.type === "drawing", id);
            if (!shardUpdates[blobId]) shardUpdates[blobId] = {};
            if (docData.type === "drawing") {
              shardUpdates[blobId][id] = { ...docData, points: simplifyPoints(docData.points, 1.2) };
            } else {
              shardUpdates[blobId][id] = docData;
            }
            
            if (!loadedMap.has(id)) {
              loadedMap.set(id, { id, ...docData } as BoardElement);
            }
          } else {
            if (!loadedMap.has(id)) {
              loadedMap.set(id, { id, ...docData } as BoardElement);
            }
          }
        }
      });

      const loaded = Array.from(loadedMap.values());
      setElements(loaded);

      try {
        localStorage.setItem(`whiteboard_elements_${boardId}`, JSON.stringify(loaded));
        const drawings = loaded.filter(el => el.type === "drawing") as DrawingElement[];
        idbSet(`drawings_${boardId}`, drawings).catch(e => console.error("IDB save error:", e));
      } catch (e) {
        console.error("Local storage error:", e);
      }

      // Background migration for old stray documents
      if (hasStrays && straysToDelete.length > 0) {
        (async () => {
          console.log(`Migrating ${straysToDelete.length} stray documents...`);
          try {
                          // Update shards
             for (const blobId of Object.keys(shardUpdates)) {
               if (Object.keys(shardUpdates[blobId]).length > 0) {
                 try {
                   await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), { data: shardUpdates[blobId] }, { merge: true });
                 } catch (err) {
                   console.error("Migration setDoc failed for blob", blobId, err);
                   showSyncToast("Migration setDoc failed: " + err.message, "error", 10000);
                   throw err;
                 }
               }
             }
             
             // Delete strays in batches of 400
             for (let i = 0; i < straysToDelete.length; i += 400) {
                const chunk = straysToDelete.slice(i, i + 400);
                const deleteBatch = writeBatch(db);
                chunk.forEach(strayId => {
                   deleteBatch.delete(doc(db, "whiteboards", boardId, "elements", strayId));
                });
                try {
                  await deleteBatch.commit();
                } catch (err) {
                   console.error("Migration deleteBatch failed for chunk", i, err);
                   showSyncToast("Migration deleteBatch failed: " + err.message, "error", 10000);
                   throw err;
                }
             }
             console.log("Migration successful!");
          } catch (err) {
             console.error("Migration failed:", err); showSyncToast("Migration failed: " + err.message, "error", 10000);
          }
        })();
      }
    }, (error) => {
      console.error("Snapshot connection error:", error);
      setSyncStatus('offline');
    });

    const timeout = setTimeout(() => {
      // CRITICAL QUOTA OPTIMIZATION:
      // If WebSocket is successfully connected, unsubscribe the Firestore listener to prevent continuous read billing!
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        unsubscribe();
      }
    }, 4000);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [boardId]);

  // Monitor active cursors to determine Solo User Mode (Solo) vs Collaborative Mode (Multiplayer)
  useEffect(() => {
    let isMounted = true;
    const fetchCursors = async () => {
      try {
        const cursorsRef = collection(db, "whiteboards", boardId, "cursors");
        const snapshot = await import('firebase/firestore').then(m => m.getDocs(cursorsRef));
        if (!isMounted) return;
        const now = Date.now();
        let otherUsers = 0;
        snapshot.forEach((docSnap) => {
          if (docSnap.id !== currentUser.id) {
            const data = docSnap.data();
            if (now - (data.lastActive || 0) < 45000) {
              otherUsers++;
            }
          }
        });
        setFirestoreActiveUsersCount(otherUsers + 1);
      } catch (err) {
        console.error("Error fetching cursors:", err);
      }
    };

    fetchCursors();
    const interval = setInterval(fetchCursors, 30000); // Check every 30 seconds instead of real-time reads
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [boardId, currentUser.id]);

  // Combine both sources of truth (WebSockets + Firestore) to determine Solo vs Collaborating
  useEffect(() => {
    const wsCount = wsConnected ? activeCollaboratorIds.length + 1 : 1;
    setActiveUsersCount(Math.max(firestoreActiveUsersCount, wsCount));
  }, [firestoreActiveUsersCount, activeCollaboratorIds, wsConnected]);

  // Native non-passive Wheel/Pinch event listener for ultra-responsive zooming and scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const wheelValue = e.deltaY;
      
      // Support pinch-to-zoom (trackpad) perfectly and standard wheel scrolling smoothly
      const isPinch = e.ctrlKey;
      const zoomIntensity = isPinch ? 0.04 : 0.08;
      const zoomFactor = wheelValue < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
      
      const currentZoom = zoomRef.current;
      const currentPanX = panXRef.current;
      const currentPanY = panYRef.current;

      const newZoom = Math.min(3, Math.max(0.15, currentZoom * zoomFactor));
      
      // Calculate coordinates relative to canvas before zooming
      const canvasMouseX = (mouseX - currentPanX) / currentZoom;
      const canvasMouseY = (mouseY - currentPanY) / currentZoom;
      
      const newPanX = mouseX - canvasMouseX * newZoom;
      const newPanY = mouseY - canvasMouseY * newZoom;

      setPanX(newPanX);
      setPanY(newPanY);
      setZoom(newZoom);
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  // Native non-passive Touch event listeners for seamless single/multi-finger mobile support (pinch-to-zoom, pan, draw, drag, resize)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const touchStartData = {
      dist: 0,
      midX: 0,
      midY: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    };

    const findElementAtCoords = (coords: { x: number; y: number }) => {
      const curElements = elementsRef.current;
      for (let i = curElements.length - 1; i >= 0; i--) {
        const el = curElements[i];
        if (el.type === "drawing") continue;
        const bounded = el as any;
        const w = bounded.width || 150;
        const h = bounded.height || 150;
        if (
          coords.x >= bounded.x &&
          coords.x <= bounded.x + w &&
          coords.y >= bounded.y &&
          coords.y <= bounded.y + h
        ) {
          return el;
        }
      }
      return null;
    };

    const isNearResizeHandle = (el: BoardElement, coords: { x: number; y: number }) => {
      const bounded = el as any;
      const w = bounded.width || 150;
      const h = bounded.height || 150;
      const handleSize = 32 / zoomRef.current;
      return (
        coords.x >= bounded.x + w - handleSize &&
        coords.x <= bounded.x + w + 12 &&
        coords.y >= bounded.y + h - handleSize &&
        coords.y <= bounded.y + h + 12
      );
    };

    const handleNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch-to-zoom multi-touch trigger
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        touchStartData.dist = dist;
        touchStartData.midX = midX;
        touchStartData.midY = midY;
        touchStartData.zoom = zoomRef.current;
        touchStartData.panX = panXRef.current;
        touchStartData.panY = panYRef.current;

        setIsPanning(false);
        setIsDragging(false);
        setIsResizing(false);
        isDrawingRef.current = false;
        return;
      }
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      // 1. Two-finger pinch-to-zoom
      if (e.touches.length === 2 && touchStartData.dist > 0) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        const factor = dist / touchStartData.dist;
        const newZoom = Math.min(3, Math.max(0.15, touchStartData.zoom * factor));

        const canvasMidX = (touchStartData.midX - touchStartData.panX) / touchStartData.zoom;
        const canvasMidY = (touchStartData.midY - touchStartData.panY) / touchStartData.zoom;

        const newPanX = midX - canvasMidX * newZoom;
        const newPanY = midY - canvasMidY * newZoom;

        setZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
        return;
      }
    };

    const handleNativeTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0 || e.touches.length === 1) {
        touchStartData.dist = 0;
      }
    };

    container.addEventListener("touchstart", handleNativeTouchStart, { passive: false });
    container.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    container.addEventListener("touchend", handleNativeTouchEnd, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleNativeTouchStart);
      container.removeEventListener("touchmove", handleNativeTouchMove);
      container.removeEventListener("touchend", handleNativeTouchEnd);
    };
  }, []);

  // Flushes pending Solo changes to cloud
  const flushPendingChanges = React.useCallback(async () => {
    const queue = { ...pendingSyncElements.current };
    const keys = Object.keys(queue);
    if (keys.length === 0) {
      hasUnsavedChanges.current = false;
      setSyncStatus('synced');
      return;
    }

    setSyncStatus('saving-cloud');
    pendingSyncElements.current = {};

    try {
      const batch = writeBatch(db);
      const blobUpdates: Record<string, any> = {};

      keys.forEach((id) => {
        const item = queue[id];
        if (!item) return;
        const isDraw = item.data?.type === 'drawing' || id.startsWith('draw-');
        
        // Clean up old individual docs to save reads over time!
        const oldDocRef = doc(db, "whiteboards", boardId, "elements", id);
        batch.delete(oldDocRef);

        const blobId = getBlobRefId(isDraw, id);
        if (!blobUpdates[blobId]) blobUpdates[blobId] = {};

        if (item.action === 'delete') {
          blobUpdates[blobId][id] = deleteField();
        } else {
          const { id: _, ...data } = item.data;
          const cleanData = sanitizeForFirestore(data);
          if (isDraw) {
            blobUpdates[blobId][id] = { ...cleanData, points: simplifyPoints(cleanData.points, 1.2) };
          } else {
            blobUpdates[blobId][id] = cleanData;
          }
        }
      });

      Object.keys(blobUpdates).forEach(blobId => {
        const ref = doc(db, "whiteboards", boardId, "elements", blobId);
        batch.set(ref, { data: blobUpdates[blobId] }, { merge: true });
      });

      await batch.commit();
      hasUnsavedChanges.current = false;
      setSyncStatus('synced');
      incrementStats('write', keys.length);
    } catch (err) {
      console.error("Flush pending changes to cloud failed:", err);
      // Restore failed items back to the queue safely
      Object.keys(queue).forEach(id => {
        if (!pendingSyncElements.current[id]) {
          pendingSyncElements.current[id] = queue[id];
        }
      });
      hasUnsavedChanges.current = true;
      setSyncStatus('offline');
      showSyncToast("Sync failed: " + err.message, "error", 10000);
    }
  }, [boardId, incrementStats, showSyncToast]);

  // Centralized write-minimizer dispatcher handling local-first updates + debounced/immediate syncing
  const saveElementLocallyAndSync = React.useCallback(async (
    elementId: string,
    elementData: any,
    isMerge: boolean = false,
    actionType: 'set' | 'delete' = 'set'
  ) => {
    const currentElements = elementsRef.current;
    let updatedElements: BoardElement[] = [];

    // Check if we are updating or deleting a drawing element
    const isDrawing = (elementData && elementData.type === 'drawing') || 
                      (actionType === 'delete' && currentElements.find(el => el.id === elementId)?.type === 'drawing');

    let processedData = elementData ? sanitizeForFirestore(elementData) : elementData;
    if (isDrawing && elementData && elementData.type === 'drawing') {
      processedData = {
        ...processedData,
        points: simplifyPoints(processedData.points, 1.2) // Downscale point coordinate resolution to optimize Firestore sizes
      };
    }

    if (actionType === 'delete') {
      updatedElements = currentElements.filter(el => el.id !== elementId);
    } else {
      const exists = currentElements.some(el => el.id === elementId);
      if (exists) {
        updatedElements = currentElements.map(el => {
          if (el.id === elementId) {
            return isMerge ? { ...el, ...processedData } : { id: elementId, ...processedData };
          }
          return el;
        });
      } else {
        updatedElements = [...currentElements, { id: elementId, ...processedData } as BoardElement];
      }
    }

    // Snappy UI update
    setElements(updatedElements);
    elementsRef.current = updatedElements;

    // Save fallback cache to localStorage and IndexedDB
    try {
      localStorage.setItem(`whiteboard_elements_${boardId}`, JSON.stringify(updatedElements));
      if (isDrawing) {
        const fullDrawings = updatedElements.filter(el => el.type === 'drawing') as DrawingElement[];
        await idbSet(`drawings_${boardId}`, fullDrawings);
      }
    } catch (e) {
      console.error("Local storage / IndexedDB save error:", e);
    }

    // Broadcast update instantly to connected WebSocket peers (saving Firestore reads)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "element_update",
        boardId,
        elementId,
        elementData: processedData,
        actionType,
        isMerge
      }));
    }

    const isSolo = activeUsersCount <= 1;
    const isWebSocketOpen = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    const useDebouncedQueue = isSolo || isWebSocketOpen;

    if (useDebouncedQueue) {
      hasUnsavedChanges.current = true;
      setSyncStatus('saved-local');

      if (actionType === 'delete') {
        pendingSyncElements.current[elementId] = { data: null, action: 'delete' };
      } else {
        const currentFullEl = updatedElements.find(el => el.id === elementId);
        if (currentFullEl) {
          pendingSyncElements.current[elementId] = { data: currentFullEl, action: 'set' };
        }
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushPendingChanges();
      }, 3000);
    } else {
      setSyncStatus('saving-cloud');
      
      try {
        const isDraw = processedData && processedData.type === 'drawing';
        const blobId = getBlobRefId(isDraw, elementId);
        
        if (actionType === 'delete') {
          await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), {
            data: { [elementId]: deleteField() }
          }, { merge: true });
        } else {
          let payload = sanitizeForFirestore(processedData);
          if (isDraw) {
             payload = { ...payload, points: simplifyPoints(payload.points, 1.2) };
          }
          await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), {
            data: { [elementId]: payload }
          }, { merge: true });
        }
        
        setSyncStatus('synced');
        incrementStats('write', 1);
      } catch (err) {
        console.error("Error saving element:", err);
        setSyncStatus('offline');
        showSyncToast("Sync failed: " + err.message, "error", 10000);
      }
    }
  }, [boardId, activeUsersCount, currentUser, setElements, setSyncStatus, flushPendingChanges]);

  const handleInsertBlankPdfPage = React.useCallback(() => {
    const lastPage = pdfPages[pdfPages.length - 1];
    const newY = lastPage ? lastPage.y + lastPage.height + 40 : 0;
    const newX = lastPage ? lastPage.x : 0;
    const width = lastPage ? lastPage.width : 600;
    const height = lastPage ? lastPage.height : 800;

    const blankSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#94a3b8" text-anchor="middle">Blank PDF Page</text></svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(blankSvg)}`;

    const id = `pdf-page-${pdfPages.length}-${Date.now()}`;
    const newPage: ImageElement = {
      id,
      type: "image",
      x: newX,
      y: newY,
      width,
      height,
      src: dataUrl,
      zIndex: -1,
      locked: true,
      updatedAt: Date.now(),
    };

    saveElementLocallyAndSync(id, newPage);
    showSyncToast("Blank page added to document", "success");
  }, [pdfPages, saveElementLocallyAndSync, showSyncToast]);

  const handleSaveVoiceNote = React.useCallback((audioDataUrl: string, durationSec: number) => {
    const coords = pendingVoiceCoords || { x: -panX + 200, y: -panY + 200 };
    const id = "audio-" + Date.now() + Math.floor(Math.random() * 100);
    const newAudio: BoardElement = {
      id,
      type: "audio",
      x: coords.x - 20,
      y: coords.y - 20,
      audioUrl: audioDataUrl,
      duration: durationSec,
      authorName: currentUser.name,
      zIndex: elements.length + 1,
      updatedAt: Date.now(),
    } as any;

    saveElementLocallyAndSync(id, newAudio);
    pushToUndo({ type: "add", elementId: id, afterData: newAudio });
    setActiveTool("select");
    setSelectedId(id);
    setIsDragging(false);
    showSyncToast("Voice comment attached!", "success");
  }, [pendingVoiceCoords, panX, panY, currentUser.name, elements.length, saveElementLocallyAndSync, pushToUndo, showSyncToast, setIsDragging]);

  const handleSaveStamp = React.useCallback((stampType: any, label?: string, signatureUrl?: string) => {
    const coords = pendingStampCoords || { x: -panX + 200, y: -panY + 200 };
    const id = "stamp-" + Date.now() + Math.floor(Math.random() * 100);
    const newStamp: BoardElement = {
      id,
      type: "stamp",
      x: coords.x - 60,
      y: coords.y - 30,
      width: 140,
      height: 60,
      stampType,
      ...(label ? { label } : {}),
      ...(signatureUrl ? { signatureDataUrl: signatureUrl } : {}),
      zIndex: elements.length + 1,
      updatedAt: Date.now(),
    } as any;

    saveElementLocallyAndSync(id, newStamp);
    pushToUndo({ type: "add", elementId: id, afterData: newStamp });
    setActiveTool("select");
    setSelectedId(id);
    setIsDragging(false);
    showSyncToast("Stamp placed!", "success");
  }, [pendingStampCoords, panX, panY, elements.length, saveElementLocallyAndSync, pushToUndo, showSyncToast, setIsDragging]);


  // Synchronize unsaved changes on tab close or navigation away, and handle instant online/offline syncing
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasUnsavedChanges.current) {
        flushPendingChanges();
      }
    };

    const handleOnline = () => {
      console.log("Device back online. Synchronizing offline progress...");
      showSyncToast("Back Online! Synchronizing offline progress...", "info");
      if (hasUnsavedChanges.current) {
        flushPendingChanges();
      }
    };

    const handleOffline = () => {
      console.log("Device went offline.");
      setSyncStatus('offline');
      showSyncToast("You are offline. Progress is saved locally in buffer.", "warning");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (hasUnsavedChanges.current) {
        flushPendingChanges();
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [flushPendingChanges, showSyncToast]);

  // Fetch board metadata in real time with auto-initialization for stats map fields
  useEffect(() => {
    // Count 1 read for the initial load of the board metadata
    incrementStats('read', 1);
  }, [boardId, incrementStats]);

  useEffect(() => {
    const boardRef = doc(db, "whiteboards", boardId);
    const unsubscribe = onSnapshot(boardRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Auto-initialize stats maps on older boards if they are missing
        if (!data.dailyWrites || !data.dailyReads || !data.teacherDailyWrites) {
          try {
            await updateDoc(boardRef, {
              dailyWrites: data.dailyWrites || {},
              dailyReads: data.dailyReads || {},
              teacherDailyWrites: data.teacherDailyWrites || {}
            });
          } catch (e) {
            console.error("Failed to initialize missing stats maps on board:", e);
          }
        }

        setBoardData({
          id: snapshot.id,
          ...data,
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
  const lastFirestorePresenceWrite = useRef<number>(0);
  const lastSyncedCursorPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateCursorPosition = (clientX: number, clientY: number) => {
    const now = Date.now();
    const isSolo = activeUsersCount <= 1;

    // High performance WebSocket throttle: 50ms. If offline/solo fallback, use 30 seconds or 3 seconds.
    const isWsActive = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    const throttleLimit = isWsActive ? 50 : (isSolo ? 30000 : 3000);
    if (now - lastCursorUpdate.current < throttleLimit) return;

    if (!containerRef.current) return;
    const rect = containerRectRef.current || containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Convert mouse position to whiteboard panned coordinates so cursors align globally
    const canvasX = (mouseX - panX) / zoom;
    const canvasY = (mouseY - panY) / zoom;

    // If collaborating (without WS), only sync if moved at least 50 pixels to save quota
    if (!isWsActive && !isSolo) {
      const dist = Math.sqrt(
        Math.pow(canvasX - lastSyncedCursorPos.current.x, 2) +
        Math.pow(canvasY - lastSyncedCursorPos.current.y, 2)
      );
      if (dist < 50) return;
    }

    lastCursorUpdate.current = now;
    lastSyncedCursorPos.current = { x: canvasX, y: canvasY };

    // High performance: Use WebSocket if connected to bypass Firestore write limits!
    if (isWsActive) {
      wsRef.current!.send(JSON.stringify({
        type: "cursor",
        boardId,
        userId: currentUser.id,
        name: currentUser.name,
        color: currentUser.color,
        role: currentUser.role,
        x: canvasX,
        y: canvasY,
        panX,
        panY,
        zoom,
        lastActive: now
      }));
      
      // Still write a lightweight presence heartbeat to Firestore every 30 seconds to keep activeUsersCount correct for all peers!
      if (now - lastFirestorePresenceWrite.current < 30000) {
        return;
      }
      lastFirestorePresenceWrite.current = now;
    }

    // Fallback: Sync cursor to Firestore if WebSocket is offline
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
      if (!targetElement || targetElement.type === "drawing" || targetElement.type === "connector" || (targetElement as any).locked) return;

      setSelectedId(elementId);
      setIsResizing(true);
      setDragStart({ x: originalEvent.clientX, y: originalEvent.clientY });
      const bounded = targetElement as any;
      setElementStartSize({ w: bounded.width, h: bounded.height });
      setElementStartPos({ x: bounded.x, y: bounded.y });
    };

    window.addEventListener("init-resize", handleResizeStart);
    return () => window.removeEventListener("init-resize", handleResizeStart);
  }, [elements]);

  // Synchronize state and handlers to refs for stable window event listener callbacks
  const clipboardElementsRef = useRef(clipboardElements);
  useEffect(() => {
    clipboardElementsRef.current = clipboardElements;
  }, [clipboardElements]);

  const handlePasteRef = useRef<(() => Promise<void>) | null>(null);

  // Handle Paste events for Images!
  useEffect(() => {
    const handleNativePaste = async (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT"
      ) {
        return; // ignore if user is typing in a sticky note or text input
      }

      const items = e.clipboardData?.items;
      const files = e.clipboardData?.files;
      
      let imageFiles: File[] = [];

      // Extract image files copied directly from disk/file explorer
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file && file.type && file.type.startsWith("image/")) {
            imageFiles.push(file);
          }
        }
      }

      // Fallback or additional item check (copied screenshots, browser copy, etc.)
      if (imageFiles.length === 0 && items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item && item.type && item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            if (file) {
              imageFiles.push(file);
            }
          }
        }
      }

      // If we found image files, paste them
      if (imageFiles.length > 0) {
        if (!canWriteRef.current) {
          e.preventDefault();
          triggerReadOnlyAlert();
          return;
        }

        e.preventDefault(); // stop default browser paste behavior

        for (const file of imageFiles) {
          const result = await compressImage(file);
          if (!result) continue;

          const { base64Str, width: originalWidth, height: originalHeight } = result;

          // Place the image centered in the user's current view
          let x = 100;
          let y = 100;
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            // Map the screen center coordinates to current canvas scale & pan
            x = (centerX - panXRef.current) / zoomRef.current;
            y = (centerY - panYRef.current) / zoomRef.current;
          }

          const id = "img-" + Date.now() + Math.floor(Math.random() * 100);

          let w = originalWidth;
          let h = originalHeight;
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
            zIndex: elementsRef.current.length + 1,
          };

          // Save using centralized queue manager instead of raw setDoc stray documents!
          saveElementLocallyAndSync(id, newImageElement)
            .then(() => {
              pushToUndo({
                type: "add",
                elementId: id,
                afterData: newImageElement,
              });
              // Select the newly pasted image for convenience
              setSelectedId(id);
              setSelectedIds([id]);
            })
            .catch((err) => console.error("Error saving pasted image:", err));
        }
        return;
      }

      // If we DID NOT find images, check if we have copied whiteboard elements in local clipboard
      if (clipboardElementsRef.current.length > 0) {
        if (!canWriteRef.current) {
          e.preventDefault();
          triggerReadOnlyAlert();
          return;
        }
        e.preventDefault();
        if (handlePasteRef.current) {
          handlePasteRef.current();
        }
      }
    };

    window.addEventListener("paste", handleNativePaste);
    return () => window.removeEventListener("paste", handleNativePaste);
  }, [boardId, saveElementLocallyAndSync, pushToUndo]);

  // Handle Board Canvas Mouse Events
  const handleMouseDown = (e: React.PointerEvent) => {
    // Only primary clicks trigger actions
    if (e.button !== 0) return;

    if (followedUserId) {
      setFollowedUserId(null);
    }

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

    // Laser pointer click trigger
    if (activeTool === "laser") {
      const now = Date.now();
      const color = activeColor || "#ef4444";
      const newPt = { x: coords.x, y: coords.y, timestamp: now, color };
      setLocalLaserPoints((prev) => [...prev.filter((p) => now - p.timestamp < 1500), newPt]);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "laser_point",
            boardId,
            userId: currentUser.id,
            x: coords.x,
            y: coords.y,
            color,
            timestamp: now,
          })
        );
      }
      return;
    }

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
      if (localDrawingPathRef.current) localDrawingPathRef.current.setAttribute("d", getSvgPathFromPoints([coords]));
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
      saveElementLocallyAndSync(id, newSticky);
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
      saveElementLocallyAndSync(id, newShape);
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
      saveElementLocallyAndSync(id, newShape);
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
        color: activeColor === "#4b5563" ? "#1e293b" : activeColor,
        fontSize: 18,
        fontFamily: "sans",
        fontWeight: "normal",
        textAlign: "left",
        backgroundColor: "transparent",
        borderStyle: "none",
        zIndex: elements.length + 1,
        reactions: {},
      };
      saveElementLocallyAndSync(id, newText);
      pushToUndo({ type: "add", elementId: id, afterData: newText });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    if (activeTool === "audio") {
      setPendingVoiceCoords(coords);
      setIsVoiceModalOpen(true);
      return;
    }

    if (activeTool === "stamp") {
      setPendingStampCoords(coords);
      setIsStampModalOpen(true);
      return;
    }

    if (activeTool === "math") {
      const id = "math-" + Date.now() + Math.floor(Math.random() * 100);
      const newMathBox: MathElement = {
        id,
        type: "math",
        x: coords.x - 120,
        y: coords.y - 30,
        width: 240,
        height: 60,
        text: "f(x) = x^2 + 2x + 1",
        color: "#1e1b4b",
        fontSize: 20,
        backgroundColor: "#e0e7ff",
        borderStyle: "solid",
        borderColor: "#6366f1",
        zIndex: elements.length + 1,
        reactions: {},
      };
      saveElementLocallyAndSync(id, newMathBox);
      pushToUndo({ type: "add", elementId: id, afterData: newMathBox });
      setActiveTool("select");
      setSelectedId(id);
      return;
    }

    // 5. Default selection click
    if (activeTool === "select") {
      // Clear selection if clicking on the empty background
      if (e.target === e.currentTarget) {
        setSelectedId(null);
        setSelectedIds([]);
        setDragSelectStart(coords);
        setDragSelectEnd(coords);
      }
    }
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    updateCursorPosition(e.clientX, e.clientY);

    // Laser pointer movement tracking
    if (activeToolRef.current === "laser") {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      const now = Date.now();
      const color = activeColorRef.current || "#ef4444";
      const newPt = { x: coords.x, y: coords.y, timestamp: now, color };
      setLocalLaserPoints((prev) => [...prev.filter((p) => now - p.timestamp < 1500), newPt]);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && now - lastStreamBroadcast.current > 20) {
        lastStreamBroadcast.current = now;
        wsRef.current.send(
          JSON.stringify({
            type: "laser_point",
            boardId,
            userId: currentUser.id,
            x: coords.x,
            y: coords.y,
            color,
            timestamp: now,
          })
        );
      }
    }

    // Update connector drawing state
    if (tempConnector) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      setTempConnector({
        ...tempConnector,
        currentPoint: coords,
      });
      return;
    }

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
      if (localDrawingPathRef.current) localDrawingPathRef.current.setAttribute("d", getSvgPathFromPoints(updated));

      // Broadcast active drawing path coordinates to other users over WebSocket for real-time collaboration
      const now = Date.now();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && now - lastStreamBroadcast.current > 40) {
        lastStreamBroadcast.current = now;
        wsRef.current.send(JSON.stringify({
          type: "drawing_stream",
          boardId,
          userId: currentUser.id,
          userName: currentUser.name,
          color: activeTool === "highlighter" ? `${activeColor}80` : activeColor,
          width: activeTool === "highlighter" ? strokeWidth * 2.5 : strokeWidth,
          points: updated,
          isHighlighter: activeTool === "highlighter"
        }));
      }
      return;
    }


    // 4. Moving selected elements
    if (isDragging && selectedIds.length > 0) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      // Determine the reference element (first element in selection that is not a drawing)
      const refId = selectedIds[0];
      const refEl = elementsRef.current.find((el) => el.id === refId);
      const refStartPos = elementStartPositions[refId];

      let snapOffsetX = dx;
      let snapOffsetY = dy;
      let lineX: number | undefined = undefined;
      let lineY: number | undefined = undefined;

      if (refEl && refEl.type !== "drawing" && refStartPos) {
        // Unsnapped coordinate of reference element
        const targetX = refStartPos.x + dx;
        const targetY = refStartPos.y + dy;
        const refW = (refEl as any).width || 150;
        const refH = (refEl as any).height || 150;

        let finalX = targetX;
        let finalY = targetY;

        let xSnapped = false;
        let ySnapped = false;

        // 1. Smart Alignment Snapping with other elements
        const threshold = 8; // snap threshold in canvas pixels

        // Find other elements (not in current selection) to align with
        const otherEls = elementsRef.current.filter(
          (el) =>
            !selectedIds.includes(el.id) &&
            el.type !== "drawing" &&
            el.type !== "connector",
        );

        for (const other of otherEls) {
          const o = other as any;
          const oW = o.width || 150;
          const oH = o.height || 150;

          // X alignments (Left edge, Center, Right edge)
          const targetLeft = targetX;
          const targetCenter = targetX + refW / 2;
          const targetRight = targetX + refW;

          const oLeft = o.x;
          const oCenter = o.x + oW / 2;
          const oRight = o.x + oW;

          if (!xSnapped) {
            if (Math.abs(targetLeft - oLeft) < threshold) {
              finalX = oLeft;
              xSnapped = true;
              lineX = oLeft;
            } else if (Math.abs(targetCenter - oCenter) < threshold) {
              finalX = oCenter - refW / 2;
              xSnapped = true;
              lineX = oCenter;
            } else if (Math.abs(targetRight - oRight) < threshold) {
              finalX = oRight - refW;
              xSnapped = true;
              lineX = oRight;
            } else if (Math.abs(targetLeft - oRight) < threshold) {
              finalX = oRight;
              xSnapped = true;
              lineX = oRight;
            } else if (Math.abs(targetRight - oLeft) < threshold) {
              finalX = oLeft - refW;
              xSnapped = true;
              lineX = oLeft;
            }
          }

          // Y alignments (Top edge, Middle, Bottom edge)
          const targetTop = targetY;
          const targetMiddle = targetY + refH / 2;
          const targetBottom = targetY + refH;

          const oTop = o.y;
          const oMiddle = o.y + oH / 2;
          const oBottom = o.y + oH;

          if (!ySnapped) {
            if (Math.abs(targetTop - oTop) < threshold) {
              finalY = oTop;
              ySnapped = true;
              lineY = oTop;
            } else if (Math.abs(targetMiddle - oMiddle) < threshold) {
              finalY = oMiddle - refH / 2;
              ySnapped = true;
              lineY = oMiddle;
            } else if (Math.abs(targetBottom - oBottom) < threshold) {
              finalY = oBottom - refH;
              ySnapped = true;
              lineY = oBottom;
            } else if (Math.abs(targetTop - oBottom) < threshold) {
              finalY = oBottom;
              ySnapped = true;
              lineY = oBottom;
            } else if (Math.abs(targetBottom - oTop) < threshold) {
              finalY = oTop - refH;
              ySnapped = true;
              lineY = oTop;
            }
          }

          if (xSnapped && ySnapped) break;
        }

        // 2. Grid Snapping fallback (if not aligned to other elements and grid is active)
        if (gridMode !== "none") {
          if (!xSnapped) {
            const snappedX = Math.round(targetX / 20) * 20;
            if (Math.abs(snappedX - targetX) < 10) {
              finalX = snappedX;
              xSnapped = true;
            }
          }
          if (!ySnapped) {
            const snappedY = Math.round(targetY / 20) * 20;
            if (Math.abs(snappedY - targetY) < 10) {
              finalY = snappedY;
              ySnapped = true;
            }
          }
        }

        snapOffsetX = finalX - refStartPos.x;
        snapOffsetY = finalY - refStartPos.y;
      }

      if (lineX !== undefined || lineY !== undefined) {
        setSnapLines({ x: lineX, y: lineY });
      } else {
        setSnapLines(null);
      }

      // Update locally first for instantaneous rendering smoothness
      setElements((prev) =>
        prev.map((el) => {
          if (selectedIds.includes(el.id)) {
            const startPos = elementStartPositions[el.id];
            if (startPos) {
              if (el.type !== "drawing") {
                return {
                  ...el,
                  x: startPos.x + snapOffsetX,
                  y: startPos.y + snapOffsetY,
                };
              } else {
                return {
                  ...el,
                  points: startPos.points.map((p: any) => ({
                    x: p.x + snapOffsetX,
                    y: p.y + snapOffsetY,
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

  const handleMouseUp = async (e: React.PointerEvent) => {
    containerRectRef.current = null;
    setSnapLines(null);

    // Handle Connector tool release gesture
    if (tempConnector) {
      const coords = screenToCanvasCoords(e.clientX, e.clientY);
      const targetEl = elementsRef.current.find((el) => {
        if (el.id === tempConnector.fromId || el.type === "drawing" || el.type === "connector") return false;
        const bounded = el as any;
        const w = bounded.width || 150;
        const h = bounded.height || 150;
        return (
          coords.x >= bounded.x &&
          coords.x <= bounded.x + w &&
          coords.y >= bounded.y &&
          coords.y <= bounded.y + h
        );
      });

      const id = "connector-" + Date.now() + Math.floor(Math.random() * 100);
      let newConnector: ConnectorElement;

      if (targetEl) {
        // Find closest target socket
        let toSocket: "top" | "right" | "bottom" | "left" = "top";
        const bounded = targetEl as any;
        const w = bounded.width || 150;
        const h = bounded.height || 150;
        const relX = (coords.x - bounded.x) / w;
        const relY = (coords.y - bounded.y) / h;
        
        const distToLeft = relX;
        const distToRight = 1 - relX;
        const distToTop = relY;
        const distToBottom = 1 - relY;
        
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        if (minDist === distToTop) toSocket = "top";
        else if (minDist === distToRight) toSocket = "right";
        else if (minDist === distToBottom) toSocket = "bottom";
        else toSocket = "left";

        newConnector = {
          id,
          type: "connector",
          fromId: tempConnector.fromId,
          toId: targetEl.id,
          fromSocket: tempConnector.fromSocket,
          toSocket,
          color: activeColor,
          zIndex: elements.length + 1,
        };
      } else {
        // Connect to the free-floating coordinate point
        newConnector = {
          id,
          type: "connector",
          fromId: tempConnector.fromId,
          fromSocket: tempConnector.fromSocket,
          endPoint: coords,
          color: activeColor,
          zIndex: elements.length + 1,
        };
      }

      try {
        await saveElementLocallyAndSync(id, newConnector);
        pushToUndo({ type: "add", elementId: id, afterData: newConnector });
        setActiveTool("select");
        setSelectedId(id);
      } catch (err) {
        console.error("Error saving connector:", err);
      }

      setTempConnector(null);
      return;
    }

    // 0. Finish drag selection box
    if (dragSelectStart) {
      setDragSelectStart(null);
      setDragSelectEnd(null);
      setIsDragging(false);
      setIsResizing(false);
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

      // Notify remote peers that the active stream has finished and is now being committed
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "drawing_stream_end",
          boardId,
          userId: currentUser.id
        }));
      }

      const points = drawingPointsRef.current;

      if (points.length >= 1) {
        // For a single point, duplicate it with a tiny offset so it renders as a beautiful round dot on canvas
        const finalPoints = points.length === 1
          ? [points[0], { x: points[0].x + 0.1, y: points[0].y + 0.1 }]
          : points;

        const id = "draw-" + Date.now() + Math.floor(Math.random() * 100);
        const isHighlighter = activeTool === "highlighter";
        const newStroke: DrawingElement = {
          id,
          type: "drawing",
          points: finalPoints,
          color: isHighlighter ? `${activeColor}80` : activeColor, // add alpha opacity for highlighter
          width: isHighlighter ? strokeWidth * 2.5 : strokeWidth,
          isHighlighter,
          zIndex: elements.length + 1,
        };

        try {
          await saveElementLocallyAndSync(id, newStroke);
          pushToUndo({ type: "add", elementId: id, afterData: newStroke });

          // Only trigger AI beautification if it's not a highlighter and it actually has more than 2 points (e.g. drawn letters/words)
          if (autoCorrectHandwriting && !isHighlighter && points.length > 2) {
            triggerAiBeautification(newStroke);
          }
        } catch (err) {
          console.error("Error saving sketch:", err);
        }
      }
      drawingPointsRef.current = [];
      if (localDrawingPathRef.current) localDrawingPathRef.current.setAttribute("d", "");
      return;
    }

    // 4. Update elements coordinates in Firestore on move end
    if (isDragging) {
      setIsDragging(false);
      
      if (selectedIds.length > 0) {
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
                  await saveElementLocallyAndSync(el.id, {
                    x: boundedEl.x,
                    y: boundedEl.y,
                  }, true);
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
                  await saveElementLocallyAndSync(el.id, {
                    points: drawingEl.points,
                  }, true);
                } catch (err) {
                  console.error("Error updating moved drawing coordinates:", err);
                }
              }
            }
          }
        }),
      );
      }
      return;
    }

    // 5. Update size in Firestore on resize end
    if (isResizing) {
      setIsResizing(false);
      
      if (selectedId) {
        const el = elements.find((e) => e.id === selectedId);
        if (el && el.type !== "drawing" && el.type !== "connector") {
          const bounded = el as any;
          const hasResized =
            bounded.width !== elementStartSize.w || bounded.height !== elementStartSize.h;
          if (hasResized) {
            pushToUndo({
              type: "update",
              elementId: selectedId,
              beforeData: {
                width: elementStartSize.w,
                height: elementStartSize.h,
              },
              afterData: {
                width: bounded.width,
                height: bounded.height,
              },
            });
          }
          try {
            await saveElementLocallyAndSync(selectedId, {
              width: bounded.width,
              height: bounded.height,
            }, true);
          } catch (err) {
            console.error("Error updating resized element:", err);
          }
        }
      }
      return;
    }
  };

  // Delete an element
  const handleDeleteElement = React.useCallback((id: string) => {
    if (id.startsWith("pdf-page-")) {
      return; // PDF pages are not deletable!
    }
    const target = elementsRef.current.find((el) => el.id === id);
    if (target) {
      pushToUndo({ type: "delete", elementId: id, beforeData: target });
    }

    // Also delete any connectors attached to this element
    const attachedConnectors = elementsRef.current.filter(
      (el) => el.type === "connector" && ((el as any).fromId === id || (el as any).toId === id)
    );
    attachedConnectors.forEach((conn) => {
      pushToUndo({ type: "delete", elementId: conn.id, beforeData: conn });
      saveElementLocallyAndSync(conn.id, null, false, "delete").catch((err) =>
        console.error("Error deleting attached connector:", err)
      );
    });

    saveElementLocallyAndSync(id, null, false, 'delete')
      .then(() => {
        setSelectedId(prev => prev === id ? null : prev);
        setSelectedIds(prev => prev.filter(x => x !== id));
      })
      .catch((err) => console.error("Error deleting element:", err));
  }, [pushToUndo, saveElementLocallyAndSync, setSelectedId, setSelectedIds]);

  // Undo the last action from the local stack
  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, action]);

    try {
      if (action.type === "add") {
        await saveElementLocallyAndSync(action.elementId, null, false, 'delete');
        if (selectedId === action.elementId) {
          setSelectedId(null);
        }
      } else if (action.type === "delete") {
        if (action.beforeData) {
          await saveElementLocallyAndSync(action.elementId, action.beforeData);
        }
      } else if (action.type === "update") {
        if (action.beforeData) {
          await saveElementLocallyAndSync(action.elementId, action.beforeData, true);
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
          await saveElementLocallyAndSync(action.elementId, action.afterData);
        }
      } else if (action.type === "delete") {
        await saveElementLocallyAndSync(action.elementId, null, false, 'delete');
        if (selectedId === action.elementId) {
          setSelectedId(null);
        }
      } else if (action.type === "update") {
        if (action.afterData) {
          await saveElementLocallyAndSync(action.elementId, action.afterData, true);
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
    const maxZ = elements.length > 0 ? Math.max(...elements.map(e => e.zIndex || 0)) : 0;
    const newPasteIds: string[] = [];
    const pastedElements: BoardElement[] = [];

    const isSolo = activeUsersCount <= 1;

    if (isSolo) {
      const currentList = [...elementsRef.current];
      const updatedList = [...currentList];

      for (let i = 0; i < clipboardElements.length; i++) {
        const el = clipboardElements[i];
        const newId = `copy-${Math.random().toString(36).substring(2, 11)}`;
        
        const newEl = JSON.parse(JSON.stringify(el)) as BoardElement;
        newEl.id = newId;
        newEl.zIndex = maxZ + i + 1;
        newEl.updatedAt = Date.now();

        if ('x' in newEl && 'y' in newEl) {
          newEl.x += (offset / zoom);
          newEl.y += (offset / zoom);
        }
        
        if (newEl.type === 'drawing' && 'points' in newEl) {
          newEl.points = newEl.points.map((p: any) => ({ x: p.x + (offset / zoom), y: p.y + (offset / zoom) }));
        }

        updatedList.push(newEl);
        newPasteIds.push(newId);
        pastedElements.push(newEl);

        pendingSyncElements.current[newId] = { data: newEl, action: 'set' };
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });
      }

      setElements(updatedList);
      try {
        localStorage.setItem(`whiteboard_elements_${boardId}`, JSON.stringify(updatedList));
      } catch (e) {
        console.error("Local storage paste save error:", e);
      }

      hasUnsavedChanges.current = true;
      setSyncStatus('saved-local');
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushPendingChanges();
      }, 3000);

      setSelectedIds(newPasteIds);
      setSelectedId(null);
      setClipboardElements(pastedElements);
    } else {
      setSyncStatus('saving-cloud');
      
      const currentList = [...elementsRef.current];
      const updatedList = [...currentList];

      const batch = writeBatch(db);
      const blobUpdates: Record<string, any> = {};

      for (let i = 0; i < clipboardElements.length; i++) {
        const el = clipboardElements[i];
        const newId = `copy-${Math.random().toString(36).substring(2, 11)}`;
        
        const newEl = JSON.parse(JSON.stringify(el)) as BoardElement;
        newEl.id = newId;
        newEl.zIndex = maxZ + i + 1;
        newEl.updatedAt = Date.now();
        if ('x' in newEl && 'y' in newEl) {
          newEl.x += (offset / zoom);
          newEl.y += (offset / zoom);
        }
        
        if (newEl.type === 'drawing' && 'points' in newEl) {
          newEl.points = newEl.points.map((p: any) => ({ x: p.x + (offset / zoom), y: p.y + (offset / zoom) }));
        }

        updatedList.push(newEl);
        newPasteIds.push(newId);
        pastedElements.push(newEl);
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });

        const isDraw = newEl.type === 'drawing';
        const blobId = getBlobRefId(isDraw, newId);
        if (!blobUpdates[blobId]) blobUpdates[blobId] = {};
        
        const { id, ...data } = newEl;
        if (isDraw) {
          blobUpdates[blobId][newId] = { ...data, points: simplifyPoints((data as any).points, 1.2) };
        } else {
          blobUpdates[blobId][newId] = data;
        }
      }

      setElements(updatedList);
      elementsRef.current = updatedList;

      Object.keys(blobUpdates).forEach(blobId => {
        const ref = doc(db, "whiteboards", boardId, "elements", blobId);
        batch.set(ref, { data: blobUpdates[blobId] }, { merge: true });
      });

      try {
        await batch.commit();
        setSyncStatus('synced');
        setSelectedIds(newPasteIds);
        setSelectedId(null);
        setClipboardElements(pastedElements);
        incrementStats('write', clipboardElements.length);
      } catch (err) {
        console.error("Error pasting elements:", err);
        setSyncStatus('offline');
        showSyncToast("Paste failed: " + err.message, "error", 10000);
      }
    }
  };

  useEffect(() => {
    handlePasteRef.current = handlePaste;
  }, [handlePaste]);

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
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        setFollowedUserId(null);
        setSelectedId(null);
        setSelectedIds([]);
        setIsShortcutsOpen(false);
        setIsClearModalOpen(false);
        return;
      }

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
        else if (key === "l") setActiveTool("connector");
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
  const handleSelectElement = React.useCallback((id: string, e: React.MouseEvent) => {
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

    const target = elementsRef.current.find((el) => el.id === id);
    if (!target) return;

    setSelectedIds((prevSelectedIds) => {
      let updatedSelectedIds = [...prevSelectedIds];
      if (e.shiftKey) {
        if (prevSelectedIds.includes(id)) {
          updatedSelectedIds = prevSelectedIds.filter((selected) => selected !== id);
        } else {
          updatedSelectedIds.push(id);
        }
      } else {
        if (!prevSelectedIds.includes(id)) {
          updatedSelectedIds = [id];
        }
      }

      if (canWrite) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });

        // Store starting position for every element in selection
        const positions: Record<string, any> = {};
        elementsRef.current.forEach((el) => {
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
      return updatedSelectedIds;
    });
    setSelectedId(id);
  }, [activeTool, canWrite, handleDeleteElement, setSelectedIds, setSelectedId, setIsDragging, setDragStart, setElementStartPositions]);

  // Update specific values of an element
  const handleUpdateElement = React.useCallback((id: string, updates: Partial<BoardElement>) => {
    const el = elementsRef.current.find((e) => e.id === id);
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

    saveElementLocallyAndSync(id, updates, true).catch((err) =>
      console.error("Error updating element:", err)
    );
  }, [pushToUndo, saveElementLocallyAndSync]);

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
              await saveElementLocallyAndSync(id, { borderColor: color }, true);
            } else {
              await saveElementLocallyAndSync(id, { color }, true);
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
    const elementsToKeep = elements.filter(el => el.id.startsWith("pdf-page-"));
    const elementsToDelete = elements.filter(el => !el.id.startsWith("pdf-page-"));

    // Immediate state and local storage clean
    setElements(elementsToKeep);
    try {
      localStorage.setItem(`whiteboard_elements_${boardId}`, JSON.stringify(elementsToKeep));
    } catch (e) {
      console.error(e);
    }
    setSelectedId(null);
    setSelectedIds([]);
    setUndoStack([]);
    setRedoStack([]);

    const isSolo = activeUsersCount <= 1;

    if (isSolo) {
      // Add all currently loaded elements to pendingSync as deletions
      elementsToDelete.forEach((el) => {
        pendingSyncElements.current[el.id] = { data: null, action: 'delete' };
      });
      hasUnsavedChanges.current = true;
      setSyncStatus('saved-local');
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushPendingChanges();
      }, 1000); // clear board is significant, trigger save faster
    } else {
      setSyncStatus('saving-cloud');
      try {
        const batch = writeBatch(db);
        const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
        const drawingsBlobRef = doc(db, "whiteboards", boardId, "elements", "drawings_blob");
        
        batch.delete(elementsBlobRef);
        batch.delete(drawingsBlobRef);

        elementsToDelete.forEach((el) => {
          const docRef = doc(db, "whiteboards", boardId, "elements", el.id);
          batch.delete(docRef);
        });

        await batch.commit();
        setSyncStatus('synced');
        incrementStats('write', elementsToDelete.length);
      } catch (err) {
        console.error("Error clearing whiteboard:", err);
        setSyncStatus('offline');
      }
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
      incrementStats('write', 1);
    } catch (err) {
      console.error("Error toggling student writing permissions:", err);
    }
  };

  // --- AI CLASSROOM ASSISTANT HELPER FUNCTIONS ---
  // Renders drawings on a temporary client-side high-contrast canvas to feed to Gemini
  const renderStrokesToImage = (strokes: Point[][], strokeColor: string = "#1e293b", strokeWidthValue: number = 4): string => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let hasPoints = false;

    for (const stroke of strokes) {
      for (const pt of stroke) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
        hasPoints = true;
      }
    }

    if (!hasPoints) return "";

    const padding = 24;
    const width = Math.max(50, (maxX - minX) + padding * 2);
    const height = Math.max(50, (maxY - minY) + padding * 2);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidthValue;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x - minX + padding, stroke[0].y - minY + padding);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x - minX + padding, stroke[i].y - minY + padding);
      }
      ctx.stroke();
    }

    return canvas.toDataURL("image/png");
  };

  const triggerAiBeautification = async (stroke: DrawingElement) => {
    if (!userApiKey || !userApiKey.trim()) {
      return; // Do nothing silently if user has not provided their own API key
    }
    try {
      const strokeImage = renderStrokesToImage([stroke.points], "#1e293b", 4);

      const res = await fetch("/api/ai/beautify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({ 
          points: stroke.points,
          image: strokeImage
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        console.error("AI Beautification failed:", errData.error);
        return;
      }
      const data = await res.json();

      if (data.type === "shape" && data.shapeType) {
        // Delete original stroke
        await saveElementLocallyAndSync(stroke.id, null, false, 'delete');

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
        await saveElementLocallyAndSync(shapeId, newShape);
        pushToUndo({ type: "add", elementId: shapeId, afterData: newShape });
      } else if (data.type === "text" && data.text) {
        // Delete original stroke
        await saveElementLocallyAndSync(stroke.id, null, false, 'delete');

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
        await saveElementLocallyAndSync(textId, newText);
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
      const sortedDrawings = [...selectedDrawings].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      const allPoints = sortedDrawings.flatMap((d) => d.points);
      const strokeImage = renderStrokesToImage(sortedDrawings.map((d) => d.points), "#1e293b", 4);

      const res = await fetch("/api/ai/beautify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({ 
          points: allPoints,
          image: strokeImage
        }),
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
            saveElementLocallyAndSync(d.id, null, false, 'delete'),
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
        await saveElementLocallyAndSync(shapeId, newShape);
        setSelectedIds([shapeId]);
        setSelectedId(shapeId);
      } else if (data.type === "text" && data.text) {
        await Promise.all(
          selectedDrawings.map((d) =>
            saveElementLocallyAndSync(d.id, null, false, 'delete'),
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
        await saveElementLocallyAndSync(textId, newText);
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
            } else if (el.type === "math") {
              baseElement.color = el.color || "#1e1b4b";
              baseElement.fontSize = el.fontSize || 20;
              baseElement.backgroundColor = el.backgroundColor || "#e0e7ff";
              baseElement.borderStyle = el.borderStyle || "solid";
              baseElement.borderColor = el.borderColor || "#6366f1";
            }
            await saveElementLocallyAndSync(id, baseElement);
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
      {/* Floating Island Header Controls */}
      <div
        className={`pointer-events-none absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between gap-1.5 z-30 transition-all duration-300 ${
          isZenMode || isTopBarHidden ? "-translate-y-16 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {/* Left Floating Island */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-md hover:shadow-lg p-1 sm:p-1.5 flex items-center space-x-1 sm:space-x-1.5 shrink min-w-0 overflow-x-auto scrollbar-none">
          <button
            onClick={onBackToDashboard}
            className="p-1 sm:p-1.5 hover:bg-slate-100/80 rounded-xl text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1 font-bold text-xs cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden md:inline">All Boards</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 shrink-0 hidden sm:block"></div>

          <div className="flex items-center space-x-1 sm:space-x-2 shrink min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold leading-tight text-slate-900 flex items-center space-x-1">
              <span className="truncate max-w-[70px] sm:max-w-[180px]" title={boardName}>{boardName}</span>
              
              <div className="hidden sm:flex items-center space-x-1.5">
                <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold">
                  Active
                </span>
                {/* Write minimization & offline sync badges */}
                {syncStatus === "synced" && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                    <span>Synced</span>
                  </span>
                )}
                {syncStatus === "saving-cloud" && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                    <span>Syncing</span>
                  </span>
                )}
                {syncStatus === "saved-local" && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1" title="Offline-ready local buffer active. Synced to cloud once you pause or others join.">
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Local Buffer ({activeUsersCount === 1 ? "Solo" : "Collaborating"})</span>
                  </span>
                )}
                {syncStatus === "offline" && (
                  <button
                    onClick={() => {
                      showSyncToast("Attempting to force sync offline progress...", "info");
                      flushPendingChanges();
                    }}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1 cursor-pointer transition-colors"
                    title="No internet connection detected or Firestore offline. Click to manually force synchronize progress with Cloud."
                  >
                    <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse"></span>
                    <span>Offline (Sync Now)</span>
                  </button>
                )}

                {/* WebSocket Status Indicator with Real-Time latency */}
                {wsConnected ? (
                  <span
                    className="bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1"
                    title="Connected to low-latency real-time WebSockets. Cursors and active drawings stream at 60fps."
                  >
                    <Zap className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                    <span>Real-time WS {wsLatency !== null ? `(${wsLatency}ms)` : ""}</span>
                  </span>
                ) : (
                  <span
                    className="bg-slate-50 text-slate-500 border border-slate-100 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold flex items-center space-x-1"
                    title="Disconnected from real-time WebSockets. Reverting to Firestore presence."
                  >
                    <ZapOff className="w-2.5 h-2.5 text-slate-400" />
                    <span>Standard Sync</span>
                  </span>
                )}
              </div>

              {/* Minimal compact indicator dot for mobile */}
              <div className="flex sm:hidden items-center px-0.5">
                <span 
                  className={`w-2 h-2 rounded-full ${
                    syncStatus === "synced" && wsConnected ? "bg-purple-500 animate-pulse" :
                    syncStatus === "synced" ? "bg-emerald-500" :
                    syncStatus === "saving-cloud" ? "bg-blue-500 animate-bounce" :
                    syncStatus === "saved-local" ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                  }`}
                  title={`Status: ${syncStatus} | WS: ${wsConnected ? "Connected" : "Disconnected"}`}
                />
              </div>
            </h2>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 shrink-0 hidden md:block"></div>

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-1.5 md:px-2.5 md:py-1 rounded-xl flex items-center space-x-1 font-bold text-xs transition-all cursor-pointer shrink-0 ${
              undoStack.length > 0
                ? "bg-slate-100 border border-slate-200/80 text-slate-700 hover:bg-slate-200 hover:text-slate-950 hover:scale-[1.02] active:scale-[0.98]"
                : "text-slate-300 bg-slate-50 border border-slate-150 cursor-not-allowed"
            }`}
            title="Undo last action (Ctrl+Z)"
          >
            <Undo
              className={`w-3.5 h-3.5 ${undoStack.length > 0 ? "text-slate-600" : "text-slate-300"}`}
            />
            <span className="hidden md:inline">Undo</span>
            {undoStack.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-extrabold">
                {undoStack.length}
              </span>
            )}
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-1.5 md:px-2.5 md:py-1 rounded-xl flex items-center space-x-1 font-bold text-xs transition-all cursor-pointer shrink-0 ${
              redoStack.length > 0
                ? "bg-slate-100 border border-slate-200/80 text-slate-700 hover:bg-slate-200 hover:text-slate-950 hover:scale-[1.02] active:scale-[0.98]"
                : "text-slate-300 bg-slate-50 border border-slate-150 cursor-not-allowed"
            }`}
            title="Redo last action (Ctrl+Y)"
          >
            <Redo
              className={`w-3.5 h-3.5 ${redoStack.length > 0 ? "text-slate-600" : "text-slate-300"}`}
            />
            <span className="hidden md:inline">Redo</span>
            {redoStack.length > 0 && (
              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-extrabold">
                {redoStack.length}
              </span>
            )}
          </button>
        </div>

        {/* Right Floating Island */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-md hover:shadow-lg p-1 sm:p-1.5 flex items-center space-x-1 sm:space-x-1.5 shrink min-w-0 overflow-x-auto scrollbar-none transition-all">
          <div className="flex items-center space-x-1.5 bg-slate-100/90 p-1 md:px-2.5 md:py-1 rounded-full text-xs font-bold text-slate-600 border border-slate-200/80 shrink-0" title={`${currentUser.name} (You)`}>
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: currentUser.color }}
            />
            <span className="hidden md:inline truncate max-w-[80px]">{currentUser.name} (You)</span>
          </div>

          {/* Online Collaborators Avatars List with Follow Feature */}
          {Object.values(socketCollaboratorsRef.current).map((collab) => {
            if (collab.id === currentUser.id) return null;
            const isFollowed = followedUserId === collab.id;
            return (
              <button
                key={collab.id}
                onClick={() => setFollowedUserId(isFollowed ? null : collab.id)}
                className={`p-1 md:px-2.5 md:py-1 rounded-full flex items-center space-x-1.5 text-xs font-bold transition-all cursor-pointer border shrink-0 ${
                  isFollowed
                    ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/30 scale-105"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:scale-105"
                }`}
                title={isFollowed ? `Stop following ${collab.name}` : `Follow ${collab.name}'s live screen`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: collab.color }}
                />
                <span className="hidden sm:inline truncate max-w-[80px]">{collab.name}</span>
                {collab.role === "teacher" && (
                  <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-extrabold uppercase">
                    Teacher
                  </span>
                )}
                {isFollowed ? (
                  <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                    Following
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-medium">Follow</span>
                )}
              </button>
            );
          })}

          {/* Presenter Mode Button ("Follow Me") */}
          <button
            onClick={() => {
              const nextState = !isPresenterMode;
              setIsPresenterMode(nextState);
              if (nextState) {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: "request_follow",
                    boardId,
                    teacherId: currentUser.id,
                    teacherName: currentUser.name,
                  }));
                }
                showSyncToast("Started Presenter Mode! Team will follow your screen.", "success");
              } else {
                showSyncToast("Exited Presenter Mode.", "info");
              }
            }}
            className={`p-1.5 md:px-2.5 md:py-1 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer border shrink-0 ${
              isPresenterMode
                ? "bg-purple-600 border-purple-700 text-white shadow-md shadow-purple-600/20 ring-2 ring-purple-400"
                : "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
            }`}
            title={isPresenterMode ? "Stop Presenter Mode" : "Start Presenter Mode (Broadcast View)"}
          >
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">{isPresenterMode ? "Presenting" : "Presenter Mode"}</span>
          </button>

          {/* Floating Sprint Timer Button */}
          <button
            onClick={() => setIsTimerOpen(!isTimerOpen)}
            className={`p-1.5 md:px-2.5 md:py-1 rounded-xl font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer border shrink-0 ${
              isTimerOpen
                ? "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/20"
                : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
            }`}
            title="Sprint Timer & Stopwatch"
          >
            <TimerIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Sprint Timer</span>
          </button>

          {/* Teacher control to allow/disallow student writing */}
          {isTeacher ? (
            <button
              onClick={handleToggleStudentsCanWrite}
              className={`p-1.5 md:px-2.5 md:py-1 rounded-xl flex items-center space-x-1.5 font-bold text-xs transition-all cursor-pointer border shrink-0 ${
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
                  <Unlock className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Students Can Write</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="hidden md:inline">Students Locked</span>
                </>
              )}
            </button>
          ) : (
            /* Student status indicator */
            <div
              className={`p-1.5 md:px-2.5 md:py-1 rounded-xl flex items-center space-x-1.5 font-bold text-xs border shrink-0 ${
                studentsCanWrite
                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
              title={studentsCanWrite ? "Collaborative Mode" : "View Only Mode"}
            >
              {studentsCanWrite ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="hidden md:inline">Collaborative Mode</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-500 animate-bounce shrink-0" />
                  <span className="hidden md:inline">View Only Mode</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={`p-1.5 md:px-3 md:py-1 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
              isAiPanelOpen
                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-md border-purple-600 scale-102"
                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-xs"
            }`}
            title="AI Assistant"
          >
            <Sparkles
              className={`w-3.5 h-3.5 shrink-0 ${isAiPanelOpen ? "text-white animate-pulse" : "text-purple-600"}`}
            />
            <span className="hidden lg:inline">AI Assistant</span>
          </button>

          {isPdfBoard && (
            <button
              onClick={handleDownloadPdfWithDrawings}
              disabled={isGeneratingPdf}
              className="p-1.5 md:px-3 md:py-1 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
              title="Download PDF"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="hidden lg:inline">Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden lg:inline">Download PDF</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={copyBoardLink}
            className={`p-1.5 md:px-3 md:py-1 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
              copiedLink
                ? "bg-green-500 text-white shadow-xs"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            }`}
            title="Share Canvas"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">Share Canvas</span>
              </>
            )}
          </button>

          {/* Subtle Button to Hide Header */}
          <button
            onClick={() => setIsTopBarHidden(true)}
            className="p-1.5 hover:bg-slate-100/80 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer shrink-0"
            title="Hide Header Controls"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subtle Floating Toggle Button to Show Header when Hidden */}
      {isTopBarHidden && !isZenMode && (
        <button
          onClick={() => setIsTopBarHidden(false)}
          className="absolute top-3 right-3 z-30 bg-white/95 backdrop-blur-md hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/90 shadow-md hover:shadow-lg rounded-2xl px-3 py-2 flex items-center space-x-1.5 text-xs font-bold cursor-pointer transition-all hover:scale-105 active:scale-95"
          title="Show Header Controls"
        >
          <Eye className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">Header</span>
        </button>
      )}

      {isZenMode && (
        <button
          onClick={handleToggleZenMode}
          className="fixed top-4 right-4 z-50 bg-slate-900/95 hover:bg-slate-800 text-white rounded-full px-4 py-2 flex items-center space-x-2 text-xs font-bold shadow-lg border border-slate-700 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Exit Full Screen Mode (Escape)"
        >
          <Minimize2 className="w-4 h-4 text-slate-300" />
          <span>Exit Full Screen</span>
        </button>
      )}

      {/* Floating vertical sidebar toolbar */}
      {(() => {
        const selectedElements = elements.filter(el => selectedIds.includes(el.id) || el.id === selectedId);
        const hasColorableSelection = selectedElements.length > 0 && selectedElements.some(el => {
          if (el.type === "image") return false;
          if (el.type === "shape") {
            const st = el.shapeType;
            if (st === "cartesian" || st === "advanced-cartesian" || st === "numberline") return false;
          }
          return true;
        });
        return (
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
            hasColorableSelection={hasColorableSelection}
            isPdfMode={isPdfBoard}
            isZenMode={isZenMode}
            onToggleZenMode={handleToggleZenMode}
            isTopBarHidden={isTopBarHidden}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenClearModal={() => setIsClearModalOpen(true)}
            onToggleTimer={() => setIsTimerOpen(!isTimerOpen)}
            isTimerOpen={isTimerOpen}
          />
        );
      })()}

      {/* Main Interactive Interactive Zoomable & Pannable Canvas Container */}
      <div
        ref={containerRef}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerLeave={handleMouseUp}
        onPointerCancel={handleMouseUp}
        className="w-full h-full relative outline-none select-none touch-none"
        style={{
          touchAction: "none",
          cursor:
            activeTool === "pan"
              ? isPanning
                ? "grabbing"
                : "grab"
              : activeTool === "pencil"
                ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'/><path d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'/></svg>") 0 24, crosshair`
                : activeTool === "highlighter"
                  ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ca8a04' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m15 5 4 4'/><path d='M19 17V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2Z'/></svg>") 0 24, crosshair`
                  : activeTool === "eraser"
                    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23dc2626' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21Z'/><path d='M22 21H7'/></svg>") 0 24, pointer`
                    : activeTool === "text"
                      ? "text"
                      : activeTool === "sticky"
                        ? "cell"
                        : activeTool === "shape" || activeTool === "cartesian"
                          ? "crosshair"
                          : "default",
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
            willChange: "transform",
          }}
        >
          {/* 1. Interactive DOM elements Layer (Sticky notes, Shapes, Textboxes) */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {sortedElements.map((el) => {
              if (el.type === "drawing") return null;
              
              const isSelected = selectedIds.includes(el.id);
              const isInteractive =
                activeTool === "select" || activeTool === "eraser";

              return (
                <ElementWrapper
                  key={el.id}
                  el={el}
                  isSelected={isSelected}
                  isInteractive={isInteractive}
                  currentUser={currentUser}
                  zoom={zoom}
                  isDragging={isDragging}
                  isResizing={isResizing}
                  selectedIdsLength={selectedIds.length}
                  activeTool={activeTool}
                  canWrite={canWrite}
                  onSelectElement={handleSelectElement}
                  onUpdateElement={handleUpdateElement}
                  onDeleteElement={handleDeleteElement}
                />
              );
            })}
          </div>

          {/* 1.5. Connection Sockets Handles Overlay (shown when Connector Tool is active) */}
          {activeTool === "connector" && (
            <div className="absolute inset-0 pointer-events-none z-30">
              {elements
                .filter(el => el.type !== "drawing" && el.type !== "connector")
                .map(el => {
                  const bounded = el as any;
                  const w = bounded.width || 150;
                  const h = bounded.height || 150;
                  
                  const sockets: ("top" | "right" | "bottom" | "left")[] = ["top", "right", "bottom", "left"];
                  
                  return (
                    <div
                      key={`sockets-${el.id}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: bounded.x,
                        top: bounded.y,
                        width: w,
                        height: h,
                      }}
                    >
                      {sockets.map(s => {
                        let style: React.CSSProperties = {};
                        switch (s) {
                          case "top": style = { top: -7, left: "50%", transform: "translateX(-50%)" }; break;
                          case "right": style = { top: "50%", right: -7, transform: "translateY(-50%)" }; break;
                          case "bottom": style = { bottom: -7, left: "50%", transform: "translateX(-50%)" }; break;
                          case "left": style = { top: "50%", left: -7, transform: "translateY(-50%)" }; break;
                        }
                        
                        return (
                          <div
                            key={s}
                            className="absolute w-3.5 h-3.5 bg-blue-500 border-2 border-white rounded-full shadow-md pointer-events-auto cursor-crosshair transition-all hover:scale-125 active:bg-blue-600"
                            style={style}
                            title={`Drag from ${s} connector`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const coords = screenToCanvasCoords(e.clientX, e.clientY);
                              setTempConnector({
                                fromId: el.id,
                                fromSocket: s,
                                startPoint: getElementSocketCoords(el, s),
                                currentPoint: coords
                              });
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Render remote collaborator selection borders */}
          {elements.map((el) => {
            if (el.type === "drawing" || el.type === "connector") return null;
            
            const focusedBy = Object.entries(remoteSelections).find(
              ([uId, sel]) => sel.selectedIds && sel.selectedIds.includes(el.id)
            );
            
            if (!focusedBy) return null;
            
            const [focusedUserId, focusInfo] = focusedBy;
            if (focusedUserId === currentUser.id) return null;

            const bounded = el as any;

            return (
              <div
                key={`remote-focus-${el.id}`}
                className="absolute pointer-events-none border transition-all duration-150 z-30"
                style={{
                  left: (bounded.x || 0) - 2,
                  top: (bounded.y || 0) - 2,
                  width: (bounded.width || 100) + 4,
                  height: (bounded.height || 80) + 4,
                  borderColor: focusInfo.color,
                  borderStyle: "dashed",
                  borderWidth: "2px",
                  borderRadius: "8px",
                  boxShadow: `0 0 0 1px ${focusInfo.color}33`,
                }}
              >
                <div
                  className="absolute left-[-2px] top-[-18px] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap shadow-xs pointer-events-none"
                  style={{ backgroundColor: focusInfo.color }}
                >
                  {focusInfo.userName}
                </div>
              </div>
            );
          })}

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
            {/* Fading Laser Pointer Trails Layer (Local & Remote) */}
            {(() => {
              const allLaserStreams: { color: string; points: LaserPoint[] }[] = [];
              if (localLaserPoints.length > 0) {
                allLaserStreams.push({ color: activeColor || "#ef4444", points: localLaserPoints });
              }
              Object.values(remoteLaserPoints).forEach((pts) => {
                if (pts.length > 0) {
                  allLaserStreams.push({ color: pts[0]?.color || "#ef4444", points: pts });
                }
              });

              if (allLaserStreams.length === 0) return null;
              const now = Date.now();

              return (
                <g className="pointer-events-none z-30">
                  {allLaserStreams.map((stream, sIdx) => {
                    if (stream.points.length === 0) return null;
                    const pts = stream.points;
                    const color = stream.color || "#ef4444";
                    const latestPoint = pts[pts.length - 1];

                    return (
                      <g key={`laser-stream-${sIdx}`}>
                        {/* Fading laser stroke segments */}
                        {pts.slice(1).map((pt, idx) => {
                          const prevPt = pts[idx];
                          const age = now - pt.timestamp;
                          const alpha = Math.max(0, 1 - age / 1500);
                          const strokeW = 3 + alpha * 5;

                          return (
                            <line
                              key={`laser-line-${idx}`}
                              x1={prevPt.x}
                              y1={prevPt.y}
                              x2={pt.x}
                              y2={pt.y}
                              stroke={color}
                              strokeWidth={strokeW}
                              strokeLinecap="round"
                              opacity={alpha}
                              style={{
                                filter: `drop-shadow(0 0 6px ${color})`,
                              }}
                            />
                          );
                        })}

                        {/* Glowing Laser Pointer Tip Dot */}
                        {latestPoint && (
                          <g transform={`translate(${latestPoint.x}, ${latestPoint.y})`}>
                            <circle
                              r="12"
                              fill={color}
                              opacity="0.3"
                              className="animate-ping"
                            />
                            <circle
                              r="6"
                              fill={color}
                              opacity="0.9"
                              style={{ filter: `drop-shadow(0 0 10px ${color})` }}
                            />
                            <circle
                              r="2.5"
                              fill="#ffffff"
                            />
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })()}
            {/* Render saved drawings */}
            {elements
              .filter((el) => el.type === "drawing")
              .map((el: any) => {
                const isSelected = selectedIds.includes(el.id);
                const isInteractive =
                  activeTool === "select" || activeTool === "eraser";
                return (
                  <DrawingItem
                    key={el.id}
                    el={el}
                    isSelected={isSelected}
                    isInteractive={isInteractive}
                    activeTool={activeTool}
                    handleSelectElement={handleSelectElement}
                  />
                );
              })}
            {/* Render current local drawing imperatively */}
            <path
              ref={localDrawingPathRef}
              d=""
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
            {/* Render remote active drawing streams */}
            <RemoteDrawingStreamsLayer streamsRef={remoteDrawingStreamsRef} dirtyRef={remoteDrawingStreamsDirtyRef} />

            {/* Snap Alignment Guides */}
            {snapLines && snapLines.x !== undefined && (
              <line
                x1={snapLines.x}
                y1={-50000}
                x2={snapLines.x}
                y2={50000}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
            {snapLines && snapLines.y !== undefined && (
              <line
                x1={-50000}
                y1={snapLines.y}
                x2={50000}
                y2={snapLines.y}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}

            {/* Render Saved Connector Lines */}
            {elements
              .filter((el) => el.type === "connector")
              .map((el) => {
                const conn = el as ConnectorElement;
                const fromEl = elements.find((e) => e.id === conn.fromId);
                const toEl = conn.toId ? elements.find((e) => e.id === conn.toId) : null;
                
                if (!fromEl) return null;
                
                const start = getElementSocketCoords(fromEl, conn.fromSocket);
                const end = toEl ? getElementSocketCoords(toEl, conn.toSocket || "top") : (conn.endPoint || start);
                
                const pathD = getConnectorPath(start, end, conn.fromSocket, toEl ? conn.toSocket : undefined);
                const isSelected = selectedIds.includes(conn.id) || selectedId === conn.id;
                
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const angle = Math.atan2(dy, dx);
                
                const arrowLength = 12;
                const arrowAngle = Math.PI / 6;
                const arrowTip = end;
                const arrowLeftX = end.x - arrowLength * Math.cos(angle - arrowAngle);
                const arrowLeftY = end.y - arrowLength * Math.sin(angle - arrowAngle);
                const arrowRightX = end.x - arrowLength * Math.cos(angle + arrowAngle);
                const arrowRightY = end.y - arrowLength * Math.sin(angle + arrowAngle);
                
                const color = conn.color || "#4b5563";
                
                return (
                  <g key={conn.id} className="pointer-events-none">
                    {/* Invisible thicker selection target path */}
                    {activeTool === "select" && (
                      <path
                        d={pathD}
                        stroke="transparent"
                        strokeWidth="16"
                        fill="none"
                        className="pointer-events-auto cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectElement(conn.id, e);
                        }}
                      />
                    )}
                    
                    {/* Selected highlight path */}
                    {isSelected && (
                      <path
                        d={pathD}
                        stroke="#3b82f6"
                        strokeWidth="5"
                        strokeLinecap="round"
                        fill="none"
                        opacity="0.3"
                      />
                    )}
                    
                    {/* Main visible path */}
                    <path
                      d={pathD}
                      stroke={color}
                      strokeWidth={isSelected ? "3.5" : "2.5"}
                      strokeLinecap="round"
                      fill="none"
                    />
                    
                    {/* Arrowhead polygon */}
                    <polygon
                      points={`${arrowTip.x},${arrowTip.y} ${arrowLeftX},${arrowLeftY} ${arrowRightX},${arrowRightY}`}
                      fill={color}
                    />
                  </g>
                );
              })}

            {/* Render temporary active connector line */}
            {tempConnector && (
              <g>
                <path
                  d={getConnectorPath(tempConnector.startPoint, tempConnector.currentPoint, tempConnector.fromSocket)}
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeDasharray="4 4"
                  fill="none"
                />
                <circle
                  cx={tempConnector.currentPoint.x}
                  cy={tempConnector.currentPoint.y}
                  r="5"
                  fill="#3b82f6"
                />
              </g>
            )}
          </svg>

          {/* 3. Real-Time Collaborative Cursors Tracker Overlay */}
          <LiveCursors
            boardId={boardId}
            currentUser={currentUser}
            zoom={zoom}
            socketCollaboratorsRef={wsConnected ? socketCollaboratorsRef : undefined}
          />

        </div>
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

      {/* Offline Sync Floating Toast Notice */}
      {syncNotification.visible && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center space-x-2.5 border transition-all duration-300 ${
          syncNotification.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          syncNotification.type === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          syncNotification.type === 'warning' ? 'bg-amber-500 text-white border-amber-400' :
          'bg-blue-600 text-white border-blue-500'
        }`}>
          {syncNotification.type === 'success' && <Check className="w-4 h-4 text-white shrink-0" />}
          {syncNotification.type === 'error' && <WifiOff className="w-4 h-4 text-white shrink-0" />}
          {syncNotification.type === 'warning' && <WifiOff className="w-4 h-4 text-white shrink-0" />}
          {syncNotification.type === 'info' && <Wifi className="w-4 h-4 text-white shrink-0 animate-pulse" />}
          <span className="text-xs font-semibold tracking-wide">
            {syncNotification.message}
          </span>
          <button 
            onClick={() => setSyncNotification(prev => ({ ...prev, visible: false }))}
            className="text-white hover:text-white/80 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
          className="absolute right-2 left-2 sm:left-auto sm:right-4 top-16 bottom-20 sm:bottom-24 w-[calc(100vw-16px)] sm:w-[420px] bg-white rounded-2xl border border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden text-slate-800"
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

      {/* Floating Follow Indicator Banner */}
      {followedUserId && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700/80 flex items-center space-x-3 animate-fade-in">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span>
              Following <strong className="text-blue-400 font-extrabold">{socketCollaboratorsRef.current[followedUserId]?.name || "Collaborator"}</strong>'s view
            </span>
          </div>
          <button
            onClick={() => setFollowedUserId(null)}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
          >
            Stop Following (Esc)
          </button>
        </div>
      )}

      {/* Minimap Navigation Control */}
      {!isZenMode && (
        <div className="fixed bottom-16 sm:bottom-6 right-3 sm:right-6 z-30 flex flex-col items-end space-y-2">
          <Minimap
            elements={elements}
            panX={panX}
            panY={panY}
            zoom={zoom}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
            onPanTo={(newPanX, newPanY) => {
              setPanX(newPanX);
              setPanY(newPanY);
            }}
          />
        </div>
      )}

      {/* Presenter Mode Live Indicator Border */}
      {isPresenterMode && (
        <div className="fixed inset-0 border-4 border-purple-500/80 pointer-events-none z-30 shadow-[inset_0_0_24px_rgba(168,85,247,0.35)] animate-pulse" />
      )}

      {/* Floating Workspace Sprint Timer & Stopwatch Widget */}
      <WorkspaceTimer
        isOpen={isTimerOpen}
        onClose={() => setIsTimerOpen(false)}
        onTimerSync={handleTimerSync}
        syncedState={syncedTimerState}
      />

      {/* Helper Modals */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <ClearCanvasModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearBoard}
        elementCount={elements.length}
      />

      {/* Kami Page Navigation Bar for PDF boards */}
      {isPdfBoard && pdfPages.length > 0 && (
        <PdfPageNavigation
          pdfPages={pdfPages}
          currentPageIndex={activePdfPageIndex}
          onJumpToPage={handleJumpToPdfPage}
          onInsertBlankPage={handleInsertBlankPdfPage}
          onExportPdf={handleDownloadPdfWithDrawings}
          isExporting={isGeneratingPdf}
        />
      )}

      {/* Voice Note Recording Modal */}
      <VoiceRecordModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSaveAudio={handleSaveVoiceNote}
      />

      {/* Stamp & Signature Picker Modal */}
      <StampPickerModal
        isOpen={isStampModalOpen}
        onClose={() => setIsStampModalOpen(false)}
        onSelectStamp={handleSaveStamp}
      />
    </div>
  );
}
