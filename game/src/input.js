// Keyboard and mouse. Held keys are read every step; one-shot presses (E, F, Enter, P) are
// queued and consumed on first read, so a press between two fixed steps is never lost and
// never counted twice. Mouse clicks carry their position for the menus.

export function createInput(target) {
  const down = new Set();
  const pressedQueue = new Set();
  const mouse = { x: 0, y: 0, clicked: false, clickX: 0, clickY: 0 };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) pressedQueue.add(event.code);
    down.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.clicked = true;
    mouse.clickX = event.clientX;
    mouse.clickY = event.clientY;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });

  return {
    isDown(code) {
      return down.has(code);
    },
    /** True when any of the listed keys is held (ShiftLeft/ShiftRight, WASD aliases). */
    isDownAny(codes) {
      for (const code of codes) {
        if (down.has(code)) return true;
      }
      return false;
    },
    /** True once per physical press; the first reader consumes it. */
    pressed(code) {
      if (pressedQueue.has(code)) {
        pressedQueue.delete(code);
        return true;
      }
      return false;
    },
    /** -1, 0 or 1 from A/D or the arrow keys. */
    moveX() {
      return ((down.has('KeyD') || down.has('ArrowRight')) ? 1 : 0) - ((down.has('KeyA') || down.has('ArrowLeft')) ? 1 : 0);
    },
    /** -1, 0 or 1 from W/S or the arrow keys. */
    moveY() {
      return ((down.has('KeyS') || down.has('ArrowDown')) ? 1 : 0) - ((down.has('KeyW') || down.has('ArrowUp')) ? 1 : 0);
    },
    /** True once per click; the first reader consumes it. */
    clicked() {
      if (mouse.clicked) {
        mouse.clicked = false;
        return true;
      }
      return false;
    },
    /** Drop every queued press and click (used when the screen changes, so a gameplay key
     * never leaks into a menu and a menu key never leaks into the game). */
    clearPressed() {
      pressedQueue.clear();
      mouse.clicked = false;
    },
    clickPos() {
      return { x: mouse.clickX, y: mouse.clickY };
    },
    mousePos() {
      return { x: mouse.x, y: mouse.y };
    },
  };
}
