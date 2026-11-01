// The finished page draws its map or sun path once. Under reduced motion it stays as it is: finished.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const step of document.querySelectorAll(
    "[data-intro] animate, [data-intro] animateMotion",
  )) {
    step.beginElement();
  }
}
