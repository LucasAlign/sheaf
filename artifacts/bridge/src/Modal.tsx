import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
export const FeedbackContext = createContext({ error: "", toast: "" });
export default function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    feedback = useContext(FeedbackContext);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => focus?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {feedback.error && (
          <p className="error" role="alert">
            {feedback.error}
          </p>
        )}
        {feedback.toast && (
          <p className="privacy-note" role="status">
            {feedback.toast}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
