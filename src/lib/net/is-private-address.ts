/**
 * Is this IP address one the server must refuse to connect to?
 *
 * This is the whole of the SSRF defence for src/lib/net/fetch-image.ts, which
 * fetches URLs that came from a browser extension or from a third party's API
 * response. Two rules make it worth its own file and its own test suite:
 *
 *   1. It checks an ADDRESS, not a hostname. Rejecting the strings
 *      "localhost" and "127.0.0.1" is not a control: the attack is
 *      "images.example.com resolves to 169.254.169.254". By the time this
 *      function is called, DNS has already happened.
 *
 *   2. It FAILS CLOSED. Anything it cannot parse is treated as private and
 *      refused. An address this cannot understand is not an address this
 *      should be connecting to.
 *
 * Kept free of Node APIs so it is a pure unit test rather than an integration
 * one — docs/HANDOFF.md section 8.
 */

/** Four octets, or null. Deliberately strict: no octal, no shorthand, no "1.2.3". */
function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    // "01" and "0x7f" are both ways of writing an address that a lenient
    // parser reads differently from the network stack. Neither is allowed.
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** Sixteen bytes, or null. Handles "::" compression and a trailing IPv4 form. */
function parseIpv6(value: string): number[] | null {
  let text = value;

  // A zone index ("fe80::1%eth0") is not part of the address.
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  if (text.includes(".")) {
    // ::ffff:127.0.0.1 — the last 32 bits are written as IPv4.
    const lastColon = text.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    const [a, b, c, d] = v4 as [number, number, number, number];
    const hex = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    text = `${text.slice(0, lastColon + 1)}${hex}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0] ?? "");
  const tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (!head || !tail) return null;

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  const bytes: number[] = [];
  for (const group of groups) bytes.push((group >> 8) & 0xff, group & 0xff);
  return bytes;
}

function inRange(octets: number[], cidr: string): boolean {
  const [network, bitsText] = cidr.split("/") as [string, string];
  const base = parseIpv4(network);
  if (!base) return false;
  let bits = Number(bitsText);

  for (let i = 0; i < 4 && bits > 0; i += 1) {
    const take = Math.min(8, bits);
    const mask = (0xff << (8 - take)) & 0xff;
    if (((octets[i] ?? 0) & mask) !== ((base[i] ?? 0) & mask)) return false;
    bits -= take;
  }
  return true;
}

/**
 * Everything that is not a public unicast address on the internet. Broader
 * than "private": TEST-NET and benchmarking ranges have no business being
 * fetched either, and a request that reaches one is a misconfiguration worth
 * failing on.
 */
const BLOCKED_V4 = [
  "0.0.0.0/8", //         this network
  "10.0.0.0/8", //        RFC1918
  "100.64.0.0/10", //     CGNAT
  "127.0.0.0/8", //       loopback
  "169.254.0.0/16", //    link-local — this is the cloud metadata range
  "172.16.0.0/12", //     RFC1918
  "192.0.0.0/24", //      IETF protocol assignments
  "192.0.2.0/24", //      TEST-NET-1
  "192.88.99.0/24", //    6to4 relay anycast
  "192.168.0.0/16", //    RFC1918
  "198.18.0.0/15", //     benchmarking
  "198.51.100.0/24", //   TEST-NET-2
  "203.0.113.0/24", //    TEST-NET-3
  "224.0.0.0/4", //       multicast
  "240.0.0.0/4", //       reserved, and 255.255.255.255 with it
] as const;

function ipv4IsBlocked(octets: number[]): boolean {
  return BLOCKED_V4.some((cidr) => inRange(octets, cidr));
}

/**
 * True means "do not connect to this". Unparseable input is true, on purpose.
 */
export function isPrivateAddress(address: string): boolean {
  const trimmed = address.trim();
  if (trimmed === "") return true;

  // Some stacks hand back a bracketed literal.
  const bare = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;

  const v4 = parseIpv4(bare);
  if (v4) return ipv4IsBlocked(v4);

  const v6 = parseIpv6(bare);
  if (!v6) return true; // fail closed

  const isAllZero = (from: number, to: number) => v6.slice(from, to).every((b) => b === 0);

  // ::  and ::1
  if (isAllZero(0, 15) && (v6[15] === 0 || v6[15] === 1)) return true;

  // ::ffff:a.b.c.d — an IPv4 address wearing an IPv6 hat. Judge the IPv4.
  if (isAllZero(0, 10) && v6[10] === 0xff && v6[11] === 0xff) {
    return ipv4IsBlocked(v6.slice(12, 16));
  }

  // 64:ff9b::/96 — NAT64. Same trick, same treatment.
  if (v6[0] === 0x00 && v6[1] === 0x64 && v6[2] === 0xff && v6[3] === 0x9b && isAllZero(4, 12)) {
    return ipv4IsBlocked(v6.slice(12, 16));
  }

  const first = v6[0] ?? 0;
  const second = v6[1] ?? 0;

  if ((first & 0xfe) === 0xfc) return true; //                    fc00::/7  unique local
  if (first === 0xfe && (second & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (first === 0xff) return true; //                             ff00::/8  multicast
  if (first === 0x01 && second === 0x00 && isAllZero(2, 8)) return true; // 100::/64 discard
  if (first === 0x20 && second === 0x01 && v6[2] === 0x0d && v6[3] === 0xb8) return true; // 2001:db8::/32

  return false;
}
