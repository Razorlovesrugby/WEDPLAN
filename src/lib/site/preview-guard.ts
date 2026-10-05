/**
 * What the editor's preview says when a guest-facing control is used
 * (spec 28 §4.3).
 *
 * The preview draws a household's real page — the reply form, the vote button,
 * the coach booking, the uploader — and lets the planner use every one. None of
 * it can save, and the reason is not a flag somebody has to remember to check:
 * the preview holds **no token**, and every write behind those controls needs
 * one. These two sentences are only what the planner is told.
 */
export const PREVIEW_NOT_SENT = "This is a preview — nothing was sent.";
export const PREVIEW_NOT_SAVED = "This is a preview — nothing was saved.";
