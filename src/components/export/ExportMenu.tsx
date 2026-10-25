"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Printer,
  Loader2,
  ChevronDown,
} from "lucide-react";

export interface ExportMenuProps {
  scanId: string;
}

export function ExportMenu({ scanId }: ExportMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [downloadingFormat, setDownloadingFormat] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDownload = async (format: "json" | "csv" | "pdf") => {
    setDownloadingFormat(format);
    setIsOpen(false);

    try {
      const response = await fetch(`/api/scans/${scanId}/export?format=${format}`);
      if (!response.ok) {
        throw new Error(`Export failed with HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `accessai-report-${scanId.slice(0, 8)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to export ${format}:`, err);
      alert(`Failed to export report as ${format.toUpperCase()}. Please try again.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handlePrint = () => {
    setIsOpen(false);
    window.print();
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={downloadingFormat !== null}
        className="gap-2 h-9 border-border text-foreground hover:bg-muted font-medium"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {downloadingFormat ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Exporting {downloadingFormat.toUpperCase()}…</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4 text-primary" />
            <span>Export Report</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
          </>
        )}
      </Button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-52 rounded-md bg-card border border-border shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
          role="menu"
          aria-orientation="vertical"
        >
          <button
            type="button"
            onClick={() => handleDownload("json")}
            className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
            role="menuitem"
          >
            <FileJson className="w-4 h-4 text-amber-500" />
            <div>
              <div className="font-semibold">Download JSON</div>
              <div className="text-[10px] text-muted-foreground">Full schema & remediations</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("csv")}
            className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
            role="menuitem"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <div>
              <div className="font-semibold">Download CSV</div>
              <div className="text-[10px] text-muted-foreground">Spreadsheet-ready findings</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
            role="menuitem"
          >
            <FileText className="w-4 h-4 text-rose-500" />
            <div>
              <div className="font-semibold">Download PDF</div>
              <div className="text-[10px] text-muted-foreground">Executive audit summary</div>
            </div>
          </button>

          <div className="my-1 border-t border-border/60" />

          <button
            type="button"
            onClick={handlePrint}
            className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
            role="menuitem"
          >
            <Printer className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="font-semibold">Print Report</div>
              <div className="text-[10px] text-muted-foreground">Browser print dialog (PDF)</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
