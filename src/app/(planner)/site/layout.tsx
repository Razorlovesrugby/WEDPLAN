import { CoupleOnly } from "@/components/couple-only";

// A planner has no access to this section (spec 39); see CoupleOnly.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CoupleOnly>{children}</CoupleOnly>;
}
