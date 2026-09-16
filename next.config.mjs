/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are the only write path in this app; keep the payload
    // ceiling low so a malformed CSV import fails fast rather than in the DB.
    serverActions: { bodySizeLimit: "4mb" },

    // Client-side router cache. Every planner page reads cookies, so Next
    // treats them all as dynamic, and `dynamic` defaults to 0 — meaning a
    // page you visited two seconds ago is re-fetched and re-queried from
    // scratch when you click back to it. Nothing here is cached anywhere
    // else, so that default made every repeat navigation pay full price.
    //
    // 30s is safe rather than arbitrary: every mutation in this app goes
    // through a Server Action that calls `revalidatePath` and/or
    // `router.refresh()`, both of which drop these entries immediately. So
    // your own edits are never stale — the only thing this window can delay
    // is the *other* collaborator's edit showing up on a page you are
    // bouncing back to, which is the right trade for a two-person planner.
    staleTimes: { dynamic: 30, static: 180 },

    // Barrel files: import only the icons/utilities actually referenced
    // rather than the whole package, which shrinks the client bundle the
    // board and ranking screens have to parse before they become interactive.
    optimizePackageImports: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/modifiers", "@dnd-kit/utilities"],
  },
};

export default nextConfig;
