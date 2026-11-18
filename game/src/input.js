// SOLMAR — input.js
// Keyboard and mouse state for the game. Keys are tracked by code (KeyW,
// ArrowUp, Space, ...) so layouts do not matter. pressed() fires once per
// physical press, isDown() stays true while held. The mouse position is
// kept in canvas pixels and converted to an aim angle by main.js, which
// knows the camera. Nothing here touches the game state. Round 5: no input
// change — combat readability came from rendering scale and camera zoom.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    justPressed: new Set(),
    mouse: { x: 0, y: 0, down: false },
    mouseDown: false,
    aimAngle: 0,
    _canvas: canvas || null,
  };
  // Method forms of the helpers, so game modules can call input.isDown()
  // and input.pressed() directly on the object they are handed.
  input.isDown = (code) => input.keys.has(code);
  input.pressed = (code) => input.justPressed.has(code);
  if (typeof window !== 'undefined' && canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) input.justPressed.add(e.code);
      input.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      input.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      input.keys.clear();
      input.mouse.down = false;
      input.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      input.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      input.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        input.mouse.down = true;
        input.mouseDown = true;
      }
    });
    window.addEventListener('mouseup', () => {
      input.mouse.down = false;
      input.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return input;
}

export function isDown(input, code) {
  return input.keys.has(code);
}

// True once per physical key press. main.js calls endFrameInput after each
// update to clear the set, so a held key never re-triggers.
export function pressed(input, code) {
  return input.justPressed.has(code);
}

export function endFrameInput(input) {
  input.justPressed.clear();
  input.mouseDown = false;
}

// Test helper: press a key without a real keyboard event.
export function fakePress(input, code) {
  input.justPressed.add(code);
  input.keys.add(code);
}

export function fakeRelease(input, code) {
  input.keys.delete(code);
}
