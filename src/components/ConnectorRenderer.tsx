import React from 'react';
import { ConnectorElement, BoardElement } from '../types';
import { Trash2 } from 'lucide-react';

interface ConnectorRendererProps {
  connector: ConnectorElement;
  elements: BoardElement[];
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

export default function ConnectorRenderer({
  connector,
  elements,
  isSelected,
  onSelect,
  onDelete
}: ConnectorRendererProps): React.JSX.Element {
  // Find source element center coordinates
  const getElementCoordinates = (elementId: string | undefined, fallbackX: number, fallbackY: number) => {
    if (!elementId) return { x: fallbackX, y: fallbackY };
    const el = elements.find((e) => e.id === elementId);
    if (!el || el.type === 'drawing' || el.type === 'connector') {
      return { x: fallbackX, y: fallbackY };
    }
    // Return center of the bounding box
    return {
      x: el.x + el.width / 2,
      y: el.y + el.height / 2
    };
  };

  const start = getElementCoordinates(connector.fromId, connector.fromX || 0, connector.fromY || 0);
  const end = getElementCoordinates(connector.toId, connector.toX || 0, connector.toY || 0);

  // Calculate organic cubic Bezier path coordinates
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  // Organic curve control points (horizontal flow preference)
  const controlX1 = start.x + dx * 0.5;
  const controlY1 = start.y;
  const controlX2 = start.x + dx * 0.5;
  const controlY2 = end.y;

  const pathD = `M ${start.x} ${start.y} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${end.x} ${end.y}`;

  // Find middle point on Bezier curve for label positioning
  // Cubic Bezier interpolation formula at t = 0.5
  const midX = 0.125 * start.x + 0.375 * controlX1 + 0.375 * controlX2 + 0.125 * end.x;
  const midY = 0.125 * start.y + 0.375 * controlY1 + 0.375 * controlY2 + 0.125 * end.y;

  return (
    <g className="select-none" id={`connector-group-${connector.id}`}>
      {/* SVG Definitions for Arrow Markers */}
      <defs>
        <marker
          id={`arrow-${connector.id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill={connector.color || '#f97316'} />
        </marker>
      </defs>

      {/* Invisible thick path for easy mouse selection/clicking */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth="15"
        className="cursor-pointer pointer-events-auto"
        onMouseDown={onSelect}
      />

      {/* Visible connector path */}
      <path
        d={pathD}
        fill="none"
        stroke={connector.color || '#f97316'}
        strokeWidth={isSelected ? '4' : '2.5'}
        strokeDasharray={isSelected ? '5,5' : 'none'}
        markerEnd={`url(#arrow-${connector.id})`}
        className="transition-all pointer-events-auto"
        onMouseDown={onSelect}
      />

      {/* Selected Highlighter Glow */}
      {isSelected && (
        <path
          d={pathD}
          fill="none"
          stroke="#f97316"
          strokeWidth="8"
          strokeOpacity="0.2"
          className="pointer-events-none"
        />
      )}

      {/* Connector Label (Optional, default label matches student connection workflows) */}
      <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
        <rect
          x="-35"
          y="-10"
          width="70"
          height="20"
          rx="4"
          fill="white"
          stroke={isSelected ? '#f97316' : '#cbd5e1'}
          strokeWidth="1"
          className="shadow-xs"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[9px] font-bold fill-slate-600 font-sans"
        >
          {connector.text || 'connect'}
        </text>
      </g>

      {/* Floating delete button when selected */}
      {isSelected && (
        <foreignObject
          x={midX - 16}
          y={midY + 15}
          width="32"
          height="32"
          className="overflow-visible pointer-events-auto"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-7 h-7 bg-white hover:bg-rose-50 text-rose-600 rounded-full shadow-md border border-slate-200 flex items-center justify-center transition-transform hover:scale-110"
            title="Delete connector"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </foreignObject>
      )}
    </g>
  );
}
