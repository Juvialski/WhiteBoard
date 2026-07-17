export type ElementType = "sticky" | "shape" | "text" | "drawing" | "image";

export type ShapeType =
  | "rect"
  | "circle"
  | "diamond"
  | "triangle"
  | "star"
  | "hexagon"
  | "pentagon"
  | "parallelogram"
  | "right-triangle"
  | "line"
  | "cartesian"
  | "numberline"
  | "advanced-cartesian";

export interface Point {
  x: number;
  y: number;
}

export interface ImageElement {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Base64 data URL
  reactions?: Record<string, string[]>; // emoji -> array of userNames
  zIndex: number;
  updatedAt?: number;
  locked?: boolean;
}

export interface StickyElement {
  id: string;
  type: "sticky";
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
  locked?: boolean;
}

export interface ShapeElement {
  id: string;
  type: "shape";
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

  graphPanX?: number;
  graphPanY?: number;

  // Cartesian plane specific advanced properties
  equation?: string; // e.g. "y = 2x + 1" or "x^2 - 2"
  equation2?: string; // second equation, e.g. "y = -x"
  equation3?: string; // third equation, e.g. "y = sin(x)"
  equationMin?: string;
  equationMax?: string;
  equations?: { id: string; expr: string; color: string; min?: string; max?: string }[];
  plottedPoints?: string; // comma-separated points, e.g., "(1,2), (-2,3)"
  plottedLines?: {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
  cartesianRange?: number; // axis maximum scale (e.g., 5 or 10)
  axisFontSize?: number; // font size for axis labels
  locked?: boolean;
}

export interface TextElement {
  id: string;
  type: "text";
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
  locked?: boolean;
}

export interface DrawingElement {
  id: string;
  type: "drawing";
  points: Point[];
  color: string;
  width: number;
  isHighlighter: boolean;
  zIndex: number;
  updatedAt?: number;
  locked?: boolean;
}

export type BoardElement =
  StickyElement | ShapeElement | TextElement | DrawingElement | ImageElement;

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
  studentsCanWrite?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  color: string;
  role?: "student" | "teacher";
  photoURL?: string;
  email?: string;
}
