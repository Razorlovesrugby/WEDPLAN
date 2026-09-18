import type { FaqItem } from "./sections";

/**
 * The FAQ starter library (spec 14 §10).
 *
 * Exists because a blank FAQ is the section most likely to stay blank, and
 * Aisle's own analytics make this the most-visited page of a wedding site. The
 * planner accepts, edits or deletes each one; none of it is compulsory.
 *
 * Answers are written in first person plural (Q11) and are deliberately
 * *drafts with the specifics missing* rather than filled-in guesses. A
 * plausible wrong answer — "there's plenty of parking" when there isn't — is
 * worse than an obvious blank, because nobody proofreads a sentence that
 * already reads like a sentence. Anything the couple must supply is in
 * [square brackets] so it is visible at a glance and greppable.
 *
 * Two rules from Aisle's guide, applied here and repeated to the planner in
 * the editor: answers run two to four sentences, and anything logistical
 * carries a link to the thing the guest will actually use.
 */

export type StarterFaq = FaqItem & { a: string };

export const FAQ_TAGS = ["The day", "Getting there", "Staying over", "Food & drink", "Guests"] as const;

export const FAQ_LIBRARY: StarterFaq[] = [
  {
    q: "What's the dress code?",
    a: "[e.g. Lounge suits and summer dresses — nothing black tie.] The ceremony is [indoors/outdoors], so bring something warm for the evening.",
    featured: true,
    tags: ["The day"],
  },
  {
    q: "What time should I arrive?",
    a: "Doors open at [time] and the ceremony starts at [time]. Please aim to be seated fifteen minutes before — we'd hate for you to miss it.",
    featured: true,
    tags: ["The day"],
  },
  {
    q: "Where exactly is it?",
    a: "[Venue name], [full address, postcode]. The entrance is [describe anything non-obvious]. There's a map link on the schedule above.",
    featured: true,
    tags: ["Getting there"],
  },
  {
    q: "Where do I park?",
    a: "[Free parking on site / Parking is limited, so please share a car if you can.] [Say whether cars can be left overnight — this is the part people actually need to know.]",
    featured: true,
    tags: ["Getting there"],
  },
  {
    q: "Is there a bus?",
    a: "[Yes — a coach leaves from [place] at [time] and brings everyone back at [time]. Pick your seats on your RSVP page.] [Or: no, but here's a local taxi firm: [number].]",
    featured: true,
    tags: ["Getting there"],
  },
  {
    q: "Can I bring a plus one?",
    a: "Your invitation lists everyone we've got space for — if a name isn't on it, we're afraid we couldn't stretch to it. It's nothing personal; the venue caps us at [number].",
    featured: true,
    tags: ["Guests"],
  },
  {
    q: "Are children invited?",
    a: "[We'd love to have your little ones there. / We've decided to keep the day child-free, with the exception of our immediate family — we hope that gives you an excuse for a night off.]",
    featured: false,
    tags: ["Guests"],
  },
  {
    q: "When do I need to reply by?",
    a: "By [date], please. We have to give the venue final numbers shortly after, so a late reply is genuinely hard to accommodate.",
    featured: false,
    tags: ["Guests"],
  },
  {
    q: "Is it indoors or outside?",
    a: "[The ceremony is outdoors if the weather holds, with an indoor backup.] Either way there's cover for the whole day, so you won't be stuck in the rain.",
    featured: false,
    tags: ["The day"],
  },
  {
    q: "Will there be food, and what if I can't eat something?",
    a: "There's [describe: a sit-down meal, canapés, evening food]. Tell us about any allergies or dietary requirements on your RSVP and we'll pass them to the caterers.",
    featured: false,
    tags: ["Food & drink"],
  },
  {
    q: "Is there a bar?",
    a: "[Drinks are on us until [time], and it's a cash bar after that.] [Say whether it takes cards — a cash-only bar nobody warned about is a genuinely bad evening.]",
    featured: false,
    tags: ["Food & drink"],
  },
  {
    q: "Is the venue accessible?",
    a: "[Describe honestly: step-free access, accessible loos, how far the walk from parking is, whether any of it is on grass.] If you need anything at all, tell us on your RSVP and we'll sort it.",
    featured: false,
    tags: ["The day"],
  },
  {
    q: "Where should I stay?",
    a: "There are a few places we'd recommend under “Where to stay” above. [Mention any block booking and its deadline here.] Book early — [date] is a busy weekend locally.",
    featured: false,
    tags: ["Staying over"],
  },
  {
    q: "What's there to do nearby?",
    a: "If you're making a weekend of it, we've listed a few favourites above. [Name one or two things you'd genuinely send a friend to.]",
    featured: false,
    tags: ["Staying over"],
  },
  {
    q: "What's the gift situation?",
    a: "Honestly, you being there is the gift — we've been together [time] and have all the toasters we need. If you'd like to do something anyway, [say what, or say a contribution to the honeymoon].",
    featured: false,
    tags: ["Guests"],
  },
  {
    q: "Can I take photos?",
    a: "[We'd love you to — do tag them [hashtag].] [Or: we're asking for an unplugged ceremony, so please keep phones away until we're married — our photographer will get the shots.]",
    featured: false,
    tags: ["The day"],
  },
  {
    q: "What time does it finish?",
    a: "Carriages at [time]. [Say how people are getting home — this is the question that gets asked at 10pm if it isn't answered here.]",
    featured: false,
    tags: ["The day"],
  },
  {
    q: "Who do I ask if something goes wrong on the day?",
    a: "Please don't call us — we'll be slightly busy. [Name] is looking after everything on the day and can be reached on [number].",
    featured: false,
    tags: ["The day"],
  },
];

/** Every distinct tag the library uses, in the order they first appear. */
export function libraryTags(): string[] {
  const seen: string[] = [];
  for (const item of FAQ_LIBRARY) {
    const tag = item.tags[0];
    if (tag && !seen.includes(tag)) seen.push(tag);
  }
  return seen;
}
