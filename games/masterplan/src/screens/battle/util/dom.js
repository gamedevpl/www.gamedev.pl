export function $(selector, scope) {
  return $$(selector, scope)[0];
}

export function $$(selector, scope) {
  return (scope || document.body).querySelectorAll(selector);
}
