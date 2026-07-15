import React, { useState, useRef, useEffect } from 'react';
import { ShapeElement, UserProfile, ShapeType } from '../types';
import { Smile, Trash2, TrendingUp } from 'lucide-react';

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
    const sanitizedFormula = formula.replace(/[^0-9+\-*/().\s*Math\.sincostanbsqrPIe]/g, "");

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

const EMOJIS = ['👍', '❤️', '🔥', '💡', '❓', '🎉'];

export default function ShapeComponent({
  element,
  isSelected,
  currentUser,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
  isDraggingOrResizing,
  activeTool = 'select',
  canWrite = true
}: ShapeComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(element.text);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cartesian Advanced States
  const [showMathPanel, setShowMathPanel] = useState(false);
  const [equationInput, setEquationInput] = useState(element.equation || '');
  const [equationInput2, setEquationInput2] = useState(element.equation2 || '');
  const [equationInput3, setEquationInput3] = useState(element.equation3 || '');
  const [pointsInput, setPointsInput] = useState(element.plottedPoints || '');
  const [rangeInput, setRangeInput] = useState(element.cartesianRange || 5);
  const [hoveredCoord, setHoveredCoord] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setEquationInput(element.equation || '');
    setEquationInput2(element.equation2 || '');
    setEquationInput3(element.equation3 || '');
    setPointsInput(element.plottedPoints || '');
    setRangeInput(element.cartesianRange || 5);
  }, [element.equation, element.equation2, element.equation3, element.plottedPoints, element.cartesianRange]);

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
      case 'advanced-cartesian': {
        const cx = w / 2;
        const cy = h / 2;
        const range = element.cartesianRange || 5;
        const scaleX = (w - 40) / (range * 2);
        const scaleY = (h - 40) / (range * 2);
        
        const gridLines: React.ReactNode[] = [];
        const xTicks: React.ReactNode[] = [];
        const yTicks: React.ReactNode[] = [];

        // Draw grid lines and ticks
        for (let i = -range; i <= range; i++) {
          const xPos = cx + i * scaleX;
          const yPos = cy - i * scaleY;

          // Vertical grid line (except axes center)
          if (i !== 0 && xPos > 10 && xPos < w - 10) {
            gridLines.push(
              <line key={`adv-grid-v-${i}`} x1={xPos} y1={15} x2={xPos} y2={h - 15} stroke="rgba(148, 163, 184, 0.15)" strokeWidth={0.8} />
            );
            xTicks.push(
              <g key={`adv-xtick-${i}`}>
                <line x1={xPos} y1={cy - 4} x2={xPos} y2={cy + 4} stroke={stroke} strokeWidth={1.5} />
                <text x={xPos} y={cy + 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{i}</text>
              </g>
            );
          }

          // Horizontal grid line (except axes center)
          if (i !== 0 && yPos > 10 && yPos < h - 10) {
            gridLines.push(
              <line key={`adv-grid-h-${i}`} x1={15} y1={yPos} x2={w - 15} y2={yPos} stroke="rgba(148, 163, 184, 0.15)" strokeWidth={0.8} />
            );
            yTicks.push(
              <g key={`adv-ytick-${i}`}>
                <line x1={cx - 4} y1={yPos} x2={cx + 4} y2={yPos} stroke={stroke} strokeWidth={1.5} />
                <text x={cx - 10} y={yPos + 3} textAnchor="end" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{i}</text>
              </g>
            );
          }
        }

        // Multiple equations
        const equations = [
          { expr: element.equation || '', color: '#6366f1', label: 'y1' },
          { expr: element.equation2 || '', color: '#10b981', label: 'y2' },
          { expr: element.equation3 || '', color: '#f43f5e', label: 'y3' }
        ];

        const equationPaths: React.ReactNode[] = [];
        const criticalPoints: { x: number; y: number; color: string; label: string }[] = [];

        equations.forEach(({ expr, color, label }, index) => {
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
            if (yAt0 !== null && !isNaN(yAt0) && isFinite(yAt0) && Math.abs(yAt0) <= range) {
              criticalPoints.push({ x: 0, y: yAt0, color, label: `${label} y-int` });
            }
          }

          if (equationPath) {
            equationPaths.push(
              <path
                key={`adv-eq-${index}`}
                d={equationPath}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm transition-all"
              />
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
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} style={{ backgroundColor: fill || 'rgba(255,255,255,0.95)', borderRadius: '12px', border: `1.5px solid ${stroke}40` }}>
            <defs>
              <marker id={`arrow-${element.id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>
            
            {/* Grid lines */}
            {gridLines}

            {/* X Axis */}
            <line x1={15} y1={cy} x2={w - 15} y2={cy} stroke={stroke} strokeWidth={2} markerStart={`url(#arrow-${element.id})`} markerEnd={`url(#arrow-${element.id})`} />
            {/* Y Axis */}
            <line x1={cx} y1={15} x2={cx} y2={h - 15} stroke={stroke} strokeWidth={2} markerStart={`url(#arrow-${element.id})`} markerEnd={`url(#arrow-${element.id})`} />

            {/* Origin Label */}
            <text x={cx - 8} y={cy + 11} fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">0</text>
            
            {/* Axis Name Labels */}
            <text x={w - 22} y={cy - 8} fontSize="11" fontWeight="bold" fill={stroke} className="select-none font-sans italic">x</text>
            <text x={cx + 8} y={25} fontSize="11" fontWeight="bold" fill={stroke} className="select-none font-sans italic">y</text>

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

            {/* Plotted Points */}
            {plottedPointsList.map((pt, idx) => {
              const xPos = cx + pt.x * scaleX;
              const yPos = cy - pt.y * scaleY;
              
              // Only draw if point lies within visual bounds
              if (xPos >= 10 && xPos <= w - 10 && yPos >= 10 && yPos <= h - 10) {
                return (
                  <g key={`adv-pt-${idx}`}>
                    <circle
                      cx={xPos}
                      cy={yPos}
                      r={5.5}
                      fill="#ec4899"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <text
                      x={xPos + 7}
                      y={yPos - 4}
                      fontSize="8"
                      fontWeight="bold"
                      fill="#be185d"
                      className="font-mono bg-white/80 select-none"
                    >
                      ({pt.x},{pt.y})
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
                  <rect width="80" height="20" rx="5" fill="rgba(15, 23, 42, 0.85)" />
                  <text x="40" y="13" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" className="font-mono">
                    ({hoveredCoord.x.toFixed(1)}, {hoveredCoord.y.toFixed(1)})
                  </text>
                </g>
              </g>
            )}
          </svg>
        );
      }
      case 'cartesian': {
        const cx = w / 2;
        const cy = h / 2;
        const gridStep = 30;
        const gridLines: React.ReactNode[] = [];
        
        // Vertical grid lines (left of center)
        for (let x = cx - gridStep; x > 0; x -= gridStep) {
          gridLines.push(
            <line key={`grid-v-left-${x}`} x1={x} y1={0} x2={x} y2={h} stroke="rgba(148, 163, 184, 0.2)" strokeWidth={0.8} />
          );
        }
        // Vertical grid lines (right of center)
        for (let x = cx + gridStep; x < w; x += gridStep) {
          gridLines.push(
            <line key={`grid-v-right-${x}`} x1={x} y1={0} x2={x} y2={h} stroke="rgba(148, 163, 184, 0.2)" strokeWidth={0.8} />
          );
        }
        // Horizontal grid lines (above center)
        for (let y = cy - gridStep; y > 0; y -= gridStep) {
          gridLines.push(
            <line key={`grid-h-above-${y}`} x1={0} y1={y} x2={w} y2={y} stroke="rgba(148, 163, 184, 0.2)" strokeWidth={0.8} />
          );
        }
        // Horizontal grid lines (below center)
        for (let y = cy + gridStep; y < h; y += gridStep) {
          gridLines.push(
            <line key={`grid-h-below-${y}`} x1={0} y1={y} x2={w} y2={y} stroke="rgba(148, 163, 184, 0.2)" strokeWidth={0.8} />
          );
        }

        // Draw ticks and tick numbers on X axis
        const xTicks: React.ReactNode[] = [];
        let tickNum = 1;
        for (let x = cx + gridStep; x < w - 15; x += gridStep) {
          xTicks.push(
            <g key={`xtick-pos-${x}`}>
              <line x1={x} y1={cy - 4} x2={x} y2={cy + 4} stroke={stroke} strokeWidth={1.5} />
              <text x={x} y={cy + 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{tickNum}</text>
            </g>
          );
          tickNum++;
        }
        tickNum = -1;
        for (let x = cx - gridStep; x > 15; x -= gridStep) {
          xTicks.push(
            <g key={`xtick-neg-${x}`}>
              <line x1={x} y1={cy - 4} x2={x} y2={cy + 4} stroke={stroke} strokeWidth={1.5} />
              <text x={x} y={cy + 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{tickNum}</text>
            </g>
          );
          tickNum--;
        }

        // Draw ticks and tick numbers on Y axis
        const yTicks: React.ReactNode[] = [];
        tickNum = 1;
        for (let y = cy - gridStep; y > 15; y -= gridStep) {
          yTicks.push(
            <g key={`ytick-pos-${y}`}>
              <line x1={cx - 4} y1={y} x2={cx + 4} y2={y} stroke={stroke} strokeWidth={1.5} />
              <text x={cx - 10} y={y + 3} textAnchor="end" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{tickNum}</text>
            </g>
          );
          tickNum++;
        }
        tickNum = -1;
        for (let y = cy + gridStep; y < h - 15; y += gridStep) {
          yTicks.push(
            <g key={`ytick-neg-${y}`}>
              <line x1={cx - 4} y1={y} x2={cx + 4} y2={y} stroke={stroke} strokeWidth={1.5} />
              <text x={cx - 10} y={y + 3} textAnchor="end" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{tickNum}</text>
            </g>
          );
          tickNum--;
        }

        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} style={{ backgroundColor: fill || 'rgba(255,255,255,0.92)', borderRadius: '12px', border: `1px solid ${stroke}25` }}>
            <defs>
              <marker id={`arrow-${element.id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>
            
            {/* Grid lines */}
            {gridLines}

            {/* X Axis */}
            <line x1={15} y1={cy} x2={w - 15} y2={cy} stroke={stroke} strokeWidth={2} markerStart={`url(#arrow-${element.id})`} markerEnd={`url(#arrow-${element.id})`} />
            {/* Y Axis */}
            <line x1={cx} y1={15} x2={cx} y2={h - 15} stroke={stroke} strokeWidth={2} markerStart={`url(#arrow-${element.id})`} markerEnd={`url(#arrow-${element.id})`} />

            {/* Origin Label */}
            <text x={cx - 8} y={cy + 11} fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">0</text>
            
            {/* Axis Name Labels */}
            <text x={w - 22} y={cy - 8} fontSize="11" fontWeight="bold" fill={stroke} className="select-none font-sans italic">x</text>
            <text x={cx + 8} y={25} fontSize="11" fontWeight="bold" fill={stroke} className="select-none font-sans italic">y</text>

            {/* Ticks & Numbers */}
            {xTicks}
            {yTicks}
          </svg>
        );
      }
      case 'numberline': {
        const cy = h / 2 - 5;
        const cx = w / 2;
        const step = 35;
        const tickLines: React.ReactNode[] = [];

        // Center tick
        tickLines.push(
          <g key="numtick-0">
            <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke={stroke} strokeWidth={2} />
            <text x={cx} y={cy + 18} textAnchor="middle" fontSize="10" fontWeight="extrabold" fill={stroke} opacity={0.9} className="select-none font-mono">0</text>
          </g>
        );

        // Positive ticks
        let val = 1;
        for (let x = cx + step; x < w - 20; x += step) {
          tickLines.push(
            <g key={`numtick-pos-${x}`}>
              <line x1={x} y1={cy - 5} x2={x} y2={cy + 5} stroke={stroke} strokeWidth={1.5} />
              <text x={x} y={cy + 16} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{val}</text>
            </g>
          );
          val++;
        }

        // Negative ticks
        val = -1;
        for (let x = cx - step; x > 20; x -= step) {
          tickLines.push(
            <g key={`numtick-neg-${x}`}>
              <line x1={x} y1={cy - 5} x2={x} y2={cy + 5} stroke={stroke} strokeWidth={1.5} />
              <text x={x} y={cy + 16} textAnchor="middle" fontSize="9" fontWeight="bold" fill={stroke} opacity={0.85} className="select-none font-mono">{val}</text>
            </g>
          );
          val--;
        }

        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} style={{ backgroundColor: fill || 'transparent' }}>
            <defs>
              <marker id={`arrow-${element.id}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 2 L 10 5 L 0 8 z" fill={stroke} />
              </marker>
            </defs>

            {/* The main horizontal line */}
            <line x1={20} y1={cy} x2={w - 20} y2={cy} stroke={stroke} strokeWidth={2.5} markerStart={`url(#arrow-${element.id})`} markerEnd={`url(#arrow-${element.id})`} />

            {/* Ticks & values */}
            {tickLines}
          </svg>
        );
      }
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

  const cursorClass = activeTool === 'select' 
    ? 'cursor-grab active:cursor-grabbing' 
    : activeTool === 'eraser' 
      ? 'cursor-pointer hover:brightness-95 hover:ring-2 hover:ring-rose-500 hover:ring-offset-1 transition-all' 
      : 'cursor-default';

  return (
    <div
      onMouseDown={onSelect}
      className={`absolute select-none flex flex-col justify-between transition-shadow duration-150 group ${cursorClass} ${
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
      {!(element.shapeType === 'cartesian' || element.shapeType === 'advanced-cartesian' || element.shapeType === 'numberline') && (
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
                if (!canWrite) return;
                setIsEditing(true);
              }}
              className={`w-full h-full text-center flex items-center justify-center font-bold text-sm overflow-auto select-text break-words cursor-text ${textColorClass}`}
            >
              {element.text || (canWrite ? <span className="opacity-20 italic text-xs">Double tap</span> : '')}
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
          {/* Quick Color Selector */}
          {canWrite && (
            <div className="relative border-r border-slate-100 pr-2 flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
                className="w-6 h-6 rounded-full border border-slate-300 relative transition-transform hover:scale-110 flex items-center justify-center cursor-pointer shadow-xs"
                style={{ backgroundColor: (element.shapeType === 'cartesian' || element.shapeType === 'advanced-cartesian' || element.shapeType === 'numberline' || element.shapeType === 'line') ? (element.borderColor || '#1e293b') : (element.color || '#ffffff') }}
                title="Change color"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-800/30" />
              </button>

              {showColorPicker && (
                <div className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 grid grid-cols-8 gap-1.5 z-40 animate-scale-up w-[212px]">
                  {[
                    '#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff', '#99f6e4', '#fecaca',
                    '#e11d48', '#f97316', '#059669', '#2563eb', '#7c3aed', '#64748b', '#ffffff', '#000000'
                  ].map((color) => {
                    const isSelected = (element.shapeType === 'cartesian' || element.shapeType === 'advanced-cartesian' || element.shapeType === 'numberline' || element.shapeType === 'line')
                      ? element.borderColor === color
                      : element.color === color;
                    const isDarkColor = ['#e11d48', '#f97316', '#059669', '#2563eb', '#7c3aed', '#64748b', '#000000'].includes(color);
                    return (
                      <button
                        key={color}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (element.shapeType === 'cartesian' || element.shapeType === 'advanced-cartesian' || element.shapeType === 'numberline' || element.shapeType === 'line') {
                            onUpdate({ borderColor: color });
                          } else {
                            onUpdate({ color });
                          }
                          setShowColorPicker(false);
                        }}
                        className={`w-5 h-5 rounded-full border relative transition-all hover:scale-120 cursor-pointer ${
                          isSelected ? 'ring-2 ring-blue-500 ring-offset-1 border-white scale-105' : 'border-slate-200'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      >
                        {isSelected && (
                          <div className={`absolute inset-0 m-auto w-1.5 h-1.5 rounded-full ${isDarkColor ? 'bg-white' : 'bg-slate-800'}`} />
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
      {isSelected && canWrite && (
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

      {/* Advanced Cartesian Settings Panel (Mini Desmos) */}
      {isSelected && canWrite && element.shapeType === 'advanced-cartesian' && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute left-full top-0 ml-4 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-4 w-[280px] z-30 pointer-events-auto animate-scale-up flex flex-col space-y-4 text-left select-text"
        >
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-xs text-slate-800">Advanced Plotter</h4>
              <p className="text-[10px] text-slate-400">Mini-Desmos Equation Plotter</p>
            </div>
          </div>

          {/* Equation Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              Equation f(x)
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">y =</span>
              <input
                type="text"
                value={equationInput}
                onChange={(e) => {
                  setEquationInput(e.target.value);
                  onUpdate({ equation: e.target.value });
                }}
                placeholder="x^2 - 3"
                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-700"
              />
            </div>
            <span className="text-[9px] text-slate-400 leading-tight">
              Try: <code className="bg-slate-100 px-0.5 rounded font-mono">2x - 1</code>, <code className="bg-slate-100 px-0.5 rounded font-mono">x^2 - 3</code>, <code className="bg-slate-100 px-0.5 rounded font-mono">sin(x)</code>, <code className="bg-slate-100 px-0.5 rounded font-mono">x = 2</code>
            </span>
          </div>

          {/* Plotted Points Input */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              Plot Points (x,y)
            </label>
            <input
              type="text"
              value={pointsInput}
              onChange={(e) => {
                setPointsInput(e.target.value);
                onUpdate({ plottedPoints: e.target.value });
              }}
              placeholder="(-2,1), (0,-3), (2,1)"
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-700"
            />
            <span className="text-[9px] text-slate-400 leading-tight">
              Format: <code className="bg-slate-100 px-0.5 rounded font-mono">(x1,y1), (x2,y2)</code>
            </span>
          </div>

          {/* Zoom / Axis Scale Range */}
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                Axis Range
              </label>
              <span className="text-xs font-bold text-indigo-600 font-mono">±{rangeInput}</span>
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
              <span>±10</span>
              <span>±20</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
