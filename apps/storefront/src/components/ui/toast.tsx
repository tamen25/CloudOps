"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-bg-raised group-[.toaster]:text-fg-base group-[.toaster]:border-border-default group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-fg-muted",
          actionButton:
            "group-[.toast]:bg-brand-500 group-[.toast]:text-fg-invert",
          cancelButton:
            "group-[.toast]:bg-bg-elev group-[.toast]:text-fg-muted",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
export { toast } from "sonner";
