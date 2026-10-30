/**
 * The couple's note for one event, under its venue (spec 28 §5.3): parking,
 * timings, what happens when.
 *
 * Always shown in full. It used to clamp a long note to three lines behind a
 * More/Less button, but that saved little space and put a tap between a guest
 * and the details.
 */
export function EventNote({ text }: { text: string }) {
  return (
    <div className="site-event-note mt-3">
      <p className="whitespace-pre-line text-[1rem] leading-relaxed text-ink">{text}</p>
    </div>
  );
}
