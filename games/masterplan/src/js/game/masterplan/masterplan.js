class MasterPlan {
    constructor(initialPosition, units) {
        var angle = VMath.atan2(initialPosition, [0, 0]);

        this.type = [];
        this.formation = [];
        this.plan = [];
        this.claims = {};

        units.forEach(unit => {
            var soldierCount = unit["sizeCol"] * unit["sizeRow"];
            var offset = [unit["col"] * SOLDIER_WIDTH, unit["row"] * SOLDIER_HEIGHT];
            for (var i = 0; i < soldierCount; i++) {
                var pos = [i % unit["sizeCol"] * SOLDIER_WIDTH, (i / unit["sizeCol"] << 0) * SOLDIER_HEIGHT];
                this.formation.push(VMath.add(pos, offset));
                this.type.push(unit["type"]);

                switch (unit["command"]) {
                    case "advance-wait":
                        this.plan.push([
                            new AdvanceCommand(),
                            new WaitCommand(10000),
                            new AttackCommand()
                        ]);
                        break;
                    case "advance":
                        this.plan.push([
                            new AdvanceCommand(),
                            new AttackCommand()
                        ]);
                        break;
                    case "wait-advance":
                        this.plan.push([
                            new WaitCommand(10000),
                            new AttackCommand()
                        ])
                        break;
                    case "flank-left":
                        this.plan.push([
                            new FlankLeftCommand(angle),
                            new AttackCommand()
                        ])
                        break;
                    case "flank-right":
                        this.plan.push([
                            new FlankRightCommand(angle),
                            new AttackCommand()
                        ])
                        break;

                }
            }
        });
        var center = [this.formation.reduce((r, pos) => Math.max(pos[0], r), 0) / 2, 0];

        this.formation = this.formation.map(pos => VMath.rotate(VMath.sub(pos, center), angle + Math.PI / 2));        
    }

    getSoldierCount() {
        return this.formation.length;
    }

    getType(soldierId) {
        return this.type[soldierId];
    }

    getSolderPlan(soldierId) {
        return new SoldierPlan(this, this.formation[soldierId], this.plan[soldierId]);
    }
}