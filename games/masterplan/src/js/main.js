var lastTick = currentTime();
function updateAnimation() {
    var newTick = currentTime();
    updateState(EVENT_RAF, newTick - lastTick);
    lastTick = newTick;
    requestAnimationFrame(updateAnimation);
}

requestAnimationFrame(updateAnimation);

document.onreadystatechange = function() {
    updateState(EVENT_READYSTATE, document.readyState);
};

document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
        updateState(EVENT_DOCUMENT_HIDDEN);
    } else {
        updateState(EVENT_DOCUMENT_VISIBLE);
    }
});

window.addEventListener("hashchange", function() {
    updateState(EVENT_HASHCHANGE, document.location.hash);
});

window.addEventListener("resize", function() {
    updateState(EVENT_WINDOW_RESIZE);
});