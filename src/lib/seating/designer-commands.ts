/**
 * The designer's commands for ⌘K (spec 59 A.6): what the Room view can do that
 * a person might want by name. Pure, so the palette lists them and the tests
 * pin them; the Room view runs them (through `designer-bridge`) while it is on
 * screen, and the palette offers them only then.
 */

export type DesignerCommand = { id: string; label: string; /** The key that does the same on the plan. */ keys?: string; keywords?: string[] };

export const DESIGNER_COMMANDS: readonly DesignerCommand[] = [
  { id: "fit", label: "Fit the room", keys: "⇧1", keywords: ["zoom", "whole", "view"] },
  { id: "zoom-selection", label: "Zoom to the selection", keys: "⇧2", keywords: ["view"] },
  { id: "zoom-100", label: "Zoom to 100%", keys: "0", keywords: ["actual size", "view"] },
  { id: "zoom-in", label: "Zoom in", keys: "+", keywords: ["bigger"] },
  { id: "zoom-out", label: "Zoom out", keys: "−", keywords: ["smaller"] },
  { id: "tool-select", label: "Select tool", keys: "V", keywords: ["pick", "pointer"] },
  { id: "tool-hand", label: "Hand tool", keys: "H", keywords: ["pan", "move the view"] },
  { id: "tool-wall", label: "Draw walls", keys: "W", keywords: ["venue", "building"] },
  { id: "tool-arc", label: "Draw a curved wall", keys: "C", keywords: ["venue", "building", "arc"] },
  { id: "tool-area", label: "Draw an area", keys: "A", keywords: ["venue", "lawn", "zone"] },
  { id: "tool-text", label: "Add text to the plan", keys: "T", keywords: ["label", "venue"] },
  { id: "tool-measure", label: "Measure on the plan", keys: "M", keywords: ["distance", "walkway", "tape"] },
  { id: "select-all", label: "Select everything in the room", keys: "⌘A", keywords: ["all"] },
  { id: "select-similar", label: "Select similar", keys: "⌘⇧A", keywords: ["same", "kind", "size"] },
  { id: "duplicate", label: "Duplicate the selection", keys: "⌘D", keywords: ["copy"] },
  { id: "delete", label: "Delete the selection", keys: "Del", keywords: ["remove"] },
  { id: "turn", label: "Turn the selection 90°", keywords: ["rotate"] },
  { id: "align-left", label: "Align left", keywords: ["selection", "line up"] },
  { id: "align-centre", label: "Align centres across", keywords: ["selection", "line up"] },
  { id: "align-right", label: "Align right", keywords: ["selection", "line up"] },
  { id: "align-top", label: "Align top", keywords: ["selection", "line up"] },
  { id: "align-middle", label: "Align middles down", keywords: ["selection", "line up"] },
  { id: "align-bottom", label: "Align bottom", keywords: ["selection", "line up"] },
  { id: "space-across", label: "Space evenly across", keywords: ["selection", "distribute"] },
  { id: "space-down", label: "Space evenly down", keywords: ["selection", "distribute"] },
  { id: "grid", label: "Arrange the selection in a grid", keywords: ["selection", "rows"] },
  { id: "nav-trackpad", label: "Navigation: Trackpad", keywords: ["scroll", "pinch", "mouse"] },
  { id: "nav-mouse", label: "Navigation: Mouse", keywords: ["scroll", "wheel", "trackpad"] },
  { id: "shortcuts", label: "Shortcuts for the plan", keys: "?", keywords: ["keys", "help"] },
];
