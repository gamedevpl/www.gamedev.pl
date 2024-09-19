/**
 * @constructor
 */
var stateIntro = function Intro() {
    var gameIntro = $('#game-intro');
    gameIntro.classList.add('visible');

    var hints = [
        "Protect your archers.",
        "Tanks in first line.",
        "Send warriors later.",
        "Don't spread too thin",
        "Kill archers quickly.",
        "Warriors are good for flanking.",
        "Support warriors with archers.",
        "Archers are effective against stationary opponents.",
        "All units are most vulnerable when hit from behind.",
        "Surround enemy tanks."
    ];

    $('#hint').innerHTML = "<b>Hint:</b> " + hints[Math.random() * hints.length << 0];
    
    return function IntroHandler(eventType, eventObject) {
        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.tagName === 'BUTTON') {
            gameIntro.classList.remove('visible');
            return new stateGameDesigner();
        }
    }.State();
};
