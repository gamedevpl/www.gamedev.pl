class SoldierPlan {
    constructor(masterPlan, formation, plan) {
        this.masterPlan = masterPlan;
        this.formation = formation;
        this.plan = plan;
        this.currentCommand = null;
        this.claims = masterPlan.claims;
    }

    getPosition() {
        return this.formation;
    }

    getCommand(worldTime) {
        if ((!this.currentCommand || this.currentCommand.isDone(worldTime)) && this.plan.length > 0)  {
            this.currentCommand = this.plan.splice(0, 1)[0];
            this.currentCommand.start(worldTime);
        }
        
        if (!this.currentCommand) {
            this.currentCommand = new WaitCommand();
        }

        return this.currentCommand;
    }

    canClaim(enemy, soldier) {
        if (!this.claims[enemy.soldierId]) {
            this.claims[enemy.soldierId] = [];
        }

        if (this.claims[enemy.soldierId].length < 5) {
            return true;
        }

        var dist = soldier.distance(enemy);
        var distant = this.claims[enemy.soldierId].filter(claimer => claimer.distance(enemy) > dist);
        if (distant.length === this.claims[enemy.soldierId].length) {
            return true;
        }
    }

    unclaim(enemy, soldier) {
        var idx = this.claims[enemy.soldierId].indexOf(soldier);
        if (idx >= 0) {
            this.claims[enemy.soldierId].splice(idx, 1);
        }
    }
    claim(enemy, soldier) {
        if (!this.canClaim(enemy, soldier)) {
            return false;
        }

        this.claims[enemy.soldierId].push(soldier);

        return true;
    }
}