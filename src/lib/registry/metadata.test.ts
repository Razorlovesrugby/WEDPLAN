import { describe, expect, it } from "vitest";
import { decodeEntities, extractMetadata, parsePriceToMinor } from "./metadata";

const PAGE = "https://shop.test/p/glasses";

describe("extractMetadata", () => {
  it("reads Open Graph tags and resolves relative image URLs", () => {
    const html = `<html><head>
      <meta property="og:title" content="Wine &amp; Co. Glasses (set of 4)">
      <meta property="og:description" content="Lovely.">
      <meta property="og:site_name" content="Shop">
      <meta property="og:image" content="/img/a.jpg">
      <meta property="product:price:amount" content="119.50">
      <meta property="product:price:currency" content="NZD">
    </head></html>`;
    const m = extractMetadata(html, PAGE);
    expect(m.title).toBe("Wine & Co. Glasses (set of 4)");
    expect(m.siteName).toBe("Shop");
    expect(m.images).toEqual(["https://shop.test/img/a.jpg"]);
    expect(m.priceMinor).toBe(11950);
  });

  it("falls back to JSON-LD Product for title, images and price", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Product", name: "Stand mixer", image: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"], offers: { "@type": "Offer", price: "899.00", priceCurrency: "NZD" } }],
    })}</script>`;
    const m = extractMetadata(html, PAGE);
    expect(m.title).toBe("Stand mixer");
    expect(m.images).toEqual(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"]);
    expect(m.priceMinor).toBe(89900);
  });

  it("will not present a foreign-currency price as dollars", () => {
    const html = `<meta property="product:price:amount" content="50"><meta property="product:price:currency" content="USD">`;
    expect(extractMetadata(html, PAGE).priceMinor).toBeNull();
    const ld = `<script type="application/ld+json">{"@type":"Product","offers":{"price":"50","priceCurrency":"AUD"}}</script>`;
    expect(extractMetadata(ld, PAGE).priceMinor).toBeNull();
  });

  it("only offers https images, de-duplicated, capped", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `<link rel="image_src" href="https://c.test/${i}.jpg">`).join("");
    const html = `<meta property="og:image" content="http://insecure.test/x.jpg"><meta name="twitter:image" content="https://c.test/0.jpg">${tags}`;
    const m = extractMetadata(html, PAGE);
    expect(m.images.every((u) => u.startsWith("https://"))).toBe(true);
    expect(new Set(m.images).size).toBe(m.images.length);
    expect(m.images.length).toBe(8);
  });

  it("never throws on rubbish, and strips tags out of titles", () => {
    expect(extractMetadata("", PAGE)).toEqual({ title: null, description: null, siteName: null, images: [], priceMinor: null });
    expect(extractMetadata("<script type=\"application/ld+json\">{broken</script>", PAGE).title).toBeNull();
    expect(extractMetadata("<title>Hi <script>x</script> there</title>", PAGE).title).toBe("Hi x there");
  });

  it("refuses javascript: and data: images", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="data:image/png;base64,AAAA">`;
    expect(extractMetadata(html, PAGE).images).toEqual([]);
  });
});

describe("parsePriceToMinor", () => {
  it("handles both decimal conventions without a float", () => {
    expect(parsePriceToMinor("1,299.50")).toBe(129950);
    expect(parsePriceToMinor("1.299,50")).toBe(129950);
    expect(parsePriceToMinor("1,299")).toBe(129900);
    expect(parsePriceToMinor("$19.99")).toBe(1999);
    expect(parsePriceToMinor(0.29)).toBe(29);
  });
  it("rejects nothing-ish values", () => {
    for (const v of ["", "free", "0", "-1", null, undefined, "9999999"]) expect(parsePriceToMinor(v), String(v)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes the common ones and tolerates nonsense", () => {
    expect(decodeEntities("A &amp; B &#39;c&#39; &#x41; &#0; &unknown;")).toBe("A & B 'c' A  &unknown;");
  });
});
