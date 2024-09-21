/**
 * @returns {Number}
 */
export function currentTime() {
    return new Date().getTime();
}

export function $(selector, scope) {
    return $$(selector, scope)[0];
}

export function $$(selector, scope) {
    return (scope || document.body).querySelectorAll(selector);
}