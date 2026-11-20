// keys.js — keyboard and mouse input. One job: turn device events into a
// single input object the sim reads every frame. Edge-triggered actions
// (pressed this frame) are consumed by boot.js after each step.

export function createInput() {
  return {
    up: false, down: false, left: false, right: false,
    handbrake: false, nitro: false, run: false,
    holdE: false, shoot: false,
    aimX: 0, aimY: 0, mouseX: 0, mouseY: 0,
    pressed: {}, // key -> true for exactly one frame
    anyKey: false,
  };
}

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro',
  KeyE: 'holdE',
};

export function attachInput(input, canvas, callbacks) {
  const onKeyDown = (e) => {
    if (e.repeat) return;
    const mapped = KEYMAP[e.code];
    if (mapped) { input[mapped] = true; e.preventDefault(); }
    input.pressed[e.code] = true;
    input.anyKey = true;
    if (callbacks.onKey) callbacks.onKey(e.code);
  };
  const onKeyUp = (e) => {
    const mapped = KEYMAP[e.code];
    if (mapped) input[mapped] = false;
  };
  const onMouseMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
    if (callbacks.onMouse) callbacks.onMouse(input.mouseX, input.mouseY);
  };
  const onMouseDown = (e) => {
    if (e.button === 0) input.shoot = true;
    if (callbacks.onMouseDown) callbacks.onMouseDown(e.button);
  };
  const onMouseUp = (e) => {
    if (e.button === 0) input.shoot = false;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

// True once for the frame the key went down; boot.js clears it each step.
export function wasPressed(input, code) { return !!input.pressed[code]; }
export function clearPressed(input) { input.pressed = {}; input.anyKey = false; }
