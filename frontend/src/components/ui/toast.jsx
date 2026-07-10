import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const dismiss = React.useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = React.useCallback((opts) => {
    const id = Math.random().toString(36).slice(2);
    const item = {
      id,
      title: opts.title,
      description: opts.description,
      variant: opts.variant || "default",
      duration: opts.duration ?? 4000,
    };
    setToasts((t) => [...t, item]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            duration={t.duration}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
            className={cn(
              "pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-4 shadow-lg",
              t.variant === "destructive" ? "border-destructive/50" : "border-border"
            )}
          >
            <div className="flex flex-1 flex-col gap-0.5">
              {t.title && (
                <ToastPrimitive.Title className="text-sm font-semibold text-foreground">
                  {t.title}
                </ToastPrimitive.Title>
              )}
              {t.description && (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
