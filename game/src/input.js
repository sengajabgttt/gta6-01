// Keyboard and mouse input. Held keys give movement and driving directions;
// one-shot presses (confirm, pause, enter/exit, punch, reload, mute) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse position is exposed
// in screen pixels; the loop converts it to world coordinates for aiming.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const MOVE = {
  up: new Set(['KeyW', 'ArrowUp']),
  down: new Set(['KeyS', 'ArrowDown']),
  left: new Set(['KeyA', 'ArrowLeft']),
  right: new Set(['KeyD', 'ArrowRight']),
};
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false };
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let actions = 0;

  function setMove(code, value) {
    for (const [name, keys] of Object.entries(MOVE)) {
      if (keys.has(code)) held[name] = value;
    }
    if (SPRINT.has(code)) held.sprint = value;
    if (HANDBRAKE.has(code)) held.handbrake = value;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (MOVE.up.has(event.code) || MOVE.down.has(event.code) || MOVE.left.has(event.code) || MOVE.right.has(event.code)) event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    setMove(event.code, true);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    setMove(event.code, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Movement for the current frame: -1..1 on each axis, plus driving flags. */
    move() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        up: held.up,
        down: held.down,
        left: held.left,
        right: held.right,
        sprint: held.sprint,
        handbrake: held.handbrake,
      };
    },
    /** The mouse position in canvas pixels. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** Whether the mouse button is currently held (fires the gun while held). */
    shooting() {
      return mouseDown;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
