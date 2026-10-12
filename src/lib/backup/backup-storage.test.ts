import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/backup-storage.mjs is plain JavaScript run by a workflow, so its core
 * is exercised here against a fake storage client (spec 32 §3.2). The rules
 * worth pinning: it walks folders, it refuses above the size limit BEFORE
 * downloading anything, and a failed download fails the whole run — a backup
 * that quietly skips a file is worse than none.
 */

type Item = { name: string; id: string | null; updated_at?: string; metadata?: { size: number } };
type Backup = {
  listAll: (c: unknown, b: string) => Promise<{ path: string; size: number }[]>;
  backupBucket: (
    c: unknown,
    b: string,
    out: string,
    o?: { maxBytes?: number; concurrency?: number },
  ) => Promise<{ count: number; bytes: number }>;
};

const modulePath = new URL("../../../scripts/backup-storage.mjs", import.meta.url).href;
const load = () => import(/* @vite-ignore */ modulePath) as Promise<Backup>;
const restorePath = new URL("../../../scripts/restore-storage.mjs", import.meta.url).href;
const loadRestore = () =>
  import(/* @vite-ignore */ restorePath) as Promise<{
    restoreBucket: (c: unknown, b: string, dir: string) => Promise<{ uploaded: number }>;
  }>;

function fakeClient(tree: Record<string, Item[]>, files: Record<string, string>, failOn?: string) {
  let downloads = 0;
  const client = {
    downloads: () => downloads,
    storage: {
      from: () => ({
        list: async (prefix: string, opts: { offset: number }) => ({
          data: opts.offset === 0 ? (tree[prefix] ?? []) : [],
          error: null,
        }),
        download: async (path: string) => {
          downloads += 1;
          if (path === failOn) return { data: null, error: { message: "boom" } };
          return { data: new Blob([files[path] ?? ""]), error: null };
        },
      }),
    },
  };
  return client;
}

const tree = {
  "": [
    { name: "a.jpg", id: "1", metadata: { size: 3 } },
    { name: "site", id: null },
  ],
  site: [{ name: "b.png", id: "2", metadata: { size: 5 } }],
};
const files = { "a.jpg": "abc", "site/b.png": "hello" };

describe("backup-storage", () => {
  it("walks into folders and lists every object with its path", async () => {
    const { listAll } = await load();
    const found = await listAll(fakeClient(tree, files), "moodboards");
    expect(found.map((o) => o.path).sort()).toEqual(["a.jpg", "site/b.png"]);
  });

  it("copies every object, keeps paths, and writes a manifest that matches", async () => {
    const { backupBucket } = await load();
    const out = await mkdtemp(join(tmpdir(), "backup-"));
    const manifest = await backupBucket(fakeClient(tree, files), "moodboards", out);
    expect(manifest).toMatchObject({ count: 2, bytes: 8 });
    expect(await readFile(join(out, "site/b.png"), "utf8")).toBe("hello");
    expect((await readdir(out)).sort()).toEqual(["a.jpg", "manifest.json", "site"]);
    expect(JSON.parse(await readFile(join(out, "manifest.json"), "utf8")).count).toBe(2);
  });

  it("refuses above the size limit before downloading anything", async () => {
    const { backupBucket } = await load();
    const client = fakeClient(tree, files);
    const out = await mkdtemp(join(tmpdir(), "backup-"));
    await expect(backupBucket(client, "moodboards", out, { maxBytes: 7 })).rejects.toThrow(/over the/);
    expect(client.downloads()).toBe(0);
  });

  it("fails the whole run when one download fails", async () => {
    const { backupBucket } = await load();
    const out = await mkdtemp(join(tmpdir(), "backup-"));
    await expect(
      backupBucket(fakeClient(tree, files, "site/b.png"), "moodboards", out),
    ).rejects.toThrow(/Could not download "site\/b.png"/);
  });

  it("round-trips: what was backed up is what a restore uploads, with the right content types", async () => {
    const { backupBucket } = await load();
    const { restoreBucket } = await loadRestore();
    const dir = await mkdtemp(join(tmpdir(), "backup-"));
    await backupBucket(fakeClient(tree, files), "moodboards", dir);

    const uploads: { path: string; type: string | undefined; body: string }[] = [];
    const target = {
      storage: {
        from: () => ({
          upload: async (path: string, body: Buffer, opts: { contentType?: string; upsert?: boolean }) => {
            expect(opts.upsert).toBe(true);
            uploads.push({ path, type: opts.contentType, body: body.toString() });
            return { error: null };
          },
        }),
      },
    };
    expect(await restoreBucket(target, "moodboards", dir)).toEqual({ uploaded: 2 });
    expect(uploads.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "a.jpg", type: "image/jpeg", body: "abc" },
      { path: "site/b.png", type: "image/png", body: "hello" },
    ]);
  });
});
