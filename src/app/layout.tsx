import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "AccessAI — AI-Powered Website Accessibility Auditor",
    template: "%s | AccessAI",
  },
  description:
    "Audit web pages for WCAG compliance violations using Playwright and axe-core, with contextual AI-assisted remediation guidance.",
  keywords: [
    "accessibility",
    "a11y",
    "WCAG 2.2",
    "axe-core",
    "audit",
    "web accessibility",
    "Ollama",
    "developer tools",
  ],
  authors: [{ name: "AccessAI Engineering" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold text-foreground hover:opacity-90 transition-opacity"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground font-bold text-sm">
                A
              </span>
              <span className="text-lg tracking-tight">
                Access<span className="text-primary font-bold">AI</span>
              </span>
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-mono">
                v0.1.0
              </span>
            </Link>

            <nav aria-label="Main Navigation" className="flex items-center gap-6">
              <Link
                href="/scans"
                className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
              >
                Audit History & Analytics
              </Link>
              <Link
                href="/#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#compliance-scope"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Scope & Limitations
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        <footer className="border-t border-border bg-card py-8 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              &copy; {new Date().getFullYear()} AccessAI. Built for professional software engineering accessibility evaluation.
            </p>
            <p>
              Engineered with Next.js, Playwright, axe-core, and Ollama.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
