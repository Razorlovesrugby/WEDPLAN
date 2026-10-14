"use client";

/** The browser makes the PDF (spec 33 §4.2): no server-side rendering to outgrow a function's limits. */
export function PrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
