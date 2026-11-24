import type { ComponentType } from "react";
import { ShotListScreen } from "./shot-list-screen";

/**
 * The screens of the modules registered in `src/lib/day-links/modules.ts`
 * (spec 54 §7), by module key and tab key. Specs 52 and 53 add theirs here.
 * 
 */
export type ModuleScreenProps = { token: string; tab: string; config: Record<string, unknown> };

export const MODULE_SCREENS: Record<string, ComponentType<ModuleScreenProps>> = {
  shot_list: ShotListScreen,
};
