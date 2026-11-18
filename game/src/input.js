// SOLMAR input: keyboard state with edge-triggered presses.
// One job: turn DOM key events into a clean per-frame query API.

const down = new Set();
const pressed = new Set();
let mouseX = 0;
let mouseY = 0;
let mouseClicked = false;

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); });
  if (canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouseX = e.clientX - r.left;
      mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', () => { mouseClicked = true; });
  }
}

export function isDown(code) { return down.has(code); }
export function wasPressed(code) { return pressed.has(code); }
export function anyPressed(codes) { return codes.some((c) => pressed.has(c)); }
export function endFrame() { pressed.clear(); mouseClicked = false; }
export function mousePos() { return { x: mouseX, y: mouseY }; }
export function wasMouseClicked() { return mouseClicked; }

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  enterCar: 'KeyE',
  handbrake: 'Space',
  nitro: 'ShiftLeft',
  shoot: 'KeyF',
  punch: 'KeyF',
  reload: 'KeyR',
  weapon: 'KeyQ',
  radio: 'KeyC',
  pause: 'KeyP',
  escape: 'Escape',
  mute: 'KeyM',
  confirm: 'Enter',
};
