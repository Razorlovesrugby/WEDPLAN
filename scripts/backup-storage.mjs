#!/usr/bin/env node
/**
 * Copies every object in the private storage bucket to a local directory
 * (spec 32 §3.2 step 4). A Postgres dump holds the rows that POINT at images,
 * not the images.
 *
 *   node scripts/backup-storage.mjs ./out/storage
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, like
 * scripts/ensure-bucket.mjs. Reads .env.local if present.
 *
 * It copies EVERYTHING each run rather than only what changed: the dumps go to
 * separate, expiring GitHub artifacts, so there is no previous copy to diff
 * against. The free plan's 1 GB of storage bounds the work, but the repo's
 * Actions artifact quota (500 MB on the free plan) is the tighter limit — so
 * the run REFUSES, loudly, above STORAGE_BACKUP_MAX_MB (default 200) rather
 * than silently filling it. Raise the limit or move the dumps to an object
 * store (spec 32 Q2) when that happens.
 *
 * Writes manifest.json beside the files: every path, size and updated_at, and
 * the totals. A restore checks its counts against it.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const BUCKET = "moodboards";
const PAGE = 1000;

/** Every object path under `prefix`, recursing into folders. Folders list with a null id. */
export async function listAll(client, bucket, prefix = "") {
  const found = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Could not list "${prefix}": ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) {
        found.push(...(await listAll(client, bucket, path)));
      } else {
        found.push({
          path,
          size: Number(item.metadata?.size ?? 0),
          updated_at: item.updated_at ?? null,
        });
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return found;
}

export async function backupBucket(client, bucket, outDir, { maxBytes, concurrency = 4 } = {}) {
  const objects = await listAll(client, bucket);
  const totalBytes = objects.reduce((sum, o) => sum + o.size, 0);

  if (maxBytes !== undefined && totalBytes > maxBytes) {
    throw new Error(
      `The "${bucket}" bucket is ${(totalBytes / 1048576).toFixed(0)} MB, over the ` +
        `${(maxBytes / 1048576).toFixed(0)} MB limit for this backup. Raise STORAGE_BACKUP_MAX_MB ` +
        `or move backups to an object store (docs/specs/32-backup-and-audit-log.md, Q2).`,
    );
  }

  await mkdir(outDir, { recursive: true });
  const queue = [...objects];
  let written = 0;

  async function worker() {
    for (let o = queue.shift(); o; o = queue.shift()) {
      const { data, error } = await client.storage.from(bucket).download(o.path);
      if (error || !data) throw new Error(`Could not download "${o.path}": ${error?.message ?? "empty"}`);
      const target = join(outDir, o.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await data.arrayBuffer()));
      written += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (written !== objects.length) {
    throw new Error(`Wrote ${written} of ${objects.length} objects.`);
  }
  const manifest = { bucket, count: objects.length, bytes: totalBytes, objects };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: node scripts/backup-storage.mjs <output-dir>");
    process.exit(2);
  }
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const maxMb = Number(process.env.STORAGE_BACKUP_MAX_MB ?? 200);
  const manifest = await backupBucket(client, BUCKET, outDir, { maxBytes: maxMb * 1048576 });
  console.log(`==> ${manifest.count} objects, ${(manifest.bytes / 1048576).toFixed(1)} MB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`!! ${error.message}`);
    process.exit(1);
  });
}
