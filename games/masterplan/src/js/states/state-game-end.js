/**
 * @param {GameWorld} world
 * @param {Race} race
 * @param {BoatObject} boat
 * @param {GameHUD} HUD 
 * @constructor
 */
function stateGameEnd(world, race, boat, HUD) {
    var CLASS = "game-end";
    
    document.body.classList.add(CLASS);
    
    return function GameEndHandler(eventType) {
        renderGame(world, race, boat);
        HUD.render(GAME_STATE_END);
        
        if (eventType == EVENT_ESCAPE || eventType == EVENT_HASHCHANGE && eventObject == "") {
            document.body.classList.remove(CLASS);
            
            world.destroy();
            HUD.destroy();

            return new stateIntro();
        }
    }.State();
};