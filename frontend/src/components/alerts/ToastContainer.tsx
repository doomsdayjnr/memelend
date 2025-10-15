// components/ToastContainer.tsx
import { useState, createContext, useContext, type ReactNode } from "react";
import Toast, { type ToastType } from "./Toast";
import { v4 as uuidv4 } from "uuid";
import "../../styles/alert/Alert.css";

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<
    { id: string; message: string; type?: ToastType; duration?: number }[]
  >([]);

  const showToast = (message: string, type: ToastType = "success", duration = 3000) => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast stack container */}
      <div className="alert-container">
        <div className="alert-wrapper">
           {toasts.map((t) => (
          <Toast
            key={t.id}
            id={t.id}
            message={t.message}
            type={t.type}
            duration={t.duration}
            onClose={removeToast}
          />
        ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};
