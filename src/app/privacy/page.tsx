import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

/**
 * The privacy notice.
 *
 * Public, because the people it is written for — guests — have no account and
 * reach it from an RSVP link or the public site. It is deliberately specific:
 * it names the fields this app actually stores (guests, rsvps, rsvp_answers,
 * invitations, message_log, rsvp_token_attempts) rather than the usual generic
 * "we may collect information about you". If those tables change, this page
 * changes with them.
 *
 * Two things it must not do:
 *
 *   - Call serverEnv(). CI builds with only the NEXT_PUBLIC_* values set, so
 *     touching the server schema here would fail the build for a page that is
 *     otherwise static text. The contact route is therefore the reply-to on
 *     the invitation email, which is configured, rather than an address
 *     inlined from the environment.
 *   - Claim a storage region. Nobody has created the Supabase project yet
 *     (docs/HANDOFF.md), so the region is not knowable from this repository.
 *     "Processors" below names who holds the data and why; add the region
 *     once the project exists, because it is the one fact a guest in the UK
 *     or the EU may actually want.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy",
};

/** Change this whenever the wording below changes materially. */
const LAST_UPDATED = "2026-09-16";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * The couple's name and timezone, or nothing.
 *
 * Same shape as the public site: no session here, V1 is one wedding, so this
 * takes the first. Wrapped in a try/catch because this is the one page that
 * has to render when everything else is broken — a privacy notice that 500s
 * because the database is unreachable, or because the service role key is
 * missing from a preview deployment, is a privacy notice nobody can read when
 * they most want to. The name is a courtesy; the text below is the point.
 */
