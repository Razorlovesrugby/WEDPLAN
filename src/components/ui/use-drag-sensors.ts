"use client";

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * The one drag setup every screen uses (spec 45). iPad friendly:
 *
 * - **Touch** starts a drag only after a 200 ms press that hasn't moved more
 *   than 8 px, so a finger scrolling a list never picks a row up.
 * - **Mouse** starts after a few pixels, so a click is still a click.
 * - **Keyboard**: Space picks up, arrows move, Space drops, Esc cancels;
 *   `sortable` uses the list's own order for the arrows.
 *
 * `drag-sensors.test.ts` fails if a DndContext is set up without this hook.
 */
export function useDragSensors({ sortable = true, distance = 4 }: { sortable?: boolean; distance?: number } = {}) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, sortable ? { coordinateGetter: sortableKeyboardCoordinates } : {}),
  );
}

/**
 * Spread on a control inside a draggable element (a select, a ⋯ menu), so
 * pressing it never starts a drag of the element around it. Mouse, touch and
 * keyboard each have their own sensor, so each event is stopped.
 */
export const stopDrag = {
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onTouchStart: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
};
