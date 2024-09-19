/**
 * @returns {Number}
 */
function currentTime() {
    return new Date().getTime();
}

function $(selector, scope) {
    return $$(selector, scope)[0];
}

function $$(selector, scope) {
    return (scope || document.body).querySelectorAll(selector);
}