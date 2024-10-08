export function $(selector, scope) {
  return $$(selector, scope)[0];
}

export function $$(selector, scope) {
  if (typeof document !== 'undefined') {
    return (scope || document.body).querySelectorAll(selector);
  } else {
    return [];
  }
}
