import { createClient } from "@/lib/supabase/server";

/**
 * Compile-time guard against silently untyped database access.
 *
 * @supabase/ssr 0.5.2 passed SupabaseClient's generic parameters in the order
 * supabase-js used at 2.43. By 2.116 that order had changed, so `Schema`
 * landed in the wrong slot and every table in the app resolved to `never`.
 * Nothing failed visibly: `never` is assignable to anything, so queries
 * type-checked, casts looked reasonable, and the app would have shipped with
 * no type safety over the database whatsoever.
 *
 * The function below is never called. It exists so that `tsc` has to infer a
 * real row type from the real client. If the packages drift apart again, the
 * assignment stops compiling and CI says so instead of the types quietly
 * evaporating.
 */
type AssertNotNever<T> = [T] extends [never] ? false : true;

export async function databaseTypesAreLive(): Promise<true> {
  const supabase = await createClient();
  const { data } = await supabase.from("guests").select("first_name, age_band").limit(1);

  type Row = NonNullable<typeof data>[number];
  const live: AssertNotNever<Row> = true;

  // Also check a specific column, which catches a schema that resolves to a
  // loose `any` rather than to `never`.
  const band: Row["age_band"] = "adult";
  void band;

  return live;
}
