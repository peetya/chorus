// Where the sun is, for the daylight on the wall's map. NOAA's "General Solar Position Calculations":
// good to a few minutes of time, which is plenty for a picture, and no API that can fail.
const RAD = Math.PI / 180;

// The point on Earth where the sun is straight overhead at this moment, in degrees.
export function sunOverhead(at: Date): { lat: number; lon: number } {
  const year = at.getUTCFullYear();
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const dayOfYear = Math.floor(
    (at.getTime() - Date.UTC(year, 0, 1)) / 86_400_000,
  );
  const hours =
    at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / days) * (dayOfYear + (hours - 12) / 24);
  // How far the sun runs ahead of or behind the clock, in minutes.
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  // Noon by the sun is where the solar time is 12:00.
  const lon = -15 * (hours - 12 + equation / 60);
  return { lat: declination / RAD, lon: ((lon + 540) % 360) - 180 };
}

// The lit half of the world as a path on the map (x = longitude + 180, y = 84 - latitude, 360 by 144).
// The line between day and night is where the sun is on the horizon: tan(lat) = -cos(h) / tan(declination).
export function daylightPath(at: Date): string {
  const sun = sunOverhead(at);
  // At the equinox the declination is 0 and the line is straight up and down; a tiny tilt keeps the maths
  // working.
  const tilt = Math.tan((Math.abs(sun.lat) < 0.01 ? 0.01 : sun.lat) * RAD);
  const points: string[] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const lat = Math.atan(-Math.cos((lon - sun.lon) * RAD) / tilt) / RAD;
    const y = Math.min(146, Math.max(-2, 84 - lat));
    points.push(`${lon + 180} ${y.toFixed(1)}`);
  }
  // In the northern summer the North Pole has the sun all day, so the lit side closes along the top edge.
  const edge = sun.lat > 0 ? -2 : 146;
  return `M0 ${edge}L${points.join("L")}L360 ${edge}Z`;
}
