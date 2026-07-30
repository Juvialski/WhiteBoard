import React from "react";
import { Brain, X, Key, Eye, EyeOff, PenTool, Wand2, Loader2, Sparkles, Plus } from "lucide-react";
import Markdown from "react-markdown";
import { UserProfile } from "../../types";
import { secureEncrypt } from "../../utils/crypto";

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userApiKey: string;
  setUserApiKey: (key: string) => void;
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  currentUser: UserProfile;
  autoCorrectHandwriting: boolean;
  setAutoCorrectHandwriting: (val: boolean) => void;
  handleBeautifySelection: () => void;
  isAiLoading: boolean;
  selectedIds: string[];
  aiProblemInput: string;
  setAiProblemInput: (val: string) => void;
  handleSolveProblem: (promptPrefix?: string) => void;
  aiResponseText: string;
  aiResponseTitle: string;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  userApiKey,
  setUserApiKey,
  selectedModel = "gemini-2.5-flash",
  setSelectedModel,
  showApiKey,
  setShowApiKey,
  currentUser,
  autoCorrectHandwriting,
  setAutoCorrectHandwriting,
  handleBeautifySelection,
  isAiLoading,
  selectedIds,
  aiProblemInput,
  setAiProblemInput,
  handleSolveProblem,
  aiResponseText,
  aiResponseTitle,
}) => {
  if (!isOpen) return null;

  return (
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
          onClick={onClose}
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

          {/* Model Selection Dropdown */}
          <div className="mt-2.5 pt-2 border-t border-purple-100/60 space-y-1">
            <label className="block text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center justify-between">
              <span>Select Gemini Model</span>
              <span className="text-[9px] font-mono font-medium text-purple-600 bg-purple-100/60 px-1.5 py-0.5 rounded">
                {selectedModel}
              </span>
            </label>
            <select
              value={selectedModel}
              onChange={(e) => {
                const val = e.target.value;
                if (setSelectedModel) setSelectedModel(val);
                localStorage.setItem("user_gemini_model", val);
              }}
              className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 cursor-pointer shadow-xs"
              id="ai-model-selector"
            >
              <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
              <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
              <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
              <option value="gemini-3.0-flash">Gemini 3 Flash</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-2.0-flash">Gemini 2 Flash</option>
              <option value="gemini-2.0-flash-lite">Gemini 2 Flash Lite</option>
              <option value="gemini-flash-latest">Gemini Flash Latest</option>
            </select>
            <p className="text-[9.5px] text-slate-500 leading-tight">
              Select your preferred model quota from your Google AI Studio key.
            </p>
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
  );
};
