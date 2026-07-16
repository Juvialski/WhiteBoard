import React, { useState, useRef, useEffect } from "react";
import { ShapeElement, UserProfile, ShapeType } from "../types";
import { Smile, Trash2, TrendingUp, Plus, X, Layers, Lock, Unlock } from "lucide-react";

/**
 * Safely parses and evaluates algebraic mathematical functions like f(x) = y
 * with restricted safe character sets.
 */
function evaluateMathExpression(expr: string, xVal: number): number | null {
  try {
    let clean = expr.trim().toLowerCase();
    if (clean.startsWith("y=")) {
      clean = clean.substring(2);
    } else if (clean.startsWith("y =")) {
      clean = clean.substring(3);
    } else if (clean.startsWith("f(x)=")) {
      clean = clean.substring(5);
    } else if (clean.startsWith("f(x) =")) {
      clean = clean.substring(6);
    }

    clean = clean.trim();
    if (!clean) return null;

    if (clean.startsWith("x=") || clean.startsWith("x =")) {
      return null; // Handled separately as a vertical line
    }

    // Replace algebraic 'x' with actual numeric value inside parenthesis
    let formula = clean.replace(/\b(x)\b/g, `(${xVal})`);

    // Replace exponents ^ with JS operator **
    formula = formula.replace(/\^/g, "**");

    // Add implicit multiplication, e.g. "2(" -> "2*("
    formula = formula.replace(/(\d)\s*\(/g, "$1*(");

    // Support key common math functions
    formula = formula.replace(/\bsin\b/g, "Math.sin");
    formula = formula.replace(/\bcos\b/g, "Math.cos");
    formula = formula.replace(/\btan\b/g, "Math.tan");
    formula = formula.replace(/\babs\b/g, "Math.abs");
    formula = formula.replace(/\bsqrt\b/g, "Math.sqrt");
    formula = formula.replace(/\bpi\b/g, "Math.PI");

    // Strictly validate expression elements to prevent XSS or malicious code execution
    const sanitizedFormula = formula.replace(
      /[^0-9+\-*/().\s*Math\.sincostanbsqrPIe]/g,
      "",
    );

    const result = new Function(`return (${sanitizedFormula})`)();
    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function getVerticalLineConstant(expr: string): number | null {
  let clean = expr.trim().toLowerCase();
  if (clean.startsWith("x=")) {
    clean = clean.substring(2).trim();
  } else if (clean.startsWith("x =")) {
    clean = clean.substring(3).trim();
  } else {
    return null;
  }
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

interface ShapeComponentProps {
  element: ShapeElement;
  isSelected: boolean;
  currentUser: UserProfile;
  zoom: number;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<ShapeElement>) => void;
  onDelete: () => void;
  isDraggingOrResizing: boolean;
  activeTool?: string;
  canWrite?: boolean;
}

const EMOJIS = ["👍", "❤️", "🔥", "💡", "❓", "🎉"];

export default function ShapeComponent({
  element,
  isSelected,
  currentUser,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  isDraggingOrResizing,
  activeTool = "select",
  canWrite = true,
}: ShapeComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(element.text);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cartesian Advanced States
  const [showMathPanel, setShowMathPanel] = useState(false);
  const [equationInput, setEquationInput] = useState(element.equation || "");
  const [equationsArray, setEquationsArray] = useState(element.equations || []);
  const [pointsInput, setPointsInput] = useState("");
  const [rangeInput, setRangeInput] = useState(element.cartesianRange || 5);
  const [axisFontSize, setAxisFontSize] = useState(element.axisFontSize || 10);
  const [hoveredCoord, setHoveredCoord] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Interactive Graphing States
  const [graphInteractionMode, setGraphInteractionMode] = useState<
    "none" | "point" | "line" | "erase" | "move"
  >("none");
  const [graphPan, setGraphPan] = useState({
    x: element.graphPanX || 0,
    y: element.graphPanY || 0,
  });
  const [isPanningGraph, setIsPanningGraph] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });
  const [lineStartPoint, setLineStartPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const [draggingLineIdx, setDraggingLineIdx] = useState<{
    idx: number;
    startX: number;
    startY: number;
    initialLine: { x1: number; y1: number; x2: number; y2: number };
  } | null>(null);
  const [tempLinesList, setTempLinesList] = useState(
    element.plottedLines || [],
  );

  useEffect(() => {
    setTempLinesList(element.plottedLines || []);
  }, [element.plottedLines]);
  const [tempPointsList, setTempPointsList] = useState<
    { x: number; y: number }[]
  >([]);

  useEffect(() => {
    setEquationInput(element.equation || "");
    setEquationsArray(element.equations || []);
    // Manual point input doesn't need to sync on load
    setRangeInput(element.cartesianRange || 5);
    setAxisFontSize(element.axisFontSize || 10);

    // Parse points for local drag state
    const parsed: { x: number; y: number }[] = [];
    if (element.plottedPoints) {
      const regex = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/g;
      let match;
      while ((match = regex.exec(element.plottedPoints)) !== null) {
        const px = parseFloat(match[1]);
        const py = parseFloat(match[2]);
        if (!isNaN(px) && !isNaN(py)) {
          parsed.push({ x: px, y: py });
        }
      }
    }
    setTempPointsList(parsed);
  }, [
    element.equation,
    element.equations,
    element.plottedPoints,
    element.cartesianRange,
    element.axisFontSize,
  ]);

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
      case "circle":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
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
      case "triangle":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${w / 2},${strokeWidth} ${strokeWidth},${h - strokeWidth} ${w - strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "diamond":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${w / 2},${strokeWidth} ${w - strokeWidth},${h / 2} ${w / 2},${h - strokeWidth} ${strokeWidth},${h / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "star":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 100 100`}
            preserveAspectRatio="none"
          >
            <polygon
              points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "hexagon":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${w * 0.25},${strokeWidth} ${w * 0.75},${strokeWidth} ${w - strokeWidth},${h / 2} ${w * 0.75},${h - strokeWidth} ${w * 0.25},${h - strokeWidth} ${strokeWidth},${h / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "pentagon":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${w / 2},${strokeWidth} ${w - strokeWidth},${h * 0.38} ${w * 0.82},${h - strokeWidth} ${w * 0.18},${h - strokeWidth} ${strokeWidth},${h * 0.38}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "parallelogram":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${w * 0.25},${strokeWidth} ${w - strokeWidth},${strokeWidth} ${w * 0.75},${h - strokeWidth} ${strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "right-triangle":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <polygon
              points={`${strokeWidth},${strokeWidth} ${strokeWidth},${h - strokeWidth} ${w - strokeWidth},${h - strokeWidth}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      case "line":
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
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
      case "advanced-cartesian": {
        const cx = w / 2 + graphPan.x;
        const cy = h / 2 + graphPan.y;
        const range = element.cartesianRange || 5;
        const scaleX = (w - 40) / (range * 2);
        const scaleY = (h - 40) / (range * 2);

        const gridLines: React.ReactNode[] = [];
        const xTicks: React.ReactNode[] = [];
        const yTicks: React.ReactNode[] = [];

        const minI = Math.min(
          Math.floor((10 - cx) / scaleX),
          Math.floor((cy - h + 10) / scaleY)
        ) - 1;
        const maxI = Math.max(
          Math.ceil((w - 10 - cx) / scaleX),
          Math.ceil((cy - 10) / scaleY)
        ) + 1;

        // Draw grid lines and ticks
        for (let i = minI; i <= maxI; i++) {
          const xPos = cx + i * scaleX;
          const yPos = cy - i * scaleY;

          // Vertical grid line (except axes center)
          if (i !== 0 && xPos > 10 && xPos < w - 10) {
            gridLines.push(
              <line
                key={`adv-grid-v-${i}`}
                x1={xPos}
                y1={15}
                x2={xPos}
                y2={h - 15}
                stroke="rgba(148, 163, 184, 0.15)"
                strokeWidth={0.8}
              />,
            );
            xTicks.push(
              <g key={`adv-xtick-${i}`}>
                <line
                  x1={xPos}
                  y1={cy - 4}
                  x2={xPos}
                  y2={cy + 4}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
                <text
                  x={xPos}
                  y={cy + 12 + axisFontSize * 0.4}
                  textAnchor="middle"
                  fontSize={axisFontSize}
                  fontWeight="bold"
                  fill={stroke}
                  opacity={0.85}
                  className="select-none font-mono"
                >
                  {i}
                </text>
              </g>,
            );
          }

          // Horizontal grid line (except axes center)
          if (i !== 0 && yPos > 10 && yPos < h - 10) {
            gridLines.push(
              <line
                key={`adv-grid-h-${i}`}
                x1={15}
                y1={yPos}
                x2={w - 15}
                y2={yPos}
                stroke="rgba(148, 163, 184, 0.15)"
                strokeWidth={0.8}
              />,
            );
            yTicks.push(
              <g key={`adv-ytick-${i}`}>
                <line
                  x1={cx - 4}
                  y1={yPos}
                  x2={cx + 4}
                  y2={yPos}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
                <text
                  x={cx - 10}
                  y={yPos + axisFontSize * 0.3}
                  textAnchor="end"
                  fontSize={axisFontSize}
                  fontWeight="bold"
                  fill={stroke}
                  opacity={0.85}
                  className="select-none font-mono"
                >
                  {i}
                </text>
              </g>,
            );
          }
        }

        // Multiple equations
        const equations = [
          {
            expr: element.equation || "",
            color: "#6366f1",
            label: "y1",
            min: element.equationMin,
            max: element.equationMax,
          },
          ...(element.equations || []).map((eq, i) => ({
            expr: eq.expr,
            color: eq.color,
            label: `y${i + 2}`,
            min: eq.min,
            max: eq.max,
          })),
        ];

        const equationPaths: React.ReactNode[] = [];
        const criticalPoints: {
          x: number;
          y: number;
          color: string;
          label: string;
        }[] = [];

        equations.forEach(({ expr, color, label, min, max }, index) => {
          const numMin =
            min && !isNaN(parseFloat(min)) ? parseFloat(min) : undefined;
          const numMax =
            max && !isNaN(parseFloat(max)) ? parseFloat(max) : undefined;
          if (!expr) return;

          let equationPath = "";
          const verticalConstant = getVerticalLineConstant(expr);
          if (verticalConstant !== null) {
            const xPos = cx + verticalConstant * scaleX;
            if (xPos >= 15 && xPos <= w - 15) {
              equationPath = `M ${xPos} 15 L ${xPos} ${h - 15}`;
            }
          } else {
            let first = true;
            // Sample across width to build continuous curve
            for (let px = 20; px <= w - 20; px += 2) {
              const xVal = (px - cx) / scaleX;
              if (numMin !== undefined && xVal < numMin) {
                first = true;
                continue;
              }
              if (numMax !== undefined && xVal > numMax) {
                first = true;
                continue;
              }
              const yVal = evaluateMathExpression(expr, xVal);
              if (yVal !== null && !isNaN(yVal) && isFinite(yVal)) {
                const py = cy - yVal * scaleY;
                // Ensure path points remain reasonably bounded
                if (py >= 0 && py <= h) {
                  if (first) {
                    equationPath += `M ${px} ${py}`;
                    first = false;
                  } else {
                    equationPath += ` L ${px} ${py}`;
                  }
                } else {
                  // Break path continuity if it goes out of range
                  first = true;
                }
              }
            }

            // Calculate y-intercept critical point at x=0
            const yAt0 = evaluateMathExpression(expr, 0);
            if (
              yAt0 !== null &&
              !isNaN(yAt0) &&
              isFinite(yAt0)
            ) {
              const ptYPos = cy - yAt0 * scaleY;
              const ptXPos = cx;
              if (ptYPos >= 0 && ptYPos <= h && ptXPos >= 0 && ptXPos <= w) {
                criticalPoints.push({
                  x: 0,
                  y: yAt0,
                  color,
                  label: `${label} y-int`,
                });
              }
            }
          }

          if (equationPath) {
            equationPaths.push(
              <g key={`adv-eq-${index}`}>
                <path
                  d={equationPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={20}
                  style={{
                    pointerEvents: "stroke",
                    cursor: "default",
                  }}
                  onMouseDown={(e) => {
                    if (activeTool === "eraser" || (activeTool === "select" && !isSelected)) return;
                  }}
                />
                <path
                  d={equationPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none drop-shadow-sm transition-all"
                />
              </g>,
            );
          }
        });

        // Parse plotted points
        const plottedPointsList: { x: number; y: number }[] = [];
        if (element.plottedPoints) {
          const regex = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/g;
          let match;
          while ((match = regex.exec(element.plottedPoints)) !== null) {
            const px = parseFloat(match[1]);
            const py = parseFloat(match[2]);
            if (!isNaN(px) && !isNaN(py)) {
              plottedPointsList.push({ x: px, y: py });
            }
          }
        }

        return (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{
              pointerEvents: "auto",
              backgroundColor: fill || "rgba(255,255,255,0.95)",
              borderRadius: "12px",
              border: `1.5px solid ${stroke}40`,
              cursor: ["point", "line", "erase"].includes(graphInteractionMode)
                ? "crosshair"
                : graphInteractionMode === "move"
                  ? "move"
                  : "default",
            }}
            onMouseDown={(e) => {
              if (activeTool === "eraser" || (activeTool === "select" && !isSelected)) return;
              if (graphInteractionMode !== "none") {
                e.stopPropagation();
              }
              if (graphInteractionMode === "move") {
                setIsPanningGraph(true);
                setLastPanPos({ x: e.clientX, y: e.clientY });
              }
            }}
            onMouseMove={(e) => {
              if (isPanningGraph) {
                const dx = e.clientX - lastPanPos.x;
                const dy = e.clientY - lastPanPos.y;
                setGraphPan({ x: graphPan.x + dx, y: graphPan.y + dy });
                setLastPanPos({ x: e.clientX, y: e.clientY });
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const scaleRatioX = w / rect.width;
              const scaleRatioY = h / rect.height;
              const x = (e.clientX - rect.left) * scaleRatioX;
              const y = (e.clientY - rect.top) * scaleRatioY;
              const plotX = (x - cx) / scaleX;
              const plotY = (cy - y) / scaleY;

              if (x >= 10 && x <= w - 10 && y >= 10 && y <= h - 10) {
                setHoveredCoord({ x: plotX, y: plotY });
              } else {
                setHoveredCoord(null);
              }

              if (draggingPointIdx !== null) {
                const newPoints = [...tempPointsList];
                newPoints[draggingPointIdx] = { x: plotX, y: plotY };
                setTempPointsList(newPoints);
              }
              if (draggingLineIdx !== null) {
                const dx = plotX - draggingLineIdx.startX;
                const dy = plotY - draggingLineIdx.startY;
                const newLines = [...tempLinesList];
                newLines[draggingLineIdx.idx] = {
                  ...newLines[draggingLineIdx.idx],
                  x1: draggingLineIdx.initialLine.x1 + dx,
                  y1: draggingLineIdx.initialLine.y1 + dy,
                  x2: draggingLineIdx.initialLine.x2 + dx,
                  y2: draggingLineIdx.initialLine.y2 + dy,
                };
                setTempLinesList(newLines);
              }
            }}
            onMouseLeave={() => {
              if (isPanningGraph) {
                setIsPanningGraph(false);
                onUpdate({ graphPanX: graphPan.x, graphPanY: graphPan.y });
                return;
              }
              setHoveredCoord(null);
              if (draggingPointIdx !== null) {
                const ptsStr = tempPointsList
                  .map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
                  .join(", ");
                
                onUpdate({ plottedPoints: ptsStr });
                setDraggingPointIdx(null);
              }
              if (draggingLineIdx !== null) {
                onUpdate({ plottedLines: tempLinesList });
                setDraggingLineIdx(null);
              }
            }}
            onMouseUp={() => {
              if (isPanningGraph) {
                setIsPanningGraph(false);
                onUpdate({ graphPanX: graphPan.x, graphPanY: graphPan.y });
                return;
              }
              if (draggingPointIdx !== null) {
                const ptsStr = tempPointsList
                  .map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
                  .join(", ");
                
                onUpdate({ plottedPoints: ptsStr });
                setDraggingPointIdx(null);
              }
              if (draggingLineIdx !== null) {
                onUpdate({ plottedLines: tempLinesList });
                setDraggingLineIdx(null);
              }
            }}
            onClick={(e) => {
              if (!isSelected) return;
              if (draggingPointIdx !== null) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const scaleRatioX = w / rect.width;
              const scaleRatioY = h / rect.height;
              const x = (e.clientX - rect.left) * scaleRatioX;
              const y = (e.clientY - rect.top) * scaleRatioY;
              const plotX = (x - cx) / scaleX;
              const plotY = (cy - y) / scaleY;

              if (graphInteractionMode === "point") {
                const newPoints = [...tempPointsList, { x: plotX, y: plotY }];
                setTempPointsList(newPoints);
                const ptsStr = newPoints
                  .map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
                  .join(", ");
                onUpdate({ plottedPoints: ptsStr });
              } else if (graphInteractionMode === "line") {
                if (!lineStartPoint) {
                  setLineStartPoint({ x: plotX, y: plotY });
                } else {
                  const newLine = {
                    id: Math.random().toString(),
                    x1: lineStartPoint.x,
                    y1: lineStartPoint.y,
                    x2: plotX,
                    y2: plotY,
                  };
                  const newLines = [...(element.plottedLines || []), newLine];
                  onUpdate({ plottedLines: newLines });
                  setLineStartPoint(null);
                }
              }
            }}
          >
            <defs>
              <marker
                id={`arrow-${element.id}`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>

            {/* Grid lines */}
            {gridLines}

            {/* X Axis */}
            <line
              x1={15}
              y1={cy}
              x2={w - 15}
              y2={cy}
              stroke={stroke}
              strokeWidth={2}
              markerStart={`url(#arrow-${element.id})`}
              markerEnd={`url(#arrow-${element.id})`}
            />
            {/* Y Axis */}
            <line
              x1={cx}
              y1={15}
              x2={cx}
              y2={h - 15}
              stroke={stroke}
              strokeWidth={2}
              markerStart={`url(#arrow-${element.id})`}
              markerEnd={`url(#arrow-${element.id})`}
            />

            {/* Origin Label */}
            <text
              x={cx - axisFontSize * 0.9}
              y={cy + axisFontSize * 1.2}
              fontSize={axisFontSize}
              fontWeight="bold"
              fill={stroke}
              opacity={0.85}
              className="select-none font-mono"
            >
              0
            </text>

            {/* Axis Name Labels */}
            <text
              x={w - 22}
              y={cy - 8}
              fontSize="11"
              fontWeight="bold"
              fill={stroke}
              className="select-none font-sans italic"
            >
              x
            </text>
            <text
              x={cx + 8}
              y={25}
              fontSize="11"
              fontWeight="bold"
              fill={stroke}
              className="select-none font-sans italic"
            >
              y
            </text>

            {/* Ticks & Numbers */}
            {xTicks}
            {yTicks}

            {/* Equation Curves */}
            {equationPaths}

            {/* Critical Points (e.g. Y-Intercepts) */}
            {criticalPoints.map((pt, idx) => {
              const xPos = cx + pt.x * scaleX;
              const yPos = cy - pt.y * scaleY;
              return (
                <g key={`adv-crit-${idx}`} className="group/crit">
                  <circle
                    cx={xPos}
                    cy={yPos}
                    r={4}
                    fill={pt.color}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  {/* Subtle popover details on hover */}
                  <g className="opacity-0 group-hover/crit:opacity-100 transition-opacity pointer-events-none">
                    <rect
                      x={xPos - 30}
                      y={yPos - 22}
                      width="60"
                      height="14"
                      rx="3"
                      fill="rgba(15, 23, 42, 0.9)"
                    />
                    <text
                      x={xPos}
                      y={yPos - 12}
                      fontSize="7"
                      fontWeight="bold"
                      fill="#ffffff"
                      textAnchor="middle"
                      className="font-mono"
                    >
                      (0, {pt.y.toFixed(1)})
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Plotted Lines */}
            {tempLinesList.map((line, idx) => {
              const x1Pos = cx + line.x1 * scaleX;
              const y1Pos = cy - line.y1 * scaleY;
              const x2Pos = cx + line.x2 * scaleX;
              const y2Pos = cy - line.y2 * scaleY;
              return (
                <g key={`adv-line-${line.id}`}>
                  <line
                    x1={x1Pos}
                    y1={y1Pos}
                    x2={x2Pos}
                    y2={y2Pos}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{
                      pointerEvents: "stroke",
                      cursor:
                        graphInteractionMode === "none" ||
                        graphInteractionMode === "move"
                          ? draggingLineIdx?.idx === idx
                            ? "grabbing"
                            : "grab"
                          : "crosshair",
                    }}
                    onMouseDown={(e) => {
                      if (activeTool === "eraser" || (activeTool === "select" && !isSelected)) return;
                      if (
                        graphInteractionMode === "point" ||
                        graphInteractionMode === "line"
                      )
                        return;
                      e.stopPropagation();
                      const rect = e.currentTarget
                        .closest("svg")!
                        .getBoundingClientRect();
                      const plotX =
                        ((e.clientX - rect.left) * (w / rect.width) - cx) /
                        scaleX;
                      const plotY =
                        (cy - (e.clientY - rect.top) * (h / rect.height)) /
                        scaleY;
                      setDraggingLineIdx({
                        idx,
                        startX: plotX,
                        startY: plotY,
                        initialLine: {
                          x1: line.x1,
                          y1: line.y1,
                          x2: line.x2,
                          y2: line.y2,
                        },
                      });
                    }}
                  />
                  <line
                    x1={x1Pos}
                    y1={y1Pos}
                    x2={x2Pos}
                    y2={y2Pos}
                    stroke="#10b981"
                    strokeWidth={3}
                    className="pointer-events-none drop-shadow-sm transition-all"
                  />
                </g>
              );
            })}

            {/* Active Drawing Line */}
            {lineStartPoint &&
              hoveredCoord &&
              graphInteractionMode === "line" && (
                <line
                  x1={cx + lineStartPoint.x * scaleX}
                  y1={cy - lineStartPoint.y * scaleY}
                  x2={cx + hoveredCoord.x * scaleX}
                  y2={cy - hoveredCoord.y * scaleY}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  opacity={0.6}
                />
              )}

            {/* Plotted Points */}
            {tempPointsList.map((pt, idx) => {
              const xPos = cx + pt.x * scaleX;
              const yPos = cy - pt.y * scaleY;

              // Only draw if point lies within visual bounds
              if (
                xPos >= 10 &&
                xPos <= w - 10 &&
                yPos >= 10 &&
                yPos <= h - 10
              ) {
                return (
                  <g key={`adv-pt-${idx}`}>
                    <circle
                      cx={xPos}
                      cy={yPos}
                      r={20}
                      fill="transparent"
                      style={{
                        pointerEvents: "all",
                        cursor:
                          graphInteractionMode === "none" ||
                          graphInteractionMode === "move"
                            ? draggingPointIdx === idx
                              ? "grabbing"
                              : "grab"
                            : "crosshair",
                      }}
                      onMouseDown={(e) => {
                        if (activeTool === "eraser" || (activeTool === "select" && !isSelected)) return;
                        if (
                          graphInteractionMode === "point" ||
                          graphInteractionMode === "line"
                        )
                          return;
                        e.stopPropagation();
                        setDraggingPointIdx(idx);
                      }}
                    />
                    <circle
                      cx={xPos}
                      cy={yPos}
                      r={6}
                      fill="#ec4899"
                      stroke="#ffffff"
                      strokeWidth={2}
                      className="pointer-events-none drop-shadow-sm"
                    />
                    <text
                      x={xPos + 8}
                      y={yPos - 6}
                      fontSize={Math.max(10, axisFontSize * 0.8)}
                      fontWeight="bold"
                      fill="#be185d"
                      className="font-mono bg-white/80 select-none pointer-events-none"
                    >
                      ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
                    </text>
                  </g>
                );
              }
              return null;
            })}

            {/* Hovered Dynamic Coordinate HUD and Guides */}
            {hoveredCoord && (
              <g>
                {/* Horizontal guide dashed line from cursor to y-axis */}
                <line
                  x1={cx + hoveredCoord.x * scaleX}
                  y1={cy - hoveredCoord.y * scaleY}
                  x2={cx}
                  y2={cy - hoveredCoord.y * scaleY}
                  stroke="#818cf8"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.8}
                />
                {/* Vertical guide dashed line from cursor to x-axis */}
                <line
                  x1={cx + hoveredCoord.x * scaleX}
                  y1={cy - hoveredCoord.y * scaleY}
                  x2={cx + hoveredCoord.x * scaleX}
                  y2={cy}
                  stroke="#818cf8"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.8}
                />
                {/* Hover tracking circle */}
                <circle
                  cx={cx + hoveredCoord.x * scaleX}
                  cy={cy - hoveredCoord.y * scaleY}
                  r={4.5}
                  fill="#4f46e5"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                {/* HUD Panel on the bottom right of the plane */}
                <g transform={`translate(${w - 95}, ${h - 32})`}>
                  <rect
                    width="80"
                    height="20"
                    rx="5"
                    fill="rgba(15, 23, 42, 0.85)"
                  />
                  <text
                    x="40"
                    y="13"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    className="font-mono"
                  >
                    ({hoveredCoord.x.toFixed(1)}, {hoveredCoord.y.toFixed(1)})
                  </text>
                </g>
              </g>
            )}
          </svg>
        );
      }
      case "cartesian": {
        const cx = w / 2;
        const cy = h / 2;
        const gridStep = 30;
        const gridLines: React.ReactNode[] = [];

        // Vertical grid lines (left of center)
        for (let x = cx - gridStep; x > 0; x -= gridStep) {
          gridLines.push(
            <line
              key={`grid-v-left-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={h}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth={0.8}
            />,
          );
        }
        // Vertical grid lines (right of center)
        for (let x = cx + gridStep; x < w; x += gridStep) {
          gridLines.push(
            <line
              key={`grid-v-right-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={h}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth={0.8}
            />,
          );
        }
        // Horizontal grid lines (above center)
        for (let y = cy - gridStep; y > 0; y -= gridStep) {
          gridLines.push(
            <line
              key={`grid-h-above-${y}`}
              x1={0}
              y1={y}
              x2={w}
              y2={y}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth={0.8}
            />,
          );
        }
        // Horizontal grid lines (below center)
        for (let y = cy + gridStep; y < h; y += gridStep) {
          gridLines.push(
            <line
              key={`grid-h-below-${y}`}
              x1={0}
              y1={y}
              x2={w}
              y2={y}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth={0.8}
            />,
          );
        }

        // Draw ticks and tick numbers on X axis
        const xTicks: React.ReactNode[] = [];
        let tickNum = 1;
        for (let x = cx + gridStep; x < w - 15; x += gridStep) {
          xTicks.push(
            <g key={`xtick-pos-${x}`}>
              <line
                x1={x}
                y1={cy - 4}
                x2={x}
                y2={cy + 4}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={cy + 13}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {tickNum}
              </text>
            </g>,
          );
          tickNum++;
        }
        tickNum = -1;
        for (let x = cx - gridStep; x > 15; x -= gridStep) {
          xTicks.push(
            <g key={`xtick-neg-${x}`}>
              <line
                x1={x}
                y1={cy - 4}
                x2={x}
                y2={cy + 4}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={cy + 13}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {tickNum}
              </text>
            </g>,
          );
          tickNum--;
        }

        // Draw ticks and tick numbers on Y axis
        const yTicks: React.ReactNode[] = [];
        tickNum = 1;
        for (let y = cy - gridStep; y > 15; y -= gridStep) {
          yTicks.push(
            <g key={`ytick-pos-${y}`}>
              <line
                x1={cx - 4}
                y1={y}
                x2={cx + 4}
                y2={y}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={cx - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {tickNum}
              </text>
            </g>,
          );
          tickNum++;
        }
        tickNum = -1;
        for (let y = cy + gridStep; y < h - 15; y += gridStep) {
          yTicks.push(
            <g key={`ytick-neg-${y}`}>
              <line
                x1={cx - 4}
                y1={y}
                x2={cx + 4}
                y2={y}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={cx - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {tickNum}
              </text>
            </g>,
          );
          tickNum--;
        }

        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            style={{
              backgroundColor: fill || "rgba(255,255,255,0.92)",
              borderRadius: "12px",
              border: `1px solid ${stroke}25`,
            }}
          >
            <defs>
              <marker
                id={`arrow-${element.id}`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>

            {/* Grid lines */}
            {gridLines}

            {/* X Axis */}
            <line
              x1={15}
              y1={cy}
              x2={w - 15}
              y2={cy}
              stroke={stroke}
              strokeWidth={2}
              markerStart={`url(#arrow-${element.id})`}
              markerEnd={`url(#arrow-${element.id})`}
            />
            {/* Y Axis */}
            <line
              x1={cx}
              y1={15}
              x2={cx}
              y2={h - 15}
              stroke={stroke}
              strokeWidth={2}
              markerStart={`url(#arrow-${element.id})`}
              markerEnd={`url(#arrow-${element.id})`}
            />

            {/* Origin Label */}
            <text
              x={cx - 8}
              y={cy + 11}
              fontSize="9"
              fontWeight="bold"
              fill={stroke}
              opacity={0.85}
              className="select-none font-mono"
            >
              0
            </text>

            {/* Axis Name Labels */}
            <text
              x={w - 22}
              y={cy - 8}
              fontSize="11"
              fontWeight="bold"
              fill={stroke}
              className="select-none font-sans italic"
            >
              x
            </text>
            <text
              x={cx + 8}
              y={25}
              fontSize="11"
              fontWeight="bold"
              fill={stroke}
              className="select-none font-sans italic"
            >
              y
            </text>

            {/* Ticks & Numbers */}
            {xTicks}
            {yTicks}
          </svg>
        );
      }
      case "numberline": {
        const cy = h / 2 - 5;
        const cx = w / 2;
        const step = 35;
        const tickLines: React.ReactNode[] = [];

        // Center tick
        tickLines.push(
          <g key="numtick-0">
            <line
              x1={cx}
              y1={cy - 6}
              x2={cx}
              y2={cy + 6}
              stroke={stroke}
              strokeWidth={2}
            />
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              fontSize="10"
              fontWeight="extrabold"
              fill={stroke}
              opacity={0.9}
              className="select-none font-mono"
            >
              0
            </text>
          </g>,
        );

        // Positive ticks
        let val = 1;
        for (let x = cx + step; x < w - 20; x += step) {
          tickLines.push(
            <g key={`numtick-pos-${x}`}>
              <line
                x1={x}
                y1={cy - 5}
                x2={x}
                y2={cy + 5}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={cy + 16}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {val}
              </text>
            </g>,
          );
          val++;
        }

        // Negative ticks
        val = -1;
        for (let x = cx - step; x > 20; x -= step) {
          tickLines.push(
            <g key={`numtick-neg-${x}`}>
              <line
                x1={x}
                y1={cy - 5}
                x2={x}
                y2={cy + 5}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={cy + 16}
                textAnchor="middle"
                fontSize="9"
                fontWeight="bold"
                fill={stroke}
                opacity={0.85}
                className="select-none font-mono"
              >
                {val}
              </text>
            </g>,
          );
          val--;
        }

        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            style={{ backgroundColor: fill || "transparent" }}
          >
            <defs>
              <marker
                id={`arrow-${element.id}`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>

            {/* The main horizontal line */}
            <line
              x1={20}
              y1={cy}
              x2={w - 20}
              y2={cy}
              stroke={stroke}
              strokeWidth={2.5}
              markerStart={`url(#arrow-${element.id})`}
              markerEnd={`url(#arrow-${element.id})`}
            />

            {/* Ticks & values */}
            {tickLines}
          </svg>
        );
      }
      case "rect":
      default:
        return (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
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

  const isDarkFill = element.color === "#4b5563";
  const textColorClass = isDarkFill ? "text-white" : "text-slate-800";

  const cursorClass = element.locked
    ? "cursor-default"
    : activeTool === "select"
      ? "cursor-grab active:cursor-grabbing"
      : activeTool === "eraser"
        ? "cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-rose-500 hover:ring-offset-1 transition-all"
        : "cursor-default";

  return (
    <div
      onMouseDown={onSelect}
      className={`absolute select-none flex flex-col justify-between transition-shadow duration-150 group ${cursorClass} ${
        isSelected ? "z-20" : "hover:shadow-xs"
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
          style={{ margin: "-2px" }}
        />
      )}

      {/* Text Container centered inside shape */}
      {!(
        element.shapeType === "cartesian" ||
        element.shapeType === "advanced-cartesian" ||
        element.shapeType === "numberline"
      ) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 overflow-hidden z-10">
          {isEditing && !element.locked ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onBlur={handleBlur}
              className={`w-full h-full bg-transparent border-none resize-none focus:outline-none text-center font-bold text-sm ${textColorClass}`}
              placeholder="Type note..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  textareaRef.current?.blur();
                }
              }}
            />
          ) : (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!canWrite || element.locked) return;
                setIsEditing(true);
              }}
              className={`w-full h-full text-center flex items-center justify-center font-bold text-sm overflow-auto select-text break-words cursor-text ${textColorClass}`}
            >
              {element.text ||
                (canWrite ? (
                  <span className="opacity-20 italic text-xs">Double tap</span>
                ) : (
                  ""
                ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Emoji Bar Above the Shape (Lucidspark style) */}
      {isSelected && !isDraggingOrResizing && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full shadow-lg px-2.5 py-1.5 flex items-center space-x-2 z-30 animate-fade-in whitespace-nowrap animate-scale-up"
        >
          {/* Reaction Emojis list */}
          <div className="flex items-center space-x-1 border-r border-slate-100 pr-2">
            {/* Lock Trigger */}
            {canWrite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ locked: !element.locked });
                }}
                className={`w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer ${
                  element.locked ? "text-amber-600 bg-amber-50" : "text-slate-500"
                }`}
                title={element.locked ? "Unlock Shape" : "Lock Shape"}
              >
                {element.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            )}

            {EMOJIS.map((emoji) => {
              const users = (element.reactions || {})[emoji] || [];
              const isReacted = users.includes(currentUser.name);
              return (
                <button
                  key={emoji}
                  onClick={(e) => handleEmojiClick(emoji, e)}
                  className={`w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm transition-transform hover:scale-125 ${
                    isReacted ? "bg-blue-100 ring-1 ring-blue-400" : ""
                  }`}
                  title={
                    users.length > 0 ? `${emoji}: ${users.join(", ")}` : emoji
                  }
                >
                  {emoji}
                </button>
              );
            })}
          </div>
          {/* Quick Color Selector */}
          {canWrite && (
            <div className="relative border-r border-slate-100 pr-2 flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
                className="w-6 h-6 rounded-full border border-slate-300 relative transition-transform hover:scale-110 flex items-center justify-center cursor-pointer shadow-xs"
                style={{
                  backgroundColor:
                    element.shapeType === "cartesian" ||
                    element.shapeType === "advanced-cartesian" ||
                    element.shapeType === "numberline" ||
                    element.shapeType === "line"
                      ? element.borderColor || "#1e293b"
                      : element.color || "#ffffff",
                }}
                title="Change color"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800/30" />
              </button>

              {showColorPicker && (
                <div className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 grid grid-cols-8 gap-1.5 z-40 animate-scale-up w-[212px]">
                  {[
                    "#fef08a",
                    "#fbcfe8",
                    "#bfdbfe",
                    "#bbf7d0",
                    "#fed7aa",
                    "#e9d5ff",
                    "#99f6e4",
                    "#fecaca",
                    "#e11d48",
                    "#f97316",
                    "#059669",
                    "#2563eb",
                    "#7c3aed",
                    "#64748b",
                    "#ffffff",
                    "#000000",
                  ].map((color) => {
                    const isSelected =
                      element.shapeType === "cartesian" ||
                      element.shapeType === "advanced-cartesian" ||
                      element.shapeType === "numberline" ||
                      element.shapeType === "line"
                        ? element.borderColor === color
                        : element.color === color;
                    const isDarkColor = [
                      "#e11d48",
                      "#f97316",
                      "#059669",
                      "#2563eb",
                      "#7c3aed",
                      "#64748b",
                      "#000000",
                    ].includes(color);
                    return (
                      <button
                        key={color}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            element.shapeType === "cartesian" ||
                            element.shapeType === "advanced-cartesian" ||
                            element.shapeType === "numberline" ||
                            element.shapeType === "line"
                          ) {
                            onUpdate({ borderColor: color });
                          } else {
                            onUpdate({ color });
                          }
                          setShowColorPicker(false);
                        }}
                        className={`w-5 h-5 rounded-full border relative transition-all hover:scale-120 cursor-pointer ${
                          isSelected
                            ? "ring-2 ring-blue-500 ring-offset-1 border-white scale-105"
                            : "border-slate-200"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      >
                        {isSelected && (
                          <div
                            className={`absolute inset-0 m-auto w-1.5 h-1.5 rounded-full ${isDarkColor ? "bg-white" : "bg-slate-800"}`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canWrite && (
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
          )}
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
              users.includes(currentUser.name)
                ? "bg-blue-50 border-blue-200 text-blue-900"
                : "text-slate-600"
            }`}
            title={users.join(", ")}
          >
            <span>{emoji}</span>
            <span className="text-[9px] ml-0.5 font-bold opacity-80">
              {users.length}
            </span>
          </button>
        ))}
      </div>

      {/* Resize handle */}
      {isSelected && canWrite && !element.locked && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 pointer-events-auto z-20"
          onMouseDown={(e) => {
            e.stopPropagation();
            const canvasEvent = new CustomEvent("init-resize", {
              detail: {
                elementId: element.id,
                originalEvent: { clientX: e.clientX, clientY: e.clientY },
              },
            });
            window.dispatchEvent(canvasEvent);
          }}
        >
          <div className="w-2 h-2 rounded-full bg-blue-600 mr-0.5 mb-0.5 shadow-xs" />
        </div>
      )}

      {/* Advanced Cartesian Objects Panel */}
      {isSelected && canWrite && element.shapeType === "advanced-cartesian" && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-full top-0 mr-4 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-4 w-[240px] z-30 pointer-events-auto animate-scale-up flex flex-col space-y-4 text-left select-text max-h-[80vh] overflow-y-auto"
        >
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-xs text-slate-800">
                Objects
              </h4>
              <p className="text-[10px] text-slate-400">
                Plotted elements
              </p>
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            {/* Equations */}
            <div className="flex flex-col space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equations</span>
              {element.equation && (
                <div className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                  <span className="truncate pr-2"><span className="text-indigo-500 font-mono font-medium">y1=</span> {element.equation}</span>
                  <button onClick={() => {
                    setEquationInput("");
                    onUpdate({ equation: "", equationMin: "", equationMax: "" });
                  }} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {element.equations?.map((eq, i) => (
                <div key={eq.id} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                  <span className="truncate pr-2"><span className="text-indigo-500 font-mono font-medium">y{i+2}=</span> {eq.expr}</span>
                  <button onClick={() => {
                    const newEqs = element.equations?.filter(e => e.id !== eq.id);
                    onUpdate({ equations: newEqs });
                  }} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {!element.equation && (!element.equations || element.equations.length === 0) && (
                 <span className="text-[10px] text-slate-400 italic">No equations plotted.</span>
              )}
            </div>

            {/* Points */}
            <div className="flex flex-col space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Points</span>
              {tempPointsList.map((pt, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                  <span className="font-mono truncate pr-2">({pt.x.toFixed(2)}, {pt.y.toFixed(2)})</span>
                  <button onClick={() => {
                    const newPts = tempPointsList.filter((_, i) => i !== idx);
                    setTempPointsList(newPts);
                    const ptsStr = newPts.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(", ");
                    onUpdate({ plottedPoints: ptsStr });
                  }} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {tempPointsList.length === 0 && (
                <span className="text-[10px] text-slate-400 italic">No points plotted.</span>
              )}
            </div>

            {/* Lines */}
            <div className="flex flex-col space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lines</span>
              {tempLinesList.map((line, idx) => (
                <div key={line.id} className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
                  <span className="font-mono text-[10px] truncate pr-2" title={`(${line.x1.toFixed(1)},${line.y1.toFixed(1)}) → (${line.x2.toFixed(1)},${line.y2.toFixed(1)})`}>
                    ({line.x1.toFixed(1)},{line.y1.toFixed(1)}) → ({line.x2.toFixed(1)},{line.y2.toFixed(1)})
                  </span>
                  <button onClick={() => {
                    const newLines = tempLinesList.filter(l => l.id !== line.id);
                    setTempLinesList(newLines);
                    onUpdate({ plottedLines: newLines });
                  }} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {tempLinesList.length === 0 && (
                <span className="text-[10px] text-slate-400 italic">No lines plotted.</span>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* Advanced Cartesian Settings Panel (Mini Desmos) */}
      {isSelected && canWrite && element.shapeType === "advanced-cartesian" && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute left-full top-0 ml-4 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-4 w-[280px] z-30 pointer-events-auto animate-scale-up flex flex-col space-y-4 text-left select-text"
        >
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-xs text-slate-800">
                Advanced Plotter
              </h4>
              <p className="text-[10px] text-slate-400">
                Mini-Desmos Equation Plotter
              </p>
            </div>
          </div>

          {/* Equation Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider flex items-center justify-between">
              <span>
                Equation f(x){" "}
                <span className="text-indigo-400 font-normal lowercase">
                  (y1)
                </span>
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 font-mono text-xs">
                y =
              </span>
              <input
                type="text"
                value={equationInput}
                onChange={(e) => {
                  setEquationInput(e.target.value);
                  onUpdate({ equation: e.target.value });
                }}
                placeholder="x^2 - 3"
                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-indigo-200/50 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-indigo-700"
              />
            </div>
            <div className="flex space-x-2 mt-1">
              <div className="flex-1 flex items-center space-x-1">
                <span className="text-[10px] text-slate-400">Min x:</span>
                <input
                  type="text"
                  value={element.equationMin || ""}
                  onChange={(e) => onUpdate({ equationMin: e.target.value })}
                  placeholder="-∞"
                  className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 flex items-center space-x-1">
                <span className="text-[10px] text-slate-400">Max x:</span>
                <input
                  type="text"
                  value={element.equationMax || ""}
                  onChange={(e) => onUpdate({ equationMax: e.target.value })}
                  placeholder="∞"
                  className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Dynamic Equations Array */}
            {equationsArray.map((eq, index) => (
              <div key={eq.id || index} className="mt-2">
                <label
                  className="text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-between mb-1"
                  style={{ color: eq.color }}
                >
                  <span>
                    Equation{" "}
                    <span className="font-normal lowercase">
                      (y{index + 2})
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      const newEqs = equationsArray.filter(
                        (_, i) => i !== index,
                      );
                      setEquationsArray(newEqs);
                      onUpdate({ equations: newEqs });
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </label>
                <div className="relative">
                  <span
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs"
                    style={{ color: eq.color }}
                  >
                    y =
                  </span>
                  <input
                    type="text"
                    value={eq.expr}
                    onChange={(e) => {
                      const newEqs = [...equationsArray];
                      newEqs[index].expr = e.target.value;
                      setEquationsArray(newEqs);
                      onUpdate({ equations: newEqs });
                    }}
                    placeholder="x^2"
                    className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:bg-white"
                    style={{
                      color: eq.color,
                      borderColor: `${eq.color}40`,
                      outlineColor: eq.color,
                    }}
                  />
                </div>
                <div className="flex space-x-2 mt-1">
                  <div className="flex-1 flex items-center space-x-1">
                    <span className="text-[10px] text-slate-400">Min x:</span>
                    <input
                      type="text"
                      value={eq.min || ""}
                      onChange={(e) => {
                        const newEqs = [...equationsArray];
                        newEqs[index].min = e.target.value;
                        setEquationsArray(newEqs);
                        onUpdate({ equations: newEqs });
                      }}
                      placeholder="-∞"
                      className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1 flex items-center space-x-1">
                    <span className="text-[10px] text-slate-400">Max x:</span>
                    <input
                      type="text"
                      value={eq.max || ""}
                      onChange={(e) => {
                        const newEqs = [...equationsArray];
                        newEqs[index].max = e.target.value;
                        setEquationsArray(newEqs);
                        onUpdate({ equations: newEqs });
                      }}
                      placeholder="∞"
                      className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                const EQUATION_COLORS = [
                  "#ef4444", // red
                  "#f59e0b", // amber
                  "#10b981", // emerald
                  "#3b82f6", // blue
                  "#8b5cf6", // violet
                  "#ec4899", // pink
                  "#14b8a6", // teal
                  "#f97316", // orange
                ];
                const usedColors = new Set(
                  equationsArray.map((eq) => eq.color).concat(["#6366f1"]),
                );
                let nextColor =
                  EQUATION_COLORS.find((c) => !usedColors.has(c)) ||
                  EQUATION_COLORS[
                    equationsArray.length % EQUATION_COLORS.length
                  ];

                const newEqs = [
                  ...equationsArray,
                  { id: Math.random().toString(), expr: "", color: nextColor },
                ];
                setEquationsArray(newEqs);
                onUpdate({ equations: newEqs });
              }}
              className="mt-2 text-[10px] font-bold text-indigo-500 bg-indigo-50/50 hover:bg-indigo-100 py-1.5 px-2 rounded flex items-center justify-center w-full transition-colors"
            >
              <Plus size={12} className="mr-1" /> Add Equation
            </button>

            <span className="text-[9px] text-slate-400 leading-tight pt-1">
              Try:{" "}
              <code className="bg-slate-100 px-0.5 rounded font-mono">
                2x - 1
              </code>
              ,{" "}
              <code className="bg-slate-100 px-0.5 rounded font-mono">
                x^2 - 3
              </code>
              ,{" "}
              <code className="bg-slate-100 px-0.5 rounded font-mono">
                sin(x)
              </code>
            </span>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              Quick Presets
            </label>
            <div className="flex space-x-1">
              <button
                onClick={() => {
                  setEquationInput("x^2");
                  onUpdate({ equation: "x^2" });
                }}
                className="flex-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 text-[10px] py-1 rounded font-medium transition-colors"
              >
                Parabola
              </button>
              <button
                onClick={() => {
                  setEquationInput("sin(x)");
                  onUpdate({ equation: "sin(x)" });
                }}
                className="flex-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 text-[10px] py-1 rounded font-medium transition-colors"
              >
                Sine Wave
              </button>
              <button
                onClick={() => {
                  const pts = "(-3,3), (0,0), (3,3)";
                  onUpdate({ plottedPoints: pts });
                }}
                className="flex-1 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 text-[10px] py-1 rounded font-medium transition-colors"
              >
                Points V
              </button>
            </div>
          </div>

          {/* Interactive Graphing Tools */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              Interactive Tools
            </label>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() =>
                  setGraphInteractionMode(
                    graphInteractionMode === "move" ? "none" : "move",
                  )
                }
                className={`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border ${
                  graphInteractionMode === "move"
                    ? "bg-blue-100 text-blue-700 border-blue-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Move
              </button>
              <button
                onClick={() =>
                  setGraphInteractionMode(
                    graphInteractionMode === "point" ? "none" : "point",
                  )
                }
                className={`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border ${
                  graphInteractionMode === "point"
                    ? "bg-indigo-100 text-indigo-700 border-indigo-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Plot Point
              </button>
              <button
                onClick={() => {
                  setGraphInteractionMode(
                    graphInteractionMode === "line" ? "none" : "line",
                  );
                  setLineStartPoint(null);
                }}
                className={`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border ${
                  graphInteractionMode === "line"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {graphInteractionMode === "line" && lineStartPoint
                  ? "Click end point..."
                  : "Plot Line"}
              </button>
            </div>
          </div>
          {/* Plotted Points Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              Plot Points (x,y)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={pointsInput}
                onChange={(e) => {
                  setPointsInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const regex = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/g;
                    let match;
                    const newPts = [];
                    while ((match = regex.exec(pointsInput)) !== null) {
                      const px = parseFloat(match[1]);
                      const py = parseFloat(match[2]);
                      if (!isNaN(px) && !isNaN(py)) {
                        newPts.push({ x: px, y: py });
                      }
                    }
                    if (newPts.length > 0) {
                      const updatedPtsList = [...tempPointsList, ...newPts];
                      setTempPointsList(updatedPtsList);
                      const ptsStr = updatedPtsList.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(", ");
                      onUpdate({ plottedPoints: ptsStr });
                      setPointsInput("");
                    }
                  }
                }}
                placeholder="(-2,1), (0,-3)"
                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-700"
              />
              <button 
                onClick={() => {
                    const regex = /\((-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\)/g;
                    let match;
                    const newPts = [];
                    while ((match = regex.exec(pointsInput)) !== null) {
                      const px = parseFloat(match[1]);
                      const py = parseFloat(match[2]);
                      if (!isNaN(px) && !isNaN(py)) {
                        newPts.push({ x: px, y: py });
                      }
                    }
                    if (newPts.length > 0) {
                      const updatedPtsList = [...tempPointsList, ...newPts];
                      setTempPointsList(updatedPtsList);
                      const ptsStr = updatedPtsList.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(", ");
                      onUpdate({ plottedPoints: ptsStr });
                      setPointsInput("");
                    }
                }}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
              >
                Plot
              </button>
            </div>
            <span className="text-[9px] text-slate-400 leading-tight">
              Format:{" "}
              <code className="bg-slate-100 px-0.5 rounded font-mono">
                (x1,y1), (x2,y2)
              </code>
            </span>
          </div>

          <div className="flex space-x-3">
            {/* Zoom / Axis Scale Range */}
            <div className="flex flex-col space-y-1 flex-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Axis Range
                </label>
                <span className="text-xs font-bold text-indigo-600 font-mono">
                  ±{rangeInput}
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                value={rangeInput}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setRangeInput(val);
                  onUpdate({ cartesianRange: val });
                }}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                <span>±2</span>
                <span>±20</span>
              </div>
            </div>

            {/* Axis Font Size */}
            <div className="flex flex-col space-y-1 flex-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  Number Size
                </label>
                <span className="text-xs font-bold text-indigo-600 font-mono">
                  {axisFontSize}px
                </span>
              </div>
              <input
                type="range"
                min="6"
                max="20"
                step="1"
                value={axisFontSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setAxisFontSize(val);
                  onUpdate({ axisFontSize: val });
                }}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                <span>6px</span>
                <span>20px</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
