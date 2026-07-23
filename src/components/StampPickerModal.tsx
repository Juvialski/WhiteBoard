import React, { useState, useRef } from "react";
import { StampElement } from "../types";
import { Stamp, CheckCircle2, Star, Award, AlertCircle, FileCheck, PenTool, X, Trash2, Check } from "lucide-react";

interface StampPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStamp: (stampType: StampElement["stampType"], label?: string, signatureUrl?: string) => void;
}

export default function StampPickerModal({
  isOpen,
  onClose,
  onSelectStamp,
}: StampPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"stamps" | "signature">("stamps");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  if (!isOpen) return null;

  const startDrawingSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = "#1e1b4b"; // Dark indigo signature ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawingSig(true);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    setIsDrawingSig(false);
  };

  const clearSigCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSelectStamp("signature", "Teacher Signature", dataUrl);
    onClose();
  };

  const STAMPS: { type: StampElement["stampType"]; label: string; icon: React.ReactNode; color: string }[] = [
    { type: "checked", label: "Checked ✔", icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />, color: "border-emerald-200 hover:bg-emerald-50" },
    { type: "star", label: "Gold Star ★", icon: <Star className="w-6 h-6 text-amber-500 fill-amber-400" />, color: "border-amber-200 hover:bg-amber-50" },
    { type: "great_job", label: "Great Job!", icon: <Award className="w-6 h-6 text-blue-600" />, color: "border-blue-200 hover:bg-blue-50" },
    { type: "grade_a", label: "Grade A+", icon: <span className="font-black text-xl text-emerald-600">A+</span>, color: "border-emerald-200 hover:bg-emerald-50" },
    { type: "needs_revision", label: "Needs Revision", icon: <AlertCircle className="w-6 h-6 text-rose-500" />, color: "border-rose-200 hover:bg-rose-50" },
    { type: "approved", label: "Approved", icon: <FileCheck className="w-6 h-6 text-teal-600" />, color: "border-teal-200 hover:bg-teal-50" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-md p-6 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Stamp className="w-5 h-5" />
            <span className="font-extrabold text-sm text-slate-800">Educational Stamps & Signatures</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab("stamps")}
            className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === "stamps" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Teacher Stamps
          </button>
          <button
            onClick={() => setActiveTab("signature")}
            className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === "signature" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Draw Signature
          </button>
        </div>

        {/* Tab 1: Preset Stamps */}
        {activeTab === "stamps" && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            {STAMPS.map((s) => (
              <button
                key={s.type}
                onClick={() => {
                  onSelectStamp(s.type, s.label);
                  onClose();
                }}
                className={`p-3.5 border rounded-2xl flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer transform hover:scale-102 ${s.color}`}
              >
                {s.icon}
                <span className="font-extrabold text-xs text-slate-800">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tab 2: Custom Signature Pad */}
        {activeTab === "signature" && (
          <div className="flex flex-col space-y-3 pt-1">
            <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-1 relative">
              <canvas
                ref={canvasRef}
                width={360}
                height={140}
                onMouseDown={startDrawingSig}
                onMouseMove={drawSig}
                onMouseUp={stopDrawingSig}
                onMouseLeave={stopDrawingSig}
                className="w-full h-36 bg-white rounded-xl cursor-crosshair touch-none"
              />
              <span className="absolute bottom-2 left-3 text-[10px] text-slate-400 font-mono select-none">
                Sign above with cursor or touch
              </span>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={clearSigCanvas}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 font-bold transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
              <button
                onClick={saveSignature}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Place Signature</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
