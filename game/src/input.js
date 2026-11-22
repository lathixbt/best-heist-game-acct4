// Keyboard input -> world input object. Arrow keys + WASD, gaits, gadget keys.
export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered keys, consumed once per frame
  let mouse = { x: 0, y: 0 };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) pressed.add(e.key.toLowerCase());
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });

  function dir() {
    return {
      up: keys.has('w') || keys.has('arrowup'),
      down: keys.has('s') || keys.has('arrowdown'),
      left: keys.has('a') || keys.has('arrowleft'),
      right: keys.has('d') || keys.has('arrowright'),
      sneak: keys.has('control') || keys.has('c'),
      sprint: keys.has(' ') || keys.has('shift'),
    };
  }

  return {
    keys, mouse,
    // Build the per-frame world input. Gadget keys are edge-triggered.
    readWorldInput(canvas) {
      const d = dir();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
      const mx = (mouse.x - rect.left) * scaleX, my = (mouse.y - rect.top) * scaleY;
      const out = {
        ...d,
        throwCoin: pressed.has('q'), throwX: mx, throwY: my,
        smoke: pressed.has('e'), douse: pressed.has('r'), flash: pressed.has('f'),
      };
      return out;
    },
    wasPressed(k) { return pressed.has(k.toLowerCase()); },
    endFrame() { pressed.clear(); },
  };
}
