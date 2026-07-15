export type ElementType = 'sticky' | 'shape' | 'text' | 'drawing' | 'connector' | 'image';

export type ShapeType = 'rect' | 'circle' | 'diamond' | 'triangle' | 'star' | 'hexagon' | 'pentagon' | 'parallelogram' | 'right-triangle' | 'line';

export interface Point {
  x: number;
  y: number;
}

export interface ImageElement {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Base64 data URL
  reactions?: Record<string, string[]>; // emoji -> array of userNames
  zIndex: number;
  updatedAt?: number;
}

export interface StickyElement {
  id: string;
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string; // hex or tailwind class name
  textColor?: string;
  reactions?: Record<string, string[]>; // emoji -> array of userNames
  zIndex: number;
  updatedAt?: number;
}

export interface ShapeElement {
  id: string;
  type: 'shape';
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string; // fill color
  borderColor: string;
  textColor?: string;
  reactions?: Record<string, string[]>; // emoji -> array of userNames
  zIndex: number;
  updatedAt?: number;
}

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string; // text color
  fontSize: number;
  reactions?: Record<string, string[]>; // emoji -> array of userNames
  zIndex: number;
  updatedAt?: number;
}

export interface DrawingElement {
  id: string;
  type: 'drawing';
  points: Point[];
  color: string;
  width: number;
  isHighlighter: boolean;
  zIndex: number;
  updatedAt?: number;
}

export interface ConnectorElement {
  id: string;
  type: 'connector';
  fromId?: string; // Connected shape/sticky ID
  fromX?: number;  // Fallback start coordinates if not connected to an element
  fromY?: number;
  toId?: string;   // Connected shape/sticky ID
  toX?: number;    // Fallback end coordinates if not connected to an element
  toY?: number;
  text?: string;
  color: string;
  zIndex: number;
  updatedAt?: number;
}

export type BoardElement =
  | StickyElement
  | ShapeElement
  | TextElement
  | DrawingElement
  | ConnectorElement
  | ImageElement;

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  lastActive: number;
}

export interface Whiteboard {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  createdBy: string;
  studentId?: string; // If assigned to a specific student
  studentName?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  color: string;
}
