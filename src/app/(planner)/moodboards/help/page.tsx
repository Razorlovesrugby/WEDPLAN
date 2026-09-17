import Link from "next/link";

export const metadata = { title: "How moodboards work" };

/**
 * The how-to, in the app rather than in a document nobody can find.
 *
 * It lives here and not in docs/ because the questions it answers — "which
 * field does the photographer see?", "how do I stop my mum's link working?"
 * — get asked while looking at the screen, often on a phone, by someone who
 * is not going to open a repository to find out.
 *
 * Static: no data, no queries. It renders on a database with no moodboard
 * tables at all, which is exactly when somebody is most likely to be reading
 * it.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      {children}
    </section>
  );
}

export default function MoodboardHelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 pb-16">
      <header className="space-y-2">
        <Link href="/moodboards" className="text-sm text-muted underline">
          ← Moodboards
        </Link>
        <h1 className="font-serif text-3xl">How moodboards work</h1>
        <p className="text-sm text-muted">
          A board is a grid of pictures you can hand to one audience over a link that needs no
          account — the photographer for the vibe, guests for the dress code.
        </p>
      </header>

      <Section title="Making a board">
        <p className="text-sm">
          <strong>Moodboards → New board.</strong> Give it a name, and you land on the board.
        </p>
        <p className="text-sm">
          The title and the description under it are edited in place — click, type, click away. The
          description is the first thing whoever you send it to reads, so write it for them:{" "}
          <em>&ldquo;Light, not poses. The getting-ready shots matter more than the group ones.&rdquo;</em>
        </p>
      </Section>

      <Section title="Getting pictures in">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <strong>Add images</strong> — the file picker.
          </li>
          <li>
            <strong>Drag and drop</strong> onto the dashed box.
          </li>
          <li>
            <strong>Paste</strong> — ⌘V or Ctrl+V anywhere on the board.
          </li>
        </ul>
        <p className="text-sm">
          Paste is the one worth remembering: screenshot something, paste it, done — no saving to
          disk first.
        </p>
        <p className="text-sm text-muted">
          Pictures are resized in your browser before they upload, so a phone photo lands at a few
          hundred kilobytes. Animated GIFs stay animated. An iPhone HEIC file will be refused in
          Chrome with a note telling you to convert it first; Safari handles them.
        </p>
      </Section>

      <Section title="Caption and private note — the important bit">
        <p className="text-sm">Click a picture (on a phone, tap its bottom edge) to edit it.</p>
        <div className="card divide-y divide-line text-sm">
          <div className="flex gap-3 p-3">
            <span className="w-28 shrink-0 font-medium">Caption</span>
            <span>Everyone who opens the board sees this.</span>
          </div>
          <div className="flex gap-3 p-3">
            <span className="w-28 shrink-0 font-medium">Private note</span>
            <span>
              Only shown on share links you switch notes on for. This is where{" "}
              <em>&ldquo;this is the one I actually care about — 6pm, sun behind them&rdquo;</em> goes.
            </span>
          </div>
          <div className="flex gap-3 p-3">
            <span className="w-28 shrink-0 font-medium">Where it came from</span>
            <span>The original page. Shown with the credits.</span>
          </div>
          <div className="flex gap-3 p-3">
            <span className="w-28 shrink-0 font-medium">Credit</span>
            <span>Who took it, if you know.</span>
          </div>
        </div>
        <p className="text-sm">
          Same board, two links: the photographer sees your notes, your mum sees only the captions.
          That difference is the whole point of keeping them in separate fields.
        </p>
        <p className="text-sm text-muted">
          Also here: <strong>Make cover</strong> picks the picture that represents the board in the
          list, and <strong>Delete</strong> removes it from storage for good.
        </p>
      </Section>

      <Section title="Sharing">
        <p className="text-sm">
          <strong>For one person</strong> — under <em>Sharing</em>, type who it&rsquo;s for
          (&ldquo;Anna — photographer&rdquo;), tick <strong>Show my private notes</strong> if they
          should see them, and press <strong>Create link</strong>. The link appears once, so copy it
          there and then. They open it with no login.
        </p>
        <p className="text-sm">
          <strong>Make a separate link per person.</strong> Each one has its own view count, so you
          can see whether it was ever opened, and revoking one doesn&rsquo;t disturb the others.
        </p>
        <p className="text-sm">
          <strong>For guests, don&rsquo;t send a link at all.</strong> Use the two switches under{" "}
          <em>Publish</em>: one puts the board on your public wedding site, the other puts it on the
          RSVP page. The second is the good one for a dress code — guests are already on that page
          answering, so it&rsquo;s not another link for them to lose. Private notes are never shown
          on either, whatever the setting says, because there&rsquo;s nobody specific on the other
          end.
        </p>
      </Section>

      <Section title="Clipping from anywhere on the web">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            → <strong>Clipper</strong> → name the browser, pick a default board,{" "}
            <strong>Create token</strong>. Copy it — it&rsquo;s shown once.
          </li>
          <li>
            In Chrome: <code>chrome://extensions</code> → Developer mode → <strong>Load unpacked</strong>{" "}
            → choose the <code>extension</code> folder from this project.
          </li>
          <li>
            Click the extension&rsquo;s icon, paste this site&rsquo;s address and the token, press{" "}
            <strong>Save &amp; connect</strong>.
          </li>
        </ol>
        <p className="text-sm">
          Now right-click any picture anywhere → <strong>Send to moodboard</strong> → pick a board.
          It appears on an open board within a second or two, without refreshing. On Pinterest it
          takes the full-size image and the pin&rsquo;s own address rather than the thumbnail.
        </p>
        <p className="text-sm text-muted">
          Clip with no signal and it waits in a queue, with a count on the icon, and sends when
          you&rsquo;re back. Nothing is dropped.
        </p>
      </Section>

      <Section title="Importing a Pinterest board">
        <p className="text-sm">
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          → <strong>Connect Pinterest</strong>, then on any board press{" "}
          <strong>Import from Pinterest</strong>, choose a board, tick the pins you want and press
          Import. Read-only: it can list your boards and pins and nothing else.
        </p>
        <p className="text-sm text-muted">
          Running it again later skips anything already on the board, so it&rsquo;s safe to re-import
          after you&rsquo;ve pinned more.
        </p>
      </Section>

      <Section title="Three things worth knowing">
        <div className="space-y-3 text-sm">
          <p>
            <strong>Revoking is quick, not instant.</strong> It closes the page immediately, but a
            picture already loaded in someone&rsquo;s open tab stays readable for up to an hour.
            That&rsquo;s deliberate — the alternative is links breaking while people scroll.
          </p>
          <p>
            <strong>Archive is not delete.</strong> Archiving hides a board and{" "}
            <em>Show archived</em> brings it back. Deleting removes the pictures from storage
            permanently, and asks first.
          </p>
          <p>
            <strong>Importing into a published board warns you.</strong> Collecting someone
            else&rsquo;s photograph privately and putting it on a public address are different
            things, so you get a heads-up before it happens.
          </p>
        </div>
      </Section>

      <Section title="If something isn't working">
        <p className="text-sm">
          <a href="/api/health" className="underline">
            Open the health check
          </a>
          . It says which settings are missing, whether the database is reachable, whether the
          moodboard tables have been created, and whether the picture storage exists — which covers
          nearly every way this can fail.
        </p>
      </Section>
    </div>
  );
}
