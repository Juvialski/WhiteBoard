import React, { useState, useRef, useEffect } from "react";
import { StampElement } from "../types";
import { 
  Stamp, 
  CheckCircle2, 
  Star, 
  Award, 
  AlertCircle, 
  FileCheck, 
  X, 
  Trash2, 
  Check, 
  Sparkles, 
  Palette, 
  Smile, 
  HelpCircle,
  Square,
  Circle,
  Shield,
  Gem,
  Bookmark
} from "lucide-react";

interface StampPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStamp: (
    stampType: StampElement["stampType"],
    label?: string,
    signatureUrl?: string,
    color?: string,
    stampShape?: StampElement["stampShape"]
  ) => void;
  userApiKey?: string;
}

const PASTEL_COLORS = [
  { hex: "#fef08a", name: "Yellow" },
  { hex: "#fbcfe8", name: "Pink" },
  { hex: "#bfdbfe", name: "Blue" },
  { hex: "#bbf7d0", name: "Green" },
  { hex: "#fed7aa", name: "Orange" },
  { hex: "#e9d5ff", name: "Purple" },
  { hex: "#99f6e4", name: "Teal" },
  { hex: "#fecaca", name: "Red" },
];

const PRESET_EMOJIS = ["👍", "❤️", "🔥", "💡", "🌟", "🚀", "🦖", "🍎", "📚", "🎨", "🧪", "🏆", "✅", "❌", "🧠", "🎯", "✍️", "✨", "💯", "🎈"];

