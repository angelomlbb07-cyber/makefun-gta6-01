// keys.js — keyboard + mouse input mapping. One job: input.
// Reads the DOM events and exposes a plain input snapshot the game loop
// consumes: { up, down, left, right, run, handbrake, shoot, punch, ... }
// plus edge-triggered `pressed` keys consumed once per frame.
import { TUNING } from './tuning.js';

export function createInput(canvas) {
  const input = {
    up: false, down: false, left: false, right: false,
    run: false, handbrake: false, shoot: false,
    pressed: {},           // edge-triggered keys, cleared each frame
    mouse: { x: 0, y: 0, down: false, worldX: 0, worldY: 0 },
  };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'handbrake',
  };

  function onKeyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    const mapped = KEYMAP[e.code];
    if (mapped) input[mapped] = true;
    if (!e.repeat) input.pressed[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }

  function onKeyUp(e) {
    const mapped = KEYMAP[e.code];
    if (mapped) input[mapped] = false;
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - rect.left;
    input.mouse.y = e.clientY - rect.top;
  }

  function onMouseDown(e) {
    if (e.button === 0) {
      input.mouse.down = true;
      input.shoot = true;
      input.pressed.MouseLeft = true;
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      input.mouse.down = false;
      input.shoot = false;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  // Convert the mouse position into world coordinates for aiming.
  input.updateMouseWorld = function updateMouseWorld(camera, scale) {
    input.mouse.worldX = camera.x + input.mouse.x / scale;
    input.mouse.worldY = camera.y + input.mouse.y / scale;
  };

  // Call once per frame after the game has read the input.
  input.endFrame = function endFrame() {
    input.pressed = {};
  };

  input.wasPressed = function wasPressed(code) {
    return !!input.pressed[code];
  };

  return input;
}

// Human-readable control list, shown on the title screen and in the HUD hint.
export const CONTROL_LIST = [
  ['WASD / Arrows', 'Move on foot · drive the car'],
  ['E', 'Enter / exit / steal a car'],
  ['Mouse + Click', 'Aim and shoot the pistol'],
  ['F', 'Punch'],
  ['Space', 'Handbrake drift (pays cash)'],
  ['Shift', 'Run on foot'],
  ['M', 'Start the next mission'],
  ['R', 'Radio on / off · next station'],
  ['P / Esc', 'Pause / back to title'],
  ['C', 'Save game (checkpoint)'],
];
