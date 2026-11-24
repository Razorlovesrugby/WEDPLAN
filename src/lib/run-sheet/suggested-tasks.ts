/**
 * Common helper tasks, written out so the couple edits rather than composes
 * (spec 54 §10.4). Code, not data. Each fills a new task's title, length,
 * instructions, steps and bring list.
 */

export type SuggestedTask = {
  key: string;
  title: string;
  minutes: number;
  instructions: string;
  steps: string[];
  bring: string[];
  /** Opens a module when one exists (the family wrangler opens the shot list). */
  opensModule?: string;
};

export const SUGGESTED_TASKS: readonly SuggestedTask[] = [
  {
    key: "programmes",
    title: "Hand out programmes",
    minutes: 30,
    instructions: "Greet people at the entrance and give each household one programme. Keep a few spare for latecomers.",
    steps: ["Collect the programmes", "Set up at the entrance", "Hand them out as guests arrive"],
    bring: ["Programmes", "A box for spares"],
  },
  {
    key: "seat_guests",
    title: "Seat guests for the ceremony",
    minutes: 30,
    instructions: "Show guests to their seats. Keep the front rows for family. Ask latecomers to wait for a pause before coming in.",
    steps: ["Learn where the reserved rows are", "Seat family first", "Seat everyone else, filling from the front"],
    bring: [],
  },
  {
    key: "ring_bearer",
    title: "Ring bearer",
    minutes: 20,
    instructions: "Carry the rings down the aisle and hand them over when asked. Keep them safe until then.",
    steps: ["Collect the rings", "Wait at the back for the music", "Walk to the front and hand them over"],
    bring: ["The rings, in their box"],
  },
  {
    key: "guestbook",
    title: "Look after the guestbook table",
    minutes: 120,
    instructions: "Invite each guest to sign and leave a message. Keep the pens together and the book open.",
    steps: ["Set up the table", "Welcome guests to sign", "Pack the book away safely at the end"],
    bring: ["The guestbook", "Pens", "A sign"],
  },
  {
    key: "gift_table",
    title: "Look after the gift table",
    minutes: 120,
    instructions: "Take gifts and cards as guests arrive and keep them together. Note anything that looks valuable.",
    steps: ["Set up the table", "Collect gifts and cards", "Pack everything into the car at the end"],
    bring: ["A box for cards", "A pen and notepad"],
  },
  {
    key: "music",
    title: "Run the music for the walk in",
    minutes: 15,
    instructions: "Start the walk-in track on the planner's word, and fade it out when the couple reach the front.",
    steps: ["Check the speaker and volume", "Queue the walk-in track", "Start it on the word"],
    bring: ["The playlist on your phone", "A cable"],
  },
  {
    key: "family_photos",
    title: "Family photo wrangler",
    minutes: 45,
    instructions: "Gather each family group for their photo, in the order the photographer asks. Keep people nearby between shots.",
    steps: ["Get the shot list from the photographer", "Call each group by name", "Send the next group to the spot"],
    bring: ["The list of family groups"],
    opensModule: "shot_list",
  },
  {
    key: "witnesses",
    title: "Sign the register as a witness",
    minutes: 15,
    instructions: "Sign the marriage register after the ceremony, when the celebrant asks.",
    steps: ["Wait by the table", "Sign where the celebrant shows you"],
    bring: ["Photo ID, in case it's asked for"],
  },
  {
    key: "pack_down",
    title: "Pack down and load the cars",
    minutes: 60,
    instructions: "Clear the decorations, signs and gifts and load them into the cars. Leave the venue as you found it.",
    steps: ["Collect the decorations", "Check the tables for belongings", "Load the cars"],
    bring: ["Boxes and bags"],
  },
  {
    key: "return_hired",
    title: "Return hired items",
    minutes: 60,
    instructions: "Take the hired items back by the time on the hire agreement. Count them against the list first.",
    steps: ["Count the items against the list", "Return them to the hire company"],
    bring: ["The hire list"],
  },
];

export function suggestedTask(key: string): SuggestedTask | null {
  return SUGGESTED_TASKS.find((t) => t.key === key) ?? null;
}
