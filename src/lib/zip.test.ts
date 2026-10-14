import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, zip } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches the standard check value", () => {
    // The CRC-32 of "123456789" is 0xCBF43926 for every implementation.
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

/** Reads a stored-only archive back with nothing but the ZIP spec. */
function read(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

const hasPython = spawnSync("python3", ["-V"]).status === 0;

describe("zip", () => {
  it("round-trips entries, including UTF-8 names and contents", () => {
    const archive = zip([
      { name: "guests.csv", data: text("First name\nZoë\n") },
      { name: "Müller households.csv", data: text("a,b\n1,2\n") },
      { name: "empty.txt", data: new Uint8Array() },
    ]);
    expect(read(archive)).toEqual({
      "guests.csv": "First name\nZoë\n",
      "Müller households.csv": "a,b\n1,2\n",
      "empty.txt": "",
    });
  });

  it.skipIf(!hasPython)("writes an archive an independent unzip accepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const file = join(dir, "a.zip");
    writeFileSync(file, zip([{ name: "x/y.csv", data: text("hello,world\n") }, { name: "z.txt", data: text("ü") }]));
    // Python is the independent reader: its zipfile checks the CRC of every member.
    const result = execFileSync(
      "python3",
      ["-I", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(sorted(z.namelist()));print(z.read('z.txt').decode())", file],
      { encoding: "utf8" },
    );
    expect(result).toBe("None\n['x/y.csv', 'z.txt']\nü\n");
    expect(readFileSync(file).length).toBeGreaterThan(0);
  });
});
