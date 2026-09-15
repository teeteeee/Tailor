"use client";

import { useRef, useState } from "react";

const ACCEPT = ".pdf,.docx,.txt,.md";

export function Dropzone({
  onFile,
  filename,
  busy,
}: {
  onFile: (file: File) => void;
  filename: string | null;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? "border-accent bg-accent-soft" : "border-line bg-surface-2"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <p className="text-sm">
        {filename ? (
          <span className="font-medium">{filename}</span>
        ) : (
          <>
            Drop your resume here, or{" "}
            <button
              type="button"
              className="font-medium text-accent underline underline-offset-2 disabled:opacity-50"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              choose a file
            </button>
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted">PDF, DOCX, TXT or Markdown · up to 8 MB</p>
    </div>
  );
}
