import { body, display, label } from "@/lib/fonts";
import { REGISTRY_PAIRINGS, resolvePairing, type RegistryFace } from "./look";

/**
 * The registry's faces (spec 36 Q7a). Split from `look.ts` because importing
 * `@/lib/fonts` pulls in `next/font/local`, which only works inside Next's
 * build — `look.ts` stays plain so its tests can run without it.
 */
const FACES: Record<RegistryFace, string> = {
  fraunces: display.style.fontFamily,
  garamond: body.style.fontFamily,
  inter: label.style.fontFamily,
};

/** The variable classes that load all three faces, and the roles a pairing assigns them. */
export function registryFonts(pairingId: string | null | undefined): {
  className: string;
  vars: Record<string, string>;
} {
  const pairing = REGISTRY_PAIRINGS[resolvePairing(pairingId)];
  return {
    className: `${display.variable} ${body.variable} ${label.variable}`,
    vars: {
      "--font-display": FACES[pairing.display],
      "--font-body": FACES[pairing.body],
      "--font-label": FACES.inter,
    },
  };
}
