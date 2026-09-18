/**
 * How many households one bulk-send invocation reaches (spec 14 §12.3).
 *
 * The senders make one request to the email provider per recipient, serially.
 * At four hundred households that is four hundred round trips inside a single
 * server action, which on a serverless function means a timeout — and a
 * timeout half way through is the worst outcome available: some people have
 * the email, the sender has no idea who, and pressing the button again is the
 * only move left.
 *
 * So each call does a bounded slice and reports what remains, and the caller
 * continues until nothing does. `message_log.dedupe_key` is what makes
 * continuing safe: a household already reached is skipped by a unique
 * violation rather than mailed twice.
 *
 * Its own module because a `"use server"` file may only export async
 * functions, and both the action and the screen need this number.
 */
export const SEND_BATCH = 25;
