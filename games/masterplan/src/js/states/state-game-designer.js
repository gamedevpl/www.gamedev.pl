
function saveBattleString(defs, targetId) {
    targetId = targetId || 'battle-string';
    var iter = obj => {
        return [
            obj["sizeCol"], 
            obj["sizeRow"], 
            obj["col"], 
            obj["row"], 
            DesignerUnit.types[obj["type"]], 
            DesignerUnit.commands[obj["command"]]
        ];
    }
    var username = (defs.username || '').split('').map(ch => ch.charCodeAt(0));
    var arr = defs.map(iter).reduce((r, d) => r.concat([d.length], d), []);
    defs = new Uint8Array([arr.length].concat(arr.concat(username)));
    var decoder = new TextDecoder('utf8');
    var encoded = btoa(decoder.decode(defs));
    document.getElementById(targetId).value = encoded;
    try {
        localStorage[targetId] = encoded;
    } catch(e) {

    }
    $('#sharelink').value="http://gtanczyk.warsztat.io/masterplan/index.html#vs="+encoded;
}

function loadBattleString(targetId, value) {
    var encoder = new TextEncoder('utf8');
    var defs = encoder.encode((atob(value || document.getElementById(targetId || 'battle-string').value)));
    var result = [];
    var length = defs[0];
    for (var i = 1; i <= length;) {
        var l = defs[i];
        var v = defs.slice(i + 1, i + l + 1);
        result.push({
            "sizeCol": v[0], 
            "sizeRow": v[1], 
            "col": v[2], 
            "row": v[3], 
            "type": DesignerUnit.types[v[4]], 
            "command": DesignerUnit.commands[v[5]]  
        });
        i += l + 1;
    }

    var username = Array["from"](defs.slice(length+1));
    result.username = (username.map(ch => String.fromCharCode(ch)).join('').match(/(\w)+/g) || []).join("");
    
    return result;
}
    
function stateGameDesigner(definitions, enemyDefinitions) {
    var stored;
    try {
        stored = localStorage["battle-string"];        
    } catch(e) {

    }
    if (!definitions && stored) {
        definitions = loadBattleString(null, stored);
        $('#username').value = definitions.username;
    } else if (!definitions) {
        definitions = DEFAULT_UNITS();
        $('#username').value = definitions.username = 'Bonaparte' + (1000 * Math.random() << 0);
    }

    var designer = document.getElementById("game-designer");
    designer.classList.add("visible");

    var field = document.getElementById("designer-field");
    field.style.width = DESIGN_FIELD_WIDTH + 'px';
    field.style.height = DESIGN_FIELD_HEIGHT + 'px';
    field.innerHTML = '';

    var units = definitions.map(def => DesignerUnit.of(field, def));

    var mouseDownUnit;
    var clickUnit;

    function getDefs() {
        var defs = units.map(unit => unit.getDefinition());
        defs.username = localStorage["username"];
        return defs;
    }

    saveBattleString(definitions);
    saveBattleString(enemyDefinitions || DEFAULT_UNITS(), 'test-battle-string');

    if (enemyDefinitions && enemyDefinitions.username) {
        $('#battle-versus').innerHTML = `Opened a link from <a href="https://twitter.com/${enemyDefinitions.username + '">' + enemyDefinitions.username}</a>, and you will battle their masterplan! <button id="vs-reset">Click to reset</button><br/><br/>
        <button id="button-test-battle">Play the battle</button>`;
    }

    return function stateGameDesignerHandler(eventType, eventObject) {
        if (eventType === EVENT_MOUSE_DOWN && eventObject.target.classList.contains("field-unit")) {
            mouseDownUnit = eventObject.target.designerUnit;
        }

        if (eventType === EVENT_MOUSE_UP && mouseDownUnit) {
            mouseDownUnit.stopDrag();
            mouseDownUnit = null;
        }

        if (eventType === EVENT_MOUSE_MOVE && mouseDownUnit && eventObject.target.designerUnit === mouseDownUnit) {
            mouseDownUnit.startDrag();
        }

        if (eventType === EVENT_MOUSE_MOVE && mouseDownUnit && eventObject.target === field) {
            mouseDownUnit.setPosition(eventObject.offsetX / SOLDIER_WIDTH << 0, eventObject.offsetY / SOLDIER_HEIGHT << 0);
            saveBattleString(getDefs());
        }

        if (eventType === EVENT_MOUSE_DOWN && eventObject.target.id === "button-test-battle") {
            designer.classList.remove("visible");
            return stateGameBattleInit(getDefs(), loadBattleString('test-battle-string'));
        }

        if (eventType === EVENT_MOUSE_UP && clickUnit && field.contains(eventObject.target)) {
            clickUnit.deselect();
            clickUnit = null;
        }

        if (eventType === EVENT_MOUSE_UP && eventObject.target.classList.contains("field-unit")) {
            clickUnit = eventObject.target.designerUnit;
            clickUnit.select();
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.classList.contains("formation-button") && clickUnit) {
            var size = eventObject.target.dataset["formation"].split("x");
            clickUnit.setFormation(size[0], size[1]);
            saveBattleString(getDefs());
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.dataset["unitType"] && clickUnit) {
            clickUnit.setType(eventObject.target.dataset["unitType"]);
            saveBattleString(getDefs());
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.dataset["command"] && clickUnit) {
            clickUnit.setCommand(eventObject.target.dataset["command"]);
            saveBattleString(getDefs());
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.id === "tweet") {
            window.open("https://twitter.com/home?status="+encodeURIComponent(`#masterplan_js13k ${$('#sharelink').value}`));
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.id === "email") {
            location.href= `mailto:${document.querySelector('[type=email').value}?subject=${'Check my MasterPlan'}&body=${$('#sharelink').value}`;
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.id === "battle-string-load") {
            return new stateGameDesigner(loadBattleString());
        }

        if (eventType === EVENT_MOUSE_CLICK && eventObject.target.id === "vs-reset") {
            location.hash = '';
            location.reload();
        }

        if (eventType === EVENT_KEY_UP && eventObject.target.id === "username") {
            localStorage["username"] = eventObject.target.value;
            saveBattleString(getDefs());
        }
    };
}