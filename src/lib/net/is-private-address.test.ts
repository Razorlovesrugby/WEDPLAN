import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./is-private-address";

/**
 * The most load-bearing test suite in the moodboards feature. A hole here is
 * a hole in a server that fetches URLs a browser extension — or a third
 * party's API response — chose for it.
 */

describe("isPrivateAddress: public addresses are allowed", () => {
  it("allows ordinary public IPv4", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "151.101.1.140", "99.99.99.99", "223.255.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("allows ordinary public IPv6", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4009:81f::200e"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("isPrivateAddress: the ranges that matter", () => {
  it("blocks the cloud metadata address", () => {
    // The one this whole file exists for.
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("blocks loopback", () => {
    for (const ip of ["127.0.0.1", "127.0.0.0", "127.255.255.255", "127.1.2.3"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("blocks every RFC1918 range, at both boundaries", () => {
    const cases: [string, boolean][] = [
      ["9.255.255.255", false],
      ["10.0.0.0", true],
      ["10.255.255.255", true],
      ["11.0.0.0", false],
      ["172.15.255.255", false],
      ["172.16.0.0", true],
      ["172.31.255.255", true],
      ["172.32.0.0", false],
      ["192.167.255.255", false],
      ["192.168.0.0", true],
      ["192.168.255.255", true],
      ["192.169.0.0", false],
    ];
    for (const [ip, blocked] of cases) expect(isPrivateAddress(ip), ip).toBe(blocked);
  });

  it("blocks CGNAT at its boundaries", () => {
    expect(isPrivateAddress("100.63.255.255")).toBe(false);
    expect(isPrivateAddress("100.64.0.0")).toBe(true);
    expect(isPrivateAddress("100.127.255.255")).toBe(true);
    expect(isPrivateAddress("100.128.0.0")).toBe(false);
  });

  it("blocks link-local, this-network, multicast, reserved and broadcast", () => {
    for (const ip of [
      "169.254.0.0",
      "169.254.255.255",
      "0.0.0.0",
      "0.1.2.3",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("blocks the documentation and benchmarking ranges", () => {
    for (const ip of ["192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.0.1", "192.88.99.1", "192.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
});

describe("isPrivateAddress: IPv6", () => {
  it("blocks loopback and unspecified", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
    expect(isPrivateAddress("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks unique-local, link-local and multicast", () => {
    for (const ip of ["fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "ff02::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    // fec0:: is outside fe80::/10 and outside fc00::/7 — not blocked by those rules.
    expect(isPrivateAddress("2001:db8::1")).toBe(true); // documentation range
  });

  it("blocks the discard prefix", () => {
    expect(isPrivateAddress("100::1")).toBe(true);
  });

  /**
   * The bypass that a naive checker misses: an IPv4 address written as IPv6.
   * ::ffff:169.254.169.254 reaches the metadata service just as well.
   */
  it("sees through IPv4-mapped IPv6", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
    // The same address written in hex rather than dotted quad.
    expect(isPrivateAddress("::ffff:7f00:1")).toBe(true);
  });

  it("sees through NAT64", () => {
    expect(isPrivateAddress("64:ff9b::127.0.0.1")).toBe(true);
    expect(isPrivateAddress("64:ff9b::169.254.169.254")).toBe(true);
    expect(isPrivateAddress("64:ff9b::8.8.8.8")).toBe(false);
  });

  it("ignores a zone index", () => {
    expect(isPrivateAddress("fe80::1%eth0")).toBe(true);
  });
});

describe("isPrivateAddress: fails closed", () => {
  it("blocks anything it cannot parse", () => {
    for (const value of [
      "",
      "   ",
      "localhost",
      "example.com",
      "1.2.3",
      "1.2.3.4.5",
      "1.2.3.256",
      "::ffff:999.1.1.1",
      "not an address",
      "12345",
      "::1::2",
      "gggg::1",
    ]) {
      expect(isPrivateAddress(value), JSON.stringify(value)).toBe(true);
    }
  });

  /**
   * "0177.0.0.1" is 127.0.0.1 to anything that accepts octal. This parser
   * rejects the shape outright rather than trying to agree with whichever
   * interpretation the network stack picks.
   */
  it("refuses octal and hexadecimal dotted forms rather than interpreting them", () => {
    expect(isPrivateAddress("0177.0.0.1")).toBe(true);
    expect(isPrivateAddress("0x7f.0.0.1")).toBe(true);
    expect(isPrivateAddress("010.0.0.1")).toBe(true);
  });

  it("handles a bracketed literal", () => {
    expect(isPrivateAddress("[::1]")).toBe(true);
    expect(isPrivateAddress("[2606:4700:4700::1111]")).toBe(false);
  });
});
