"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { commitImport, previewImport, type PreviewResult } from "@/server/actions/import";
import { FIELD_HINTS, FIELD_LABELS, IMPORT_FIELDS, type ImportField } from "@/lib/import/columns";
import type { PlannedRow } from "@/lib/import/plan";

/**
 * Three steps: choose a file, check the mapping, review what will happen.
 *
 * The review step is the point of the whole screen. An import that just runs
 * is fine until the day it silently doubles a guest list, and by then the
 * only record of what it did is the damage. So every row is shown with its
 * decision, the decision is editable, and the counts above the table say
 * plainly how many rows are about to be created.
 *
 * The file text is held here and posted again on commit. The server re-parses
 * and re-plans it; what it accepts from this component is the list of lines
 * to skip, never the guest data.
 */

type Step = "file" | "map" | "review";

export function ImportWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ households: number; guests: number } | null>(null);

  function readFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError("That file could not be read");
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setText(content);
      setFileName(file.name);
      runPreview(content);
    };
    // UTF-8 covers the exports that matter; a file in another encoding shows
    // up as mangled accents in the preview, which is visible rather than silent.
    reader.readAsText(file, "utf-8");
  }

  function runPreview(content: string, mapping?: (ImportField | null)[]) {
    startTransition(async () => {
      const result = await previewImport(content, mapping);
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setError(null);
      setPreview(result.data);
      setSkipped(
        new Set(
          result.data.plan.rows.filter((row) => row.action === "skip").map((row) => row.line),
        ),
      );
      setStep((current) => (current === "file" ? "map" : current));
    });
  }

  function setColumn(index: number, field: ImportField | null) {
    if (!preview) return;
    const mapping = [...preview.mapping];
    mapping[index] = field;
    // Each field lands in one column, so claiming it elsewhere releases it.
    if (field !== null) {
      mapping.forEach((existing, i) => {
        if (i !== index && existing === field) mapping[i] = null;
      });
    }
    setPreview({ ...preview, mapping });
    runPreview(text, mapping);
  }

  function toggleRow(row: PlannedRow) {
    if (row.errors.length > 0) return; // unusable rows are not a choice
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(row.line)) next.delete(row.line);
      else next.add(row.line);
      return next;
    });
  }

  function onCommit() {
    if (!preview) return;
    startTransition(async () => {
      const result = await commitImport(text, preview.mapping, [...skipped]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setDone(result.data);
      router.refresh();
    });
  }

  function reset() {
    setStep("file");
    setText("");
    setFileName("");
    setPreview(null);
    setSkipped(new Set());
    setError(null);
    setDone(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  // --- done ---------------------------------------------------------------
  if (done) {
    return (
      <div className="card space-y-4 p-5">
        <h2 className="font-serif text-xl">Imported</h2>
        <p className="text-sm">
          {done.guests} {done.guests === 1 ? "guest" : "guests"} in {done.households}{" "}
          {done.households === 1 ? "household" : "households"}. They are at the bottom of the
          ranking, below everyone already there.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => router.push("/guests")} className="btn-primary">
            See the guest list
          </button>
          <button type="button" onClick={() => router.push("/guests/rank")} className="btn">
            Rank them
          </button>
          <button type="button" onClick={reset} className="btn">
            Import another file
          </button>
        </div>
      </div>
    );
  }

  const counts = preview
    ? {
        creating: preview.plan.rows.filter(
          (row) => row.errors.length === 0 && !skipped.has(row.line),
        ).length,
        skipping: preview.plan.rows.filter(
          (row) => row.errors.length === 0 && skipped.has(row.line),
        ).length,
        invalid: preview.plan.counts.invalid,
      }
    : null;

  return (
    <div className="space-y-5">
      <Steps current={step} hasPreview={preview !== null} onGo={setStep} />

      {error ? (
        <p role="alert" className="card border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {/* --- step 1: the file ------------------------------------------- */}
      {step === "file" ? (
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="font-serif text-xl">Choose a file</h2>
            <p className="mt-1 text-sm text-muted">
              A .csv exported from Excel, Numbers, Google Sheets or Contacts. The first row must
              be the column headings. Nothing is saved until you have seen what it will do.
            </p>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="field"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
            }}
          />

          <details className="text-sm">
            <summary className="cursor-pointer text-muted">What should be in it?</summary>
            <div className="mt-2 space-y-2 text-muted">
              <p>
                One row per guest. A first name is the only column that has to be there;
                everything else is optional.
              </p>
              <p>
                Add a <strong>Household</strong> column to keep people together — rows sharing a
                household name become one household with one invitation. Without it, everyone
                lands in a household of their own, which you can merge later.
              </p>
              <pre className="overflow-x-auto rounded bg-line/30 p-3 text-xs">
{`Household,First name,Last name,Email,Adult / child
The Boatengs,Ama,Boateng,ama@example.test,adult
The Boatengs,Kofi,Boateng,,adult
The Boatengs,Esi,Boateng,,child`}
              </pre>
            </div>
          </details>
        </div>
      ) : null}

      {/* --- step 2: the mapping ----------------------------------------- */}
      {step === "map" && preview ? (
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="font-serif text-xl">Check the columns</h2>
            <p className="mt-1 text-sm text-muted">
              {fileName} — {preview.headers.length} columns, {preview.plan.counts.total} rows.
              Anything left as “Ignore” is not imported.
            </p>
          </div>

          <div className="space-y-2">
            {preview.headers.map((header, index) => {
              const field = preview.mapping[index] ?? null;
              return (
                <div key={`${header}-${index}`} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[10rem] text-sm font-medium">{header || "(no heading)"}</span>
                  <select
                    value={field ?? ""}
                    onChange={(event) =>
                      setColumn(index, event.target.value === "" ? null : (event.target.value as ImportField))
                    }
                    className="field max-w-[14rem]"
                    aria-label={`What is “${header}”?`}
                  >
                    <option value="">Ignore this column</option>
                    {IMPORT_FIELDS.map((option) => (
                      <option key={option} value={option}>
                        {FIELD_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  {field && FIELD_HINTS[field] ? (
                    <span className="text-xs text-muted">{FIELD_HINTS[field]}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!preview.mapping.includes("first_name") ? (
            <p role="alert" className="text-sm text-red-800">
              Nothing is mapped to a first name yet, so no row can be imported.
            </p>
          ) : null}

          {preview.truncated ? (
            <p className="text-sm text-amber-800">
              Only the first 2,000 rows were read. Split the file and import it in parts.
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !preview.mapping.includes("first_name")}
              onClick={() => setStep("review")}
            >
              Review {preview.plan.counts.total} rows
            </button>
            <button type="button" className="btn" onClick={reset}>
              Choose a different file
            </button>
          </div>
        </div>
      ) : null}

      {/* --- step 3: the review ------------------------------------------ */}
      {step === "review" && preview && counts ? (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              <strong>{counts.creating}</strong> to import · <strong>{counts.skipping}</strong>{" "}
              skipped
              {counts.invalid > 0 ? (
                <>
                  {" "}
                  · <strong>{counts.invalid}</strong> unusable
                </>
              ) : null}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setStep("map")}>
                Back to columns
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={pending || counts.creating === 0}
                onClick={onCommit}
              >
                {pending ? "Importing…" : `Import ${counts.creating}`}
              </button>
            </div>
          </div>

          {preview.plan.counts.duplicates > 0 ? (
            <p className="text-sm text-muted">
              {preview.plan.counts.duplicates}{" "}
              {preview.plan.counts.duplicates === 1 ? "row looks" : "rows look"} like someone
              already on the list, so they start skipped. Tick one to import it anyway.
            </p>
          ) : null}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left">
                <tr>
                  <th className="p-2 font-medium">Import</th>
                  <th className="p-2 font-medium">Line</th>
                  <th className="p-2 font-medium">Guest</th>
                  <th className="p-2 font-medium">Household</th>
                  <th className="p-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.plan.rows.map((row) => {
                  const unusable = row.errors.length > 0;
                  const importing = !unusable && !skipped.has(row.line);
                  return (
                    <tr
                      key={row.line}
                      className={`border-b border-line/60 ${unusable ? "bg-red-50/60" : ""}`}
                    >
                      <td className="p-2 align-top">
                        <input
                          type="checkbox"
                          checked={importing}
                          disabled={unusable}
                          onChange={() => toggleRow(row)}
                          aria-label={`Import line ${row.line}`}
                        />
                      </td>
                      <td className="p-2 align-top text-muted">{row.line}</td>
                      <td className="p-2 align-top">
                        {[row.guest.first_name, row.guest.last_name].filter(Boolean).join(" ") ||
                          "—"}
                        {row.guest.email ? (
                          <span className="block text-xs text-muted">{row.guest.email}</span>
                        ) : null}
                        {row.guest.age_band !== "adult" ? (
                          <span className="block text-xs text-muted">{row.guest.age_band}</span>
                        ) : null}
                      </td>
                      <td className="p-2 align-top">
                        {row.householdName || "—"}
                        {row.existingHouseholdId ? (
                          <span className="block text-xs text-muted">joins existing household</span>
                        ) : null}
                      </td>
                      <td className="p-2 align-top">
                        {row.errors.map((message) => (
                          <span key={message} className="block text-xs text-red-800">
                            {message}
                          </span>
                        ))}
                        {row.duplicate ? (
                          <span className="block text-xs text-amber-800">
                            {describeDuplicate(row.duplicate)}
                          </span>
                        ) : null}
                        {row.warnings.map((message) => (
                          <span key={message} className="block text-xs text-muted">
                            {message}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function describeDuplicate(duplicate: NonNullable<PlannedRow["duplicate"]>): string {
  switch (duplicate.kind) {
    case "email":
      return `Same email as ${duplicate.existingName}${
        duplicate.existingHousehold ? ` (${duplicate.existingHousehold})` : ""
      }`;
    case "name":
      return `Looks like ${duplicate.existingName}${
        duplicate.existingHousehold ? ` (${duplicate.existingHousehold})` : ""
      }, already on the list`;
    case "duplicate_in_file":
      return `Already appears in this file — ${duplicate.existingName}`;
  }
}

function Steps({
  current,
  hasPreview,
  onGo,
}: {
  current: Step;
  hasPreview: boolean;
  onGo: (step: Step) => void;
}) {
  const steps: { id: Step; label: string }[] = [
    { id: "file", label: "1. File" },
    { id: "map", label: "2. Columns" },
    { id: "review", label: "3. Review" },
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Import steps">
      {steps.map((step) => {
        const reachable = step.id === "file" || hasPreview;
        return (
          <button
            key={step.id}
            type="button"
            disabled={!reachable}
            onClick={() => onGo(step.id)}
            className={`rounded border px-3 py-1.5 text-sm ${
              current === step.id
                ? "border-ink bg-ink text-white"
                : "border-line bg-white hover:bg-line/40 disabled:opacity-50"
            }`}
            aria-current={current === step.id ? "step" : undefined}
          >
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
