export function stickVector(dx, dy, radius = 42) {
  const length = Math.hypot(dx, dy);
  if (!length || length < radius * .15) return { x: 0, y: 0, knobX: 0, knobY: 0 };
  const bounded = Math.min(radius, length), strength = Math.min(1, (length / radius - .15) / .85);
  return { x: dx / length * strength, y: dy / length * strength, knobX: dx / length * bounded, knobY: dy / length * bounded };
}
export function bindTouchControls(element, onMove) {
  const knob = element.querySelector('.stick-knob');
  let pointer = null;
  const clear = () => {
    pointer = null; knob.style.transform = ''; onMove(0, 0);
  };
  const move = e => {
    const rect = element.getBoundingClientRect();
    const vector = stickVector(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    knob.style.transform = `translate(${vector.knobX}px,${vector.knobY}px)`;
    onMove(vector.x, vector.y);
  };
  element.addEventListener('pointerdown', e => {
    if (pointer !== null || e.button !== 0) return;
    pointer = e.pointerId; element.setPointerCapture(pointer); e.preventDefault(); move(e);
  });
  element.addEventListener('pointermove', e => { if (e.pointerId === pointer) { e.preventDefault(); move(e); } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, e => { if (e.pointerId === pointer) clear(); });
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return clear;
}
