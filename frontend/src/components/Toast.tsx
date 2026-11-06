import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { registerAuthToastHandler } from "../api";

export interface ToastMessage {
  id: string;
  type: "success" | "warning" | "error" | "info";
  title?: string;
  message: string;
}

interface ToastContextType {
  addToast: (message: string, type?: "success" | "warning" | "error" | "info", title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, type: "success" | "warning" | "error" | "info" = "info", title?: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  useEffect(() => {
    // Register global auth toast handler from api.ts
    registerAuthToastHandler((msg) => {
      addToast(msg, "warning", "HTTP 401 Unauthorized");
    });
  }, [addToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 p-3.5 bg-[#1F2428] text-[#F3F4F6] rounded-md shadow-lg border border-[#374151] text-xs font-sans transition-all animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && (
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              )}
              {toast.type === "warning" && (
                <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
              )}
              {toast.type === "error" && (
                <AlertTriangle className="w-4 h-4 text-[#EF4444]" />
              )}
              {toast.type === "info" && (
                <Info className="w-4 h-4 text-[#60A5FA]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="font-semibold text-white tracking-tight mb-0.5">{toast.title}</p>
              )}
              <p className="text-gray-300 leading-relaxed break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-gray-400 hover:text-white p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
};
