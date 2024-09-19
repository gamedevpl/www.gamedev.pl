class DesignerUnit {
    constructor(field, col, row, sizeCol, sizeRow, type, command) {
        this.field = field;

        this.el = document.createElement('div');

        this.setFormation(sizeCol, sizeRow);
        this.el.className = "field-unit";
        this.el.designerUnit = this;

        this.field.appendChild(this.el);

        this.setType(type);
        this.setPosition(col, row);
        this.setCommand(command);
    }

    getDefinition() {
        return {
            "sizeCol": this["sizeCol"],
            "sizeRow": this["sizeRow"],
            "col": this["col"],
            "row": this["row"],
            "type": this["type"],
            "command": this["command"]
        }
    }

    setFormation(sizeCol, sizeRow) {
        this["sizeCol"] = sizeCol;
        this["sizeRow"] = sizeRow;
        this.el.style.width = this["sizeCol"] * SOLDIER_WIDTH + "px";
        this.el.style.height = this["sizeRow"] * SOLDIER_HEIGHT + "px";
    }

    setType(type) {
        this["type"] = type;
        this.el.dataset["unitType"] = type;
    }

    setCommand(command) {
        this["command"] = command;
        this.el.dataset["command"] = command;
    }

    updatePosition() {
        this.el.style.left = this["col"] * SOLDIER_WIDTH + "px";
        this.el.style.top = this["row"] * SOLDIER_HEIGHT + "px";
    }

    setPosition(col, row) {
        this["col"] = Math.max(0, Math.min(col, MAX_COL - this["sizeCol"]));
        this["row"] = Math.max(0, Math.min(row, MAX_ROW - this["sizeRow"]));

        this.updatePosition();
    }

    startDrag() {
        this.field.classList.add("drag");
        this.el.classList.add("drag");
    }

    stopDrag() {
        this.field.classList.remove("drag");
        this.el.classList.remove("drag");
    }

    select() {
        this.el.classList.add("select");
        this.field.classList.add("select");
    }

    deselect() {
        this.el.classList.remove("select");
        this.field.classList.remove("select");
    }
};

DesignerUnit.of = (field, def) => new DesignerUnit(field, def["col"], def["row"], def["sizeCol"], def["sizeRow"], def["type"], def["command"]);

DesignerUnit.types = {
    // name -> index
    "archer": 1,
    "warrior": 2,
    "tank": 3,
    "artillery": 4,
    // index -> name
    1: "archer",
    2: "warrior",
    3: "tank",
    4: "artillery"
};

DesignerUnit.commands = {
    // name -> index
    "wait-advance": 1,
    "advance": 2,
    "advance-wait": 3,
    "flank-left": 4,
    "flank-right": 5,
    // index -> name
    1: "wait-advance",
    2: "advance",
    3: "advance-wait",
    4: "flank-left",
    5: "flank-right"
};
