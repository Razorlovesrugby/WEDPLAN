"use client";

import { useMemo } from "react";
import { buildKitchen, mealQuestion } from "@/lib/seating/kitchen";
import { isServiceStyle, parseMenu, type Menu, type ServiceStyle } from "@/lib/seating/service";
import { useSeating } from "./seating-state";

/** The plan's menu, its default service style and the kitchen summary for who sits where now. One place, so every screen agrees. */
export function useKitchen() {
  const { data, tables, assignments, settings, colourBy } = useSeating();
  const menu: Menu = useMemo(() => {
    const r = parseMenu(data.plan?.menu);
    return r.ok ? r.menu : [];
  }, [data.plan?.menu]);
  const defaultStyle: ServiceStyle = isServiceStyle(data.plan?.service_style) ? data.plan.service_style : "plated";
  const meal = useMemo(
    () => mealQuestion(data.colour.questions, data.colour.answers, colourBy.kind === "question" ? colourBy.questionId : null),
    [data.colour.questions, data.colour.answers, colourBy],
  );
  const kitchen = useMemo(
    () => buildKitchen({ menu, defaultStyle, tables, seats: assignments, guests: data.guests, settings, meal }),
    [menu, defaultStyle, tables, assignments, data.guests, settings, meal],
  );
  return { menu, defaultStyle, meal, kitchen };
}
