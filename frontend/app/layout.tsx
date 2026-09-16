import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/locale-provider";
import { AuthProvider } from "@/components/auth-provider";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: { default: "FITX Gym Management", template: "%s · FITX" },
  description: "Manage memberships, payments, expenses, reminders, staff, and financial performance.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#080D10" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <LocaleProvider><AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider></LocaleProvider>
      </body>
    </html>
  );
}
