/**
 * @param {GameWorld} world
 * @param {Race} race
 * @param {BoatObject} boat
 * @param {GameHUD} HUD 
 * @constructor
 */
function stateGamePlay(world, race, boat, HUD) {
    return function GamePlayHandler(eventType, eventObject) {
        if (eventType == EVENT_RAF) {
            var elapsedTime = eventObject;
            while (elapsedTime > 0) {
                elapsedTime = world.update(elapsedTime);
                race.update();
            }

            renderGame(world, race, boat);
            HUD.render(GAME_STATE_PLAY);
        }
        
        if (eventType == EVENT_ARROW_LEFT_DOWN) {
            boat.turnLeft();
            HUD.highlightTouch(true, false);
        }
        if (eventType == EVENT_ARROW_RIGHT_DOWN) {
            boat.turnRight();
            HUD.highlightTouch(false, true);
        }
        if (eventType == EVENT_ARROW_UP_DOWN || eventType == EVENT_ARROW_DOWN_UP) {
            boat.moveForward();
        }
        if (eventType == EVENT_ARROW_DOWN_DOWN) {
            boat.moveBackwards();
        }
        if (eventType == EVENT_ARROW_LEFT_UP || eventType == EVENT_ARROW_RIGHT_UP) {
            boat.straight();
            HUD.highlightTouch();
        }
        
        if (eventType == EVENT_RACE_OVER) {
            return new stateGameEnd(world, race, boat, HUD);
        }
        
        if (eventType == EVENT_ESCAPE || eventType == EVENT_DOCUMENT_HIDDEN) {
            return new stateGamePause(world, race, boat, HUD);
        }
        
        if (eventType == EVENT_HASHCHANGE && eventObject == "") {
            world.destroy();
            HUD.destroy();

            return new stateIntro();
        }
    }.State();
};