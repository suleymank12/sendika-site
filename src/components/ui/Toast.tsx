"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#fff",
          color: "#1F2937",
          borderRadius: "0.75rem",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
          fontSize: "0.875rem",
        },
        success: {
          iconTheme: { primary: "#059669", secondary: "#fff" },
        },
        error: {
          iconTheme: { primary: "#DC2626", secondary: "#fff" },
        },
      }}
    />
  );
}
