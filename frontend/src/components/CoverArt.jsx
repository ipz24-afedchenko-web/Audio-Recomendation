import { useState } from "react";
import { MusicNotes } from "@phosphor-icons/react";

/**
 * CoverArt — renders a track's cover image with a minimalist fallback.
 *
 * Design (minimalist-ui protocol):
 * - When `src` is present and loads, shows the image (object-cover) clipped
 *   to the tile. No heavy shadows, no gradients — just the warm secondary
 *   surface behind it.
 * - When `src` is missing OR the image fails to load, shows the `fallback`
 *   node (default: a subtle MusicNotes icon on the secondary surface).
 *
 * The wrapper sizing/rounding is controlled entirely by the caller via
 * `className` (e.g. "h-11 w-11 rounded-lg"). This component owns only the
 * image-vs-placeholder logic + overflow-hidden clipping.
 *
 * @param {string|null|undefined} src        Cover image URL.
 * @param {string}                alt        Alt text (defaults to "").
 * @param {string}                className  Tailwind classes for the tile
 *                                           (size + radius).
 * @param {React.ReactNode}       fallback   Optional custom fallback node.
 */
export default function CoverArt({
  src,
  alt = "",
  className = "h-11 w-11 rounded-lg",
  fallback = null,
}) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(src) && !broken;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-secondary text-secondary-foreground ${className}`}
    >
      {showImg ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        fallback ?? <MusicNotes className="h-1/2 w-1/2" weight="fill" />
      )}
    </span>
  );
}