export default function StampPickerModal({
  isOpen,
  onClose,
  onSelectStamp,
  userApiKey,
}: StampPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"stamps" | "custom" | "signature">("stamps");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  // Customizer State
  const [customEmoji, setCustomEmoji] = useState("👍");
  const [customText, setCustomText] = useState("Reviewed");
  const [selectedColor, setSelectedColor] = useState("#bbf7d0"); // Default pastel green
  const [selectedShape, setSelectedShape] = useState<StampElement["stampShape"]>("rounded-rect");

  const isSquare = selectedShape && selectedShape !== "rounded-rect";
  const previewSizeClass = isSquare ? "w-24 h-24" : "w-48 h-16";

  let previewClipPath = "";
  let previewShapeClass = "rounded-2xl";
  if (selectedShape === "circle") {
    previewShapeClass = "rounded-full";
  } else if (selectedShape === "star") {
    previewClipPath = "polygon(50% 0%, 63% 13%, 80% 6%, 82% 24%, 100% 25%, 94% 43%, 100% 60%, 82% 64%, 80% 82%, 63% 79%, 50% 100%, 37% 79%, 20% 82%, 18% 64%, 0% 60%, 6% 43%, 0% 25%, 18% 24%, 20% 6%, 37% 13%)";
    previewShapeClass = "";
  } else if (selectedShape === "badge") {
    previewClipPath = "polygon(0% 0%, 100% 0%, 100% 75%, 50% 100%, 0% 75%)";
    previewShapeClass = "";
  } else if (selectedShape === "diamond") {
    previewClipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    previewShapeClass = "";
  } else if (selectedShape === "banner") {
    previewClipPath = "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)";
    previewShapeClass = "";
  }

  // AI Stamp Assistant State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (activeTab === "signature" && canvasRef.current) {
      clearSigCanvas();
    }
  }, [activeTab]);

  if (!isOpen) return null;

  const startDrawingSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.strokeStyle = "#1e1b4b"; // Dark indigo signature ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    setIsDrawingSig(true);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    ctx.stroke();
  };

  const startDrawingSigTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.strokeStyle = "#1e1b4b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY);
    setIsDrawingSig(true);
  };

  const drawSigTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineTo((touch.clientX - rect.left) * scaleX, (touch.clientY - rect.top) * scaleY);
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

  // Preset stamps configuration
  const STAMPS: { type: StampElement["stampType"]; label: string; icon: React.ReactNode; color: string; bgColor: string }[] = [
    { type: "checked", label: "Checked ✔", icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />, color: "border-emerald-200 hover:bg-emerald-50", bgColor: "#10b981" },
    { type: "star", label: "Gold Star ★", icon: <Star className="w-6 h-6 text-amber-500 fill-amber-400" />, color: "border-amber-200 hover:bg-amber-50", bgColor: "#fbbf24" },
    { type: "great_job", label: "Great Job!", icon: <Award className="w-6 h-6 text-blue-600" />, color: "border-blue-200 hover:bg-blue-50", bgColor: "#3b82f6" },
    { type: "grade_a", label: "Grade A+", icon: <span className="font-black text-xl text-emerald-600">A+</span>, color: "border-emerald-200 hover:bg-emerald-50", bgColor: "#059669" },
    { type: "needs_revision", label: "Needs Revision", icon: <AlertCircle className="w-6 h-6 text-rose-500" />, color: "border-rose-200 hover:bg-rose-50", bgColor: "#f43f5e" },
    { type: "approved", label: "Approved", icon: <FileCheck className="w-6 h-6 text-teal-600" />, color: "border-teal-200 hover:bg-teal-50", bgColor: "#0d9488" },
  ];

  // AI Stamp generator logic
  const handleAiGenerateStamp = async () => {
    if (!aiPrompt.trim()) return;
    if (!userApiKey || !userApiKey.trim()) {
      setAiError("API Key required. Please input your custom Google AI Studio API Key in the AI Assistant settings sidebar first.");
      return;
    }

    setIsAiLoading(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai/stamp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey,
        },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate stamp");
      }

      const data = await res.json();
      if (data.emoji) setCustomEmoji(data.emoji);
      if (data.text) setCustomText(data.text);
      if (data.color) setSelectedColor(data.color);

      // Clear prompt
      setAiPrompt("");
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "An error occurred while communicating with Gemini.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const placeCustomStamp = () => {
    // We compose the stamp label: emoji + space + text
    const compositeLabel = `${customEmoji} ${customText}`.trim();
    onSelectStamp("custom", compositeLabel, undefined, selectedColor, selectedShape);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-md p-6 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Stamp className="w-5 h-5" />
            <span className="font-extrabold text-sm text-slate-800">Educational Stamps & Signatures</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
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
            Presets
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              activeTab === "custom" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Custom Stamp
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
                  // Pass preset name and default background hex
                  onSelectStamp(s.type, s.label, undefined, s.bgColor);
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

        {/* Tab 2: Custom / AI Stamp Customizer */}
        {activeTab === "custom" && (
          <div className="flex flex-col space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
            
            {/* Live Stamp Preview */}
            <div className="flex flex-col items-center justify-center p-4 border border-slate-100 bg-slate-50/50 rounded-2xl space-y-2 min-h-[140px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stamp Live Preview</span>
              <div 
                style={{ 
                  backgroundColor: selectedColor,
                  clipPath: previewClipPath ? previewClipPath : undefined,
                }}
                className={`${previewSizeClass} ${previewShapeClass} border-2 border-slate-300/40 shadow-md flex flex-col items-center justify-center p-3 transition-colors duration-150`}
              >
                <div className="flex flex-col sm:flex-row items-center space-x-0.5 sm:space-x-1.5 max-w-full font-black text-slate-900 uppercase tracking-wider truncate text-center">
                  <span className="text-xl leading-none mb-1 sm:mb-0">{customEmoji}</span>
                  <span className="truncate max-w-[80px] sm:max-w-[120px] leading-tight text-xs sm:text-sm">{customText || "Stamp"}</span>
                </div>
              </div>
            </div>

            {/* Customizer Inputs */}
            <div className="flex flex-col space-y-3 bg-white p-3 border border-slate-200/60 rounded-2xl">
              {/* Emoji Picker Row */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <Smile className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Choose Emoji</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                  {PRESET_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setCustomEmoji(emoji)}
                      className={`w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center text-base transition-all transform active:scale-95 ${
                        customEmoji === emoji ? "bg-white ring-2 ring-indigo-500 shadow-xs scale-105" : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stamp Text Label */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold text-slate-600">Stamp Text</label>
                <input
                  type="text"
                  maxLength={20}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Reviewed, Good Effort..."
                />
              </div>

              {/* Stamp Shape Picker */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <Stamp className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Stamp Shape</span>
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    { id: "rounded-rect", label: "Badge", icon: <Square className="w-4 h-4" /> },
                    { id: "circle", label: "Circle", icon: <Circle className="w-4 h-4" /> },
                    { id: "star", label: "Star", icon: <Star className="w-4 h-4 animate-spin-slow" /> },
                    { id: "badge", label: "Shield", icon: <Shield className="w-4 h-4" /> },
                    { id: "diamond", label: "Diamond", icon: <Gem className="w-4 h-4" /> },
                    { id: "banner", label: "Plaque", icon: <Bookmark className="w-4 h-4" /> },
                  ].map((shapeOption) => (
                    <button
                      key={shapeOption.id}
                      onClick={() => setSelectedShape(shapeOption.id as any)}
                      type="button"
                      className={`py-2 px-1 border rounded-xl flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer transform active:scale-95 ${
                        selectedShape === shapeOption.id
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-extrabold shadow-xs"
                          : "border-slate-200 bg-slate-50/50 text-slate-500 hover:bg-slate-50"
                      }`}
                      title={shapeOption.label}
                    >
                      {shapeOption.icon}
                      <span className="text-[9px] truncate tracking-tighter leading-none">{shapeOption.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Palette */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <Palette className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Pastel Theme</span>
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {PASTEL_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => setSelectedColor(c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`h-7 w-full rounded-lg border transition-all cursor-pointer transform active:scale-90 relative flex items-center justify-center ${
                        selectedColor === c.hex
                          ? "ring-2 ring-indigo-600 ring-offset-1 border-white scale-105"
                          : "border-slate-200/50 hover:scale-105"
                      }`}
                      title={c.name}
                    >
                      {selectedColor === c.hex && (
                        <Check className="w-3.5 h-3.5 text-slate-800 stroke-[3px]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Assistant Generator Card */}
            <div className="border border-indigo-100 bg-indigo-50/40 rounded-2xl p-3.5 flex flex-col space-y-2.5">
              <div className="flex items-center space-x-1.5 text-indigo-700 font-extrabold text-xs">
                <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                <span>AI Stamp Design Assistant</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Describe any concept (e.g. "rocket for science", "dino for high effort") and let Gemini suggest a custom emoji, slogan, and theme color.
              </p>
              
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={isAiLoading}
                  placeholder="Ask Gemini to design a stamp..."
                  className="flex-1 px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiPrompt.trim()) {
                      handleAiGenerateStamp();
                    }
                  }}
                />
                <button
                  onClick={handleAiGenerateStamp}
                  disabled={isAiLoading || !aiPrompt.trim()}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1"
                >
                  {isAiLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Design</span>
                </button>
              </div>

              {aiError && (
                <div className="p-2 border border-rose-200 bg-rose-50 rounded-xl text-[10px] font-bold text-rose-600 leading-normal flex items-start space-x-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-500 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>

            <button
              onClick={placeCustomStamp}
              disabled={!customText.trim()}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer mt-1"
            >
              <Check className="w-4 h-4" />
              <span>Place Custom Stamp</span>
            </button>
          </div>
        )}

        {/* Tab 3: Custom Signature Pad */}
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
                onTouchStart={startDrawingSigTouch}
                onTouchMove={drawSigTouch}
                onTouchEnd={stopDrawingSig}
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