async function loadWedding(): Promise<{ name: string; timezone: string } | null> {
  try {
    const { data } = await createAdminClient()
      .from("weddings")
      .select("name, timezone")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export default async function PrivacyPage() {
  const wedding = await loadWedding();

  const couple = wedding?.name ?? "the couple";
  const timezone = wedding?.timezone ?? "Europe/London";

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="pb-8">
        <h1 className="font-serif text-4xl">Privacy</h1>
        <p className="mt-2 text-muted">
          What this site holds about you, why, and how to get it changed or deleted.
        </p>
        <p className="mt-1 text-sm text-muted">
          Last updated {formatDate(LAST_UPDATED, timezone)}
        </p>
      </header>

      <Section title="Who holds it">
        <p>
          This site is run by {couple} to organise their wedding. It is not a company and there
          is no business behind it: the only people who can sign in are the couple and anyone
          they have explicitly added to help plan.
        </p>
        <p>
          It is not run for profit, your details are never sold, and nothing here is used for
          advertising.
        </p>
      </Section>

      <Section title="What it holds about you">
        <p>If you have been invited, the site may hold:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Who you are.</strong> Your name and the name you prefer to be called, which
            household you belong to, whether you are an adult or a child, and which side of the
            wedding invited you.
          </li>
          <li>
            <strong>How to reach you.</strong> Email address, phone number, and a postal address
            for the household if one was needed for the invitation.
          </li>
          <li>
            <strong>Your answers.</strong> Whether you are coming to each event, your dietary
            requirements, any accessibility needs, and your answers to the couple&rsquo;s own
            questions (song requests, transport, and the like).
          </li>
          <li>
            <strong>Notes.</strong> Free-text notes the couple keep against a guest or a
            household while planning.
          </li>
          <li>
            <strong>Invitation admin.</strong> Your household&rsquo;s private RSVP link, when the
            invitation was sent, when the link was first opened, and when you first replied.
          </li>
          <li>
            <strong>Email records.</strong> The address an invitation or reminder was sent to,
            and whether it was delivered or failed.
          </li>
        </ul>
        <p>
          Most of it either came from the couple, who typed or imported it from their own
          address book, or from you, when you filled in the RSVP form.
        </p>
      </Section>

      <Section title="Dietary requirements and accessibility needs">
        <p>
          These two can say something about your health, so they get treated differently from
          the rest. Both are optional — leave them blank and your RSVP still counts. If you fill
          them in, you are asking the couple to act on them, and they will be passed to the
          caterer or the venue for exactly that purpose and no other.
        </p>
        <p>
          If you would rather tell the couple privately than type it into the form, do that
          instead. Nothing is lost by it.
        </p>
      </Section>

      <Section title="Why it holds it">
        <p>
          To invite you, count heads, feed you something you can eat, make sure you can get into
          the building, seat you next to people you know, and chase the invitations that have not
          been answered. That is the whole purpose. When the wedding is over, so is the purpose.
        </p>
        <p>
          In UK and EU data protection terms, that is the couple&rsquo;s legitimate interest in
          organising their own wedding, and — for dietary and accessibility details — your
          explicit consent, given by choosing to write them down.
        </p>
      </Section>

      <Section title="Who else sees it">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>The couple and their helpers.</strong> Anyone they have added as a
            collaborator can see the full guest list.
          </li>
          <li>
            <strong>The caterer and the venue.</strong> They receive a list of confirmed
            attendees with dietary notes, because that is what a kitchen needs. They do not
            receive your contact details or the planning notes.
          </li>
          <li>
            <strong>Nobody else.</strong> The guest list is not published, not shared with other
            guests, and not indexed by search engines.
          </li>
        </ul>
      </Section>

      <Section title="The services this site runs on">
        <p>Three suppliers process data on the couple&rsquo;s behalf, and only on their instructions:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> — the database the guest list and RSVPs are stored in, and
            the sign-in for the couple.
          </li>
          <li>
            <strong>Vercel</strong> — the hosting this site runs on.
          </li>
          <li>
            <strong>Resend</strong> — delivery of invitation and reminder emails.
          </li>
        </ul>
        <p>Nothing is sent anywhere else. There are no third-party analytics or advertising tools.</p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          As a guest, you are given no cookies at all. There are no analytics scripts, no
          advertising tags and no tracking pixels in the emails — the &ldquo;opened&rdquo; marker
          the couple see is simply the first time your RSVP link was loaded, which tells them a
          message arrived and nothing about you.
        </p>
        <p>
          The couple and their collaborators get one cookie, which keeps them signed in. That is
          the only cookie this site sets.
        </p>
        <p>
          One more thing worth naming: to stop someone guessing RSVP links, the site keeps a
          one-way hash of the network address each attempt came from, with a timestamp. It cannot
          be turned back into an address, and it is used for nothing but rate limiting.
        </p>
      </Section>

      <Section title="How long it is kept">
        <p>
          Until the wedding is over and the last of the thank-yous are out — then the guest list,
          the RSVPs and the email records are deleted. Rate-limiting records are transient and
          matter for minutes.
        </p>
        <p>
          If you would like your details removed sooner, say so; the only cost is that the couple
          may have to ask you for them again.
        </p>
      </Section>

      <Section title="What you can ask for">
        <p>
          You can ask to see what is held about you, to have it corrected, to have it deleted, or
          to object to it being held at all. Ask, and it will be done — there is no process to go
          through and no form to fill in. Withdrawing consent for dietary or accessibility details
          removes them; it does not affect your RSVP.
        </p>
        <p>
          If you are in the UK and you are unhappy with how a request was handled, you can
          complain to the Information Commissioner&rsquo;s Office at{" "}
          <a className="underline hover:text-accent" href="https://ico.org.uk/make-a-complaint/">
            ico.org.uk
          </a>
          . In the EU, your national data protection authority does the same job.
        </p>
      </Section>

      <Section title="How to get in touch">
        <p>
          Reply to the invitation or reminder email — replies go straight to the couple — or
          contact them the way you normally would. There is no separate inbox for this site.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this notice changes, the date at the top changes with it. There is no version
          history to dig through: what is on this page is what applies.
        </p>
      </Section>

      <footer className="border-t border-line pt-8">
        <Link className="text-sm text-muted underline hover:text-accent" href="/w">
          Back to the wedding site
        </Link>
      </footer>
    </main>
  );
}
