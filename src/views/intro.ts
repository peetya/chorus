import { type Html, html, raw } from "../html.ts";

// The finished pages draw their picture once: intro.js starts these SVG animations. Without the script, or
// when the person asked for less motion, the picture just stands finished, as each one ends.
export const INTRO_SECONDS = 4;

const start = `dur="${INTRO_SECONDS}s" begin="indefinite" fill="freeze"`;

// Fades in when the drawing gets to `at`: 0 is the start, 1 the end.
export function appearAt(at: number): Html {
  const from = Math.min(Math.max(at, 0), 0.97);
  return html`<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${from.toFixed(3)};${(from + 0.03).toFixed(3)};1" ${raw(start)}/>`;
}

// For a path with pathLength="1" stroke-dasharray="1": it draws itself from the first point to the last.
export function drawLine(): Html {
  return html`<animate attributeName="stroke-dashoffset" values="1;0" ${raw(start)}/>`;
}

// A dot that travels along the path, then fades out.
export function travel(path: string): Html {
  return html`<animateMotion path="${path}" ${raw(start)}/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.92;1" ${raw(start)}/>`;
}

// How far along a line each of its points is, from 0 to 1, by length: a drawn line reaches them then.
export function along(points: [number, number][]): number[] {
  const done = [0];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    done.push(done[i - 1] + Math.hypot(x2 - x1, y2 - y1));
  }
  const total = done[done.length - 1];
  return done.map((length) => (total > 0 ? length / total : 0));
}
