import React from "react";
import { StampElement, UserProfile } from "../types";
import { CheckCircle2, Star, Award, AlertCircle, CheckSquare, FileCheck, Trash2 } from "lucide-react";

interface StampComponentProps {
  element: StampElement;
  isSelected: boolean;
  isInteractive: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onUpdate: (updates: Partial<StampElement>) => void;
  onDelete: () => void;
  currentUser?: UserProfile;
  canWrite?: boolean;
}

export default function StampComponent({
  element,
  isSelected,
  isInteractive,
  onSelect,
  onUpdate,
  onDelete,
  canWrite = true,
}: StampComponentProps) {
  const shape = element.stampShape || "rounded-rect";
  
  let clipPath = "";
  let shapeClass = "";

  if (shape === "circle") {
    shapeClass = "rounded-full overflow-hidden";
  } else if (shape === "star") {
    clipPath = "polygon(50% 0%, 63% 13%, 80% 6%, 82% 24%, 100% 25%, 94% 43%, 100% 60%, 82% 64%, 80% 82%, 63% 79%, 50% 100%, 37% 79%, 20% 82%, 18% 64%, 0% 60%, 6% 43%, 0% 25%, 18% 24%, 20% 6%, 37% 13%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "badge") {
    clipPath = "polygon(0% 0%, 100% 0%, 100% 75%, 50% 100%, 0% 75%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "diamond") {
    clipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "banner") {
    clipPath = "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "hexagon") {
    clipPath = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "ribbon") {
    clipPath = "polygon(0% 0%, 100% 0%, 88% 50%, 100% 100%, 0% 100%, 12% 50%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "heart") {
    clipPath = "polygon(50% 85%, 15% 55%, 0% 30%, 15% 5%, 40% 5%, 50% 25%, 60% 5%, 85% 5%, 100% 30%, 85% 55%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "shield") {
    clipPath = "polygon(0% 0%, 100% 0%, 100% 65%, 50% 100%, 0% 65%)";
    shapeClass = "overflow-hidden";
  } else if (shape === "crest") {
    clipPath = "polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 50% 100%, 0% 80%, 0% 20%)";
    shapeClass = "overflow-hidden";
  } else {
    shapeClass = "rounded-2xl overflow-hidden";
  }

  const renderStampBadge = () => {
    switch (element.stampType) {
      case "checked":
        return (
          <div className="bg-emerald-500 text-white w-full h-full rounded-2xl shadow-md border-2 border-emerald-400 flex items-center justify-center space-x-2 font-black text-sm uppercase tracking-wide select-none">
            <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0" />
            <span className="truncate">Checked ✔</span>
          </div>
        );
      case "star":
        return (
          <div className="bg-amber-400 text-amber-950 w-full h-full rounded-2xl shadow-md border-2 border-amber-300 flex items-center justify-center space-x-2 font-black text-sm uppercase tracking-wide select-none">
            <Star className="w-5 h-5 fill-amber-950 flex-shrink-0" />
            <span className="truncate">Gold Star ★</span>
          </div>
        );
      case "great_job":
        return (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white w-full h-full rounded-2xl shadow-lg border-2 border-blue-400 flex items-center justify-center space-x-2 font-black text-sm uppercase tracking-wider select-none">
            <Award className="w-5 h-5 text-yellow-300 flex-shrink-0" />
            <span className="truncate">Great Job!</span>
          </div>
        );
      case "needs_revision":
        return (
          <div className="bg-rose-500 text-white w-full h-full rounded-2xl shadow-md border-2 border-rose-400 flex items-center justify-center space-x-2 font-black text-sm uppercase tracking-wide select-none">
            <AlertCircle className="w-5 h-5 text-white flex-shrink-0" />
            <span className="truncate">Needs Revision</span>
          </div>
        );
      case "grade_a":
        return (
          <div className="bg-emerald-600 text-white w-full h-full rounded-2xl shadow-md border-2 border-emerald-400 flex items-center justify-center space-x-2 font-extrabold text-base tracking-widest select-none">
            <span className="text-xl font-black text-yellow-300 flex-shrink-0">A+</span>
            <span className="text-xs uppercase font-bold text-emerald-100 truncate">Grade</span>
          </div>
        );
      case "approved":
        return (
          <div className="bg-teal-600 text-white w-full h-full rounded-2xl shadow-md border-2 border-teal-400 flex items-center justify-center space-x-2 font-black text-sm uppercase tracking-widest select-none">
            <FileCheck className="w-5 h-5 text-teal-100 flex-shrink-0" />
            <span className="truncate">Approved</span>
          </div>
        );
      case "signature":
        return (
          <div className="bg-white/95 border-2 border-indigo-200 p-1.5 rounded-xl shadow-md flex flex-col items-center justify-center w-full h-full select-none">
            {element.signatureDataUrl ? (
              <img src={element.signatureDataUrl} alt="Signature" className="h-full max-h-[32px] object-contain select-none flex-shrink-0" />
            ) : (
              <span className="font-serif italic text-indigo-900 font-bold text-sm truncate max-w-full">
                {element.label || "Verified Signature"}
              </span>
            )}
            <span className="text-[8px] font-mono text-indigo-400 uppercase tracking-wider mt-0.5 border-t border-indigo-100 pt-0.5 w-full text-center truncate">
              Teacher Signature
            </span>
          </div>
        );
      default:
        const bgColor = element.color || '#4f46e5';
        let textColor = 'text-white';
        if (bgColor.startsWith('#')) {
          const hex = bgColor.substring(1);
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness > 160) {
              textColor = 'text-slate-900';
            }
          }
        }
        return (
          <div 
            style={{ backgroundColor: bgColor }}
            className={`w-full h-full rounded-2xl shadow-md border-2 border-slate-300/40 flex flex-col items-center justify-center p-2 font-black text-sm uppercase tracking-wide select-none ${textColor}`}
          >
            <span className="truncate max-w-full text-center">
              {element.label || "Stamp"}
            </span>
          </div>
        );
    }
  };

  return (
    <div
      onPointerDown={onSelect}
      style={{
        transform: `translate(${element.x}px, ${element.y}px)`,
        width: element.width || 140,
        height: element.height || 60,
        zIndex: element.zIndex || 10,
      }}
      className="absolute left-0 top-0 cursor-pointer select-none group touch-none"
    >
      <div className="relative w-full h-full">
        {/* High-contrast shape-matched outline when selected */}
        {isSelected && (
          <div 
            style={{ 
              clipPath: clipPath ? clipPath : undefined,
              transform: "scale(1.05)",
            }}
            className={`absolute inset-0 bg-indigo-500/80 -z-10 ${shapeClass}`}
          />
        )}

        <div
          style={{
            clipPath: clipPath ? clipPath : undefined,
          }}
          className={`w-full h-full ${shapeClass}`}
        >
          {renderStampBadge()}
        </div>

        {isSelected && isInteractive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors z-40"
            title="Delete Stamp"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        {/* Resize corner handle */}
        {isSelected && canWrite && !element.locked && (
          <div
            className="absolute -bottom-2 -right-2 w-8 h-8 cursor-se-resize flex items-center justify-center pointer-events-auto z-40"
            onPointerDown={(e) => {
              e.stopPropagation();
              const canvasEvent = new CustomEvent('init-resize', {
                detail: { elementId: element.id, originalEvent: { clientX: e.clientX, clientY: e.clientY } }
              });
              window.dispatchEvent(canvasEvent);
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 border border-white shadow-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
