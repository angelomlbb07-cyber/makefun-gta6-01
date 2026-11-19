// SOLMAR keys — keyboard + mouse input, kept apart from game logic so
// the same state can be driven by staging code or tests.

export function attachInput(G, canvas) {
  const down = (e) => {
    G.keys[e.code] = true;
    // Edge queue: a quick tap can go down AND up between two animation
    // frames, so the keydown itself records the press (with its time).
    if (!e.repeat) {
      G._pressed = G._pressed || {};
      G._pressed[e.code] = performance.now();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyM') G.radioOn = !G.radioOn;
  };
  const up = (e) => {
    G.keys[e.code] = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => {
    G.keys = {};
    G.mouse.down = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    G.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    G.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouse.down = true;
    canvas.focus();
  });
  window.addEventListener('mouseup', () => {
    G.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function pressed(G, ...codes) {
  return codes.some((c) => G.keys[c]);
}

// Edge-triggered key: true only on the first frame that reads the press.
// Reads the keydown queue, not the held state, so short taps are seen.
// Consuming deletes the entry, so one press fires exactly once.
export function tap(G, code) {
  if (!G._pressed || G._pressed[code] === undefined) return false;
  delete G._pressed[code];
  return true;
}

export function releaseTaps(G) {
  // Drop presses nobody consumed within 100 ms: a stale press must
  // never fire later in a different mode (e.g. Escape on the title
  // screen pausing the game the moment play starts).
  if (!G._pressed) return;
  const now = performance.now();
  for (const code of Object.keys(G._pressed)) {
    if (now - G._pressed[code] > 100) delete G._pressed[code];
  }
}
