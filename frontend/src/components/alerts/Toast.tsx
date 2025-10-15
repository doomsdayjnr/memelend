import { useEffect } from "react";

export type ToastType = "success" | "error";

interface ToastProps {
  id: string; // unique id for this toast
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: (id: string) => void; // callback to remove this toast
}

const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = "success",
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [duration, id, onClose]);


  return (
    <div
      className={`my-alert ${type === "success" ? "alert-success" : "alert-error"}`}
    >
      {message}
    </div>
  );
};

export default Toast;
