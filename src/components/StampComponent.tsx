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
}

export default function StampComponent({
  element,
  isSelected,
  isInteractive,
  onSelect,
  onUpdate,
  onDelete,
}: StampComponentProps) {
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
        return (
          <div className="bg-indigo-600 text-white w-full h-full rounded-2xl shadow-md font-bold text-xs flex items-center justify-center select-none truncate">
            {element.label || "Stamp"}
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
      className={`absolute left-0 top-0 cursor-pointer select-none group touch-none ${
        isSelected ? "ring-2 ring-indigo-500 ring-offset-2 rounded-2xl" : ""
      }`}
    >
      <div className="relative w-full h-full">
        {renderStampBadge()}

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
      </div>
    </div>
  );
}
