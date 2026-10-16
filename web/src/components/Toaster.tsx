import { useToast } from '../store/toast';

export default function Toaster() {
  const toasts = useToast((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
