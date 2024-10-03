class DarkHeresyActor extends Actor {

    async _preCreate(data, options, user) {

        let initData = {
            "prototypeToken.bar1": { attribute: "wounds" },
            "prototypeToken.bar2": { attribute: "fate" },
            "prototypeToken.name": data.name,
            "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER

        };
        if (data.type === "acolyte") {
            initData["prototypeToken.actorLink"] = true;
            initData["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        }
        this.updateSource(initData);
    }

    prepareData() {
        super.prepareData();
        this._computeCharacteristics();
        this._computeSkills();
        this._computeItems();
        this._computeExperience();
        this._computeArmour();
        this._computeMovement();
    }

    _computeCharacteristics() {
        let middle = Object.values(this.characteristics).length / 2;
        let i = 0;
        for (let characteristic of Object.values(this.characteristics)) {
            characteristic.total = characteristic.base + characteristic.advance;
            characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
            if (this.fatigue.value > characteristic.bonus) {
                characteristic.total = Math.ceil(characteristic.total / 2);
                characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
            }
            characteristic.isLeft = i < middle;
            characteristic.isRight = i >= middle;
            characteristic.advanceCharacteristic = this._getAdvanceCharacteristic(characteristic.advance);
            i++;
        }
        this.system.insanityBonus = Math.floor(this.insanity / 10);
        this.system.corruptionBonus = Math.floor(this.corruption / 10);
        this.psy.currentRating = this.psy.rating - this.psy.sustained;
        this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus;
        // Done as variables to make it easier to read & understand
        let tb = Math.floor(
            (this.characteristics.toughness.base
        + this.characteristics.toughness.advance) / 10);

        let wb = Math.floor(
            (this.characteristics.willpower.base
        + this.characteristics.willpower.advance) / 10);

        // The only thing not affected by itself
        this.fatigue.max = tb + wb;

    }

    _computeSkills() {
        for (let skill of Object.values(this.skills)) {
            let short = skill.characteristics[0];
            let characteristic = this._findCharacteristic(short);
            skill.total = characteristic.total + skill.advance;
            skill.advanceSkill = this._getAdvanceSkill(skill.advance);
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    speciality.total = characteristic.total + speciality.advance;
                    speciality.isKnown = speciality.advance >= 0;
                    speciality.advanceSpec = this._getAdvanceSkill(speciality.advance);
                }
            }
        }
    }

    _computeItems() {
        let encumbrance = 0;
        for (let item of this.items) {

            if (item.weight) {
                encumbrance = encumbrance + (item.quantity ? item.weightSum : item.weight);
            }
        }
        this._computeEncumbrance(encumbrance);
    }

    _computeExperience_auto() {
        let config = game.darkHeresy.config;
        let characterAptitudes = this.items.filter(it => it.isAptitude).map(it => it.name.trim());
        if (!characterAptitudes.includes("General")) characterAptitudes.push("General");
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        if (this.experience.spentOther == null) this.experience.spentOther = 0;
        this.experience.spentPsychicPowers = 0;
        let psyRatingCost = Math.max(0, ((this.psy.rating * (this.psy.rating + 1) /2) - 1) * 200); // N*(n+1)/2 equals 1+2+3... -1 because we start paying from 2

        this.psy.cost = this.experience.spentPsychicPowers = psyRatingCost;
        for (let characteristic of Object.values(this.characteristics)) {
            let matchedAptitudes = characterAptitudes.filter(it => characteristic.aptitudes.includes(it)).length;
            let cost = 0;
            for (let i = 0; i <= characteristic.advance / 5 && i <= config.characteristicCosts.length; i++) {
                cost += config.characteristicCosts[i][2 - matchedAptitudes];
            }
            characteristic.cost = cost.toString();
            this.experience.spentCharacteristics += cost;
        }
        for (let skill of Object.values(this.skills)) {
            let matchedAptitudes = characterAptitudes.filter(it => skill.aptitudes.includes(it)).length;
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    let cost = 0;
                    for (let i = (speciality.starter ? 1 : 0); i <= speciality.advance / 10; i++) {
                        cost += (i + 1) * (3 - matchedAptitudes) * 100;
                    }
                    speciality.cost = cost;
                    this.experience.spentSkills += cost;
                }
            } else {
                let cost = 0;
                for (let i = (skill.starter ? 1 : 0); i <= skill.advance / 10; i++) {
                    cost += (i + 1) * (3 - matchedAptitudes) * 100;
                }
                skill.cost = cost;
                this.experience.spentSkills += cost;
            }
        }
        for (let item of this.items.filter(it => it.isTalent || it.isPsychicPower)) {
            if (item.isTalent) {
                let talentAptitudes = item.aptitudes.split(",").map(it => it.trim());
                let matchedAptitudes = characterAptitudes.filter(it => talentAptitudes.includes(it)).length;
                let cost = 0;
                let tier = parseInt(item.tier);
                if (!item.system.starter && tier >= 1 && tier <= 3) {
                    cost = config.talentCosts[tier - 1][2 - matchedAptitudes];
                }
                item.system.cost = cost.toString();
                this.experience.spentTalents += cost;
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            }
        }
        this.experience.totalSpent = this.experience.spentCharacteristics
      + this.experience.spentSkills
      + this.experience.spentTalents
      + this.experience.spentPsychicPowers
      + this.experience.spentOther;
        this.experience.remaining = this.experience.value - this.experience.totalSpent;
    }

    _computeExperience_normal() {
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        if (this.experience.spentOther == null) this.experience.spentOther = 0;
        this.experience.spentPsychicPowers = this.psy.cost;
        for (let characteristic of Object.values(this.characteristics)) {
            this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
        }
        for (let skill of Object.values(this.skills)) {
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    this.experience.spentSkills += parseInt(speciality.cost, 10);
                }
            } else {
                this.experience.spentSkills += parseInt(skill.cost, 10);
            }
        }
        for (let item of this.items) {
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(item.cost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            }
        }
        this.experience.totalSpent = this.experience.spentCharacteristics
      + this.experience.spentSkills
      + this.experience.spentTalents
      + this.experience.spentPsychicPowers
      + this.experience.spentOther;
        this.experience.remaining = this.experience.value - this.experience.totalSpent;
    }

    _computeExperience() {
        if (game.settings.get("liber-imperium", "autoCalcXPCosts")) this._computeExperience_auto();
        else this._computeExperience_normal();
    }

    _computeArmour() {
        let locations = Object.keys(game.darkHeresy.config.hitLocations);
        let toughness = this.characteristics.toughness;

        this.system.armour = locations
            .reduce((accumulator, location) =>
                Object.assign(accumulator,
                    {
                        [location]: {
                            total: toughness.bonus,
                            toughnessBonus: toughness.bonus,
                            value: 0
                        }
                    }), {});

        // Object for storing the max armour
        let maxArmour = locations
            .reduce((acc, location) =>
                Object.assign(acc, { [location]: 0 }), {});

        // For each item, find the maximum armour val per location
        this.items
            .filter(item => item.isArmour && !item.isAdditive)
            .reduce((acc, armour) => {
                locations.forEach(location => {
                    let armourVal = armour.part[location] || 0;
                    if (armourVal > acc[location]) {
                        acc[location] = armourVal;
                    }
                });
                return acc;
            }, maxArmour);

        this.items
            .filter(item => item.isArmour && item.isAdditive)
            .forEach(armour => {
                locations.forEach(location => {
                    let armourVal = armour.part[location] || 0;
                    maxArmour[location] += armourVal;
                });
            });

        this.armour.head.value = maxArmour.head;
        this.armour.leftArm.value = maxArmour.leftArm;
        this.armour.rightArm.value = maxArmour.rightArm;
        this.armour.body.value = maxArmour.body;
        this.armour.leftLeg.value = maxArmour.leftLeg;
        this.armour.rightLeg.value = maxArmour.rightLeg;

        this.armour.head.total += this.armour.head.value;
        this.armour.leftArm.total += this.armour.leftArm.value;
        this.armour.rightArm.total += this.armour.rightArm.value;
        this.armour.body.total += this.armour.body.value;
        this.armour.leftLeg.total += this.armour.leftLeg.value;
        this.armour.rightLeg.total += this.armour.rightLeg.value;
    }

    _computeMovement() {
        let agility = this.characteristics.agility;
        let size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6
        };
    }

    _findCharacteristic(short) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    _computeEncumbrance(encumbrance) {
        const attributeBonus = this.characteristics.strength.bonus + this.characteristics.toughness.bonus;
        this.system.encumbrance = {
            max: 0,
            value: encumbrance
        };
        switch (attributeBonus) {
            case 0:
                this.encumbrance.max = 0.9;
                break;
            case 1:
                this.encumbrance.max = 2.25;
                break;
            case 2:
                this.encumbrance.max = 4.5;
                break;
            case 3:
                this.encumbrance.max = 9;
                break;
            case 4:
                this.encumbrance.max = 18;
                break;
            case 5:
                this.encumbrance.max = 27;
                break;
            case 6:
                this.encumbrance.max = 36;
                break;
            case 7:
                this.encumbrance.max = 45;
                break;
            case 8:
                this.encumbrance.max = 56;
                break;
            case 9:
                this.encumbrance.max = 67;
                break;
            case 10:
                this.encumbrance.max = 78;
                break;
            case 11:
                this.encumbrance.max = 90;
                break;
            case 12:
                this.encumbrance.max = 112;
                break;
            case 13:
                this.encumbrance.max = 225;
                break;
            case 14:
                this.encumbrance.max = 337;
                break;
            case 15:
                this.encumbrance.max = 450;
                break;
            case 16:
                this.encumbrance.max = 675;
                break;
            case 17:
                this.encumbrance.max = 900;
                break;
            case 18:
                this.encumbrance.max = 1350;
                break;
            case 19:
                this.encumbrance.max = 1800;
                break;
            case 20:
                this.encumbrance.max = 2250;
                break;
            default:
                this.encumbrance.max = 2250;
                break;
        }
    }


    _getAdvanceCharacteristic(characteristic) {
        switch (characteristic || 0) {
            case 0:
                return "N";
            case 5:
                return "S";
            case 10:
                return "I";
            case 15:
                return "T";
            case 20:
                return "P";
            case 25:
                return "E";
            default:
                return "N";
        }
    }

    _getAdvanceSkill(skill) {
        switch (skill || 0) {
            case -20:
                return "U";
            case 0:
                return "K";
            case 10:
                return "T";
            case 20:
                return "E";
            case 30:
                return "V";
            default:
                return "U";
        }
    }

    /**
     * Apply wounds to the actor, takes into account the armour value
     * and the area of the hit.
     * @param {object[]} damages            Array of damage objects to apply to the Actor
     * @param {number} damages.amount       An amount of damage to sustain
     * @param {string} damages.location     Localised location of the body part taking damage
     * @param {number} damages.penetration  Amount of penetration from the attack
     * @param {string} damages.type         Type of damage
     * @param {number} damages.righteousFury Amount rolled on the righteous fury die, defaults to 0
     * @returns {Promise<Actor>}             A Promise which resolves once the damage has been applied
     */
    async applyDamage(damages) {
        let wounds = this.wounds.value;
        let criticalWounds = this.wounds.critical;
        const damageTaken = [];
        const maxWounds = this.wounds.max;

        // Apply damage from multiple hits
        for (const damage of damages) {
            // Get the armour for the location and minus penetration, no negatives
            let armour = Math.max(this._getArmour(damage.location) - Number(damage.penetration), 0);
            // Reduce damage by toughness bonus
            const damageMinusToughness = Math.max(
                Number(damage.amount) - this.system.characteristics.toughness.bonus, 0
            );

            // Calculate wounds to add, reducing damage by armour after pen
            let woundsToAdd = Math.max(damageMinusToughness - armour, 0);

            // If no wounds inflicted and righteous fury was rolled, attack causes one wound
            if (damage.righteousFury && woundsToAdd === 0) {
                woundsToAdd = 1;
            } else if (damage.righteousFury) {
                // Roll on crit table but don't add critical wounds
                this._recordDamage(damageTaken, damage.righteousFury, damage, "Critical Effect (RF)");
            }

            // Check for critical wounds
            if (wounds === maxWounds) {
                // All new wounds are critical
                criticalWounds += woundsToAdd;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");

            } else if (wounds + woundsToAdd > maxWounds) {
                // Will bring wounds to max and add left overs as crits
                this._recordDamage(damageTaken, maxWounds - wounds, damage, "Wounds");

                woundsToAdd = (wounds + woundsToAdd) - maxWounds;
                criticalWounds += woundsToAdd;
                wounds = maxWounds;
                this._recordDamage(damageTaken, woundsToAdd, damage, "Critical");
            } else {
                this._recordDamage(damageTaken, woundsToAdd, damage, "Wounds");
                wounds += woundsToAdd;
            }
        }

        // Update the Actor
        const updates = {
            "system.wounds.value": wounds,
            "system.wounds.critical": criticalWounds
        };

        // Delegate damage application to a hook
        const allowed = Hooks.call("modifyTokenAttribute", {
            attribute: "wounds.value",
            value: this.wounds.value,
            isDelta: false,
            isBar: true
        }, updates);

        await this._showCritMessage(damageTaken, this.name, wounds, criticalWounds);
        return allowed !== false ? this.update(updates) : this;
    }

    /**
     * Records damage to be shown as in chat
     * @param {object[]} damageRolls array to record damages
     * @param {number} damageRolls.damage amount of damage dealt
     * @param {string} damageRolls.source source of the damage e.g. Critical
     * @param {string} damageRolls.location location taking the damage
     * @param {string} damageRolls.type type of the damage
     * @param {number} damage amount of damage dealt
     * @param {object} damageObject damage object containing location and type
     * @param {string} damageObject.location damage location
     * @param {string} damageObject.type damage type
     * @param {string} source source of the damage
     */
    _recordDamage(damageRolls, damage, damageObject, source) {
        damageRolls.push({
            damage,
            source,
            location: damageObject.location,
            type: damageObject.type
        });
    }

    /**
     * Gets the armour value not including toughness bonus for a non-localized location string
     * @param {string} location
     * @returns {number} armour value for the location
     */
    _getArmour(location) {
        switch (location) {
            case "ARMOUR.HEAD":
                return this.armour.head.value;
            case "ARMOUR.LEFT_ARM":
                return this.armour.leftArm.value;
            case "ARMOUR.RIGHT_ARM":
                return this.armour.rightArm.value;
            case "ARMOUR.BODY":
                return this.armour.body.value;
            case "ARMOUR.LEFT_LEG":
                return this.armour.leftLeg.value;
            case "ARMOUR.RIGHT_LEG":
                return this.armour.rightLeg.value;
            default:
                return 0;
        }
    }

    /**
     * Helper to show that an effect from the critical table needs to be applied.
     * TODO: This needs styling, rewording and ideally would roll on the crit tables for you
     * @param {object[]} rolls Array of critical rolls
     * @param {number} rolls.damage Damage applied
     * @param {string} rolls.type Letter representing the damage type
     * @param {string} rolls.source What kind of damage represented
     * @param {string} rolls.location Where this damage applied against for armor and AP considerations
     * @param {number} target
     * @param {number} totalWounds
     * @param {number} totalCritWounds
     */
    async _showCritMessage(rolls, target, totalWounds, totalCritWounds) {
        if (rolls.length === 0) return;
        const html = await renderTemplate("systems/liber-imperium/template/chat/critical.hbs", {
            rolls,
            target,
            totalWounds,
            totalCritWounds
        });
        ChatMessage.create({ content: html });
    }

    get attributeBoni() {
        let boni = [];
        for (let characteristic of Object.values(this.characteristics)) {
            boni.push({ regex: new RegExp(`${characteristic.short}B`, "gi"), value: characteristic.bonus });
        }
        return boni;
    }

    get characteristics() {return this.system.characteristics;}

    get skills() { return this.system.skills; }

    get initiative() { return this.system.initiative; }

    get wounds() { return this.system.wounds; }

    get fatigue() { return this.system.fatigue; }

    get fate() { return this.system.fate; }

    get psy() { return this.system.psy; }

    get bio() { return this.system.bio; }

    get experience() { return this.system.experience; }

    get insanity() { return this.system.insanity; }

    get corruption() { return this.system.corruption; }

    get aptitudes() { return this.system.aptitudes; }

    get size() { return this.system.size; }

    get faction() { return this.system.faction; }

    get subfaction() { return this.system.subfaction; }

    get subtype() { return this.system.type; }

    get threatLevel() { return this.system.threatLevel; }

    get armour() { return this.system.armour; }

    get encumbrance() { return this.system.encumbrance; }

    get movement() { return this.system.movement; }

}

class DarkHeresyItem extends Item {
    async sendToChat() {
        const item = new CONFIG.Item.documentClass(this._source);
        const html = await renderTemplate("systems/liber-imperium/template/chat/item.hbs", {item, data: item.system});
        const chatData = {
            user: game.user.id,
            rollMode: game.settings.get("core", "rollMode"),
            content: html
        };
        if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients("GM");
        } else if (chatData.rollMode === "selfroll") {
            chatData.whisper = [game.user];
        }
        ChatMessage.create(chatData);
    }

    get Clip() { return `${this.clip.value}/${this.clip.max}`; }

    get RateOfFire() {
        let rof = this.rateOfFire;
        let single = rof.single > 0 ? "S" : "-";
        let burst = rof.burst > 0 ? `${rof.burst}` : "-";
        let full = rof.full > 0 ? `${rof.full}` : "-";
        return `${single}/${burst}/${full}`;
    }

    get DamageTypeShort() {
        switch (this.damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY_SHORT");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING_SHORT");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE_SHORT");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
        }
    }

    get DamageType() {
        switch (this.damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
        }
    }

    get WeaponClass() {

        switch (this.class) {
            case "melee":
                return game.i18n.localize("WEAPON.MELEE");
            case "thrown":
                return game.i18n.localize("WEAPON.THROWN");
            case "launched":
                return game.i18n.localize("WEAPON.LAUNCHED");
            case "placed":
                return game.i18n.localize("WEAPON.PLACED");
            case "pistol":
                return game.i18n.localize("WEAPON.PISTOL");
            case "basic":
                return game.i18n.localize("WEAPON.BASIC");
            case "heavy":
                return game.i18n.localize("WEAPON.HEAVY");
            case "vehicle":
                return game.i18n.localize("WEAPON.VEHICLE");
            default:
                return game.i18n.localize("WEAPON.MELEE");
        }
    }

    get WeaponType() {

        switch (this.subtype) {
            case "las":
                return game.i18n.localize("WEAPON.LAS");
            case "solidprojectile":
                return game.i18n.localize("WEAPON.SOLIDPROJECTILE");
            case "bolt":
                return game.i18n.localize("WEAPON.BOLT");
            case "melta":
                return game.i18n.localize("WEAPON.MELTA");
            case "plasma":
                return game.i18n.localize("WEAPON.PLASMA");
            case "flame":
                return game.i18n.localize("WEAPON.FLAME");
            case "lowtech":
                return game.i18n.localize("WEAPON.LOWTECH");
            case "launcher":
                return game.i18n.localize("WEAPON.LAUNCHER");
            case "explosive":
                return game.i18n.localize("WEAPON.EXPLOSIVE");
            case "exotic":
                return game.i18n.localize("WEAPON.EXOTIC");
            case "chain":
                return game.i18n.localize("WEAPON.CHAIN");
            case "power":
                return game.i18n.localize("WEAPON.POWER");
            case "shock":
                return game.i18n.localize("WEAPON.SHOCK");
            case "force":
                return game.i18n.localize("WEAPON.FORCE");
            default: return "";
        }
    }

    get Craftsmanship() {
        switch (this.craftsmanship) {
            case "poor":
                return game.i18n.localize("CRAFTSMANSHIP.POOR");
            case "common":
                return game.i18n.localize("CRAFTSMANSHIP.COMMON");
            case "good":
                return game.i18n.localize("CRAFTSMANSHIP.GOOD");
            case "best":
                return game.i18n.localize("CRAFTSMANSHIP.BEST");
            default:
                return game.i18n.localize("CRAFTSMANSHIP.COMMON");
        }
    }

    get Availability() {
        switch (this.availability) {
            case "ubiquitous":
                return game.i18n.localize("AVAILABILITY.UBIQUITOUS");
            case "abundant":
                return game.i18n.localize("AVAILABILITY.ABUNDANT");
            case "plentiful":
                return game.i18n.localize("AVAILABILITY.PLENTIFUL");
            case "common":
                return game.i18n.localize("AVAILABILITY.COMMON");
            case "average":
                return game.i18n.localize("AVAILABILITY.AVERAGE");
            case "scarce":
                return game.i18n.localize("AVAILABILITY.SCARCE");
            case "rare":
                return game.i18n.localize("AVAILABILITY.RARE");
            case "very-rare":
                return game.i18n.localize("AVAILABILITY.VERY_RARE");
            case "extremely-rare":
                return game.i18n.localize("AVAILABILITY.EXTREMELY_RARE");
            case "near-unique":
                return game.i18n.localize("AVAILABILITY.NEAR_UNIQUE");
            case "Unique":
                return game.i18n.localize("AVAILABILITY.UNIQUE");
            default:
                return game.i18n.localize("AVAILABILITY.COMMON");
        }
    }

    get ArmourType() {
        switch (this.subtype) {
            case "basic":
                return game.i18n.localize("ARMOUR_TYPE.BASIC");
            case "flak":
                return game.i18n.localize("ARMOUR_TYPE.FLAK");
            case "mesh":
                return game.i18n.localize("ARMOUR_TYPE.MESH");
            case "carapace":
                return game.i18n.localize("ARMOUR_TYPE.CARAPACE");
            case "power":
                return game.i18n.localize("ARMOUR_TYPE.POWER");
            default:
                return game.i18n.localize("ARMOUR_TYPE.COMMON");
        }
    }

    get Part() {
        let part = this.part;
        let parts = [];
        if (part.head > 0) parts.push(`${game.i18n.localize("ARMOUR.HEAD")} (${part.head})`);
        if (part.leftArm > 0) parts.push(`${game.i18n.localize("ARMOUR.LEFT_ARM")} (${part.leftArm})`);
        if (part.rightArm > 0) parts.push(`${game.i18n.localize("ARMOUR.RIGHT_ARM")} (${part.rightArm})`);
        if (part.body > 0) parts.push(`${game.i18n.localize("ARMOUR.BODY")} (${part.body})`);
        if (part.leftLeg > 0) parts.push(`${game.i18n.localize("ARMOUR.LEFT_LEG")} (${part.leftLeg})`);
        if (part.rightLeg > 0) parts.push(`${game.i18n.localize("ARMOUR.RIGHT_LEG")} (${part.rightLeg})`);
        return parts.join(" / ");
    }

    get PartLocation() {
        switch (this.part) {
            case "head":
                return game.i18n.localize("ARMOUR.HEAD");
            case "leftArm":
                return game.i18n.localize("ARMOUR.LEFT_ARM");
            case "rightArm":
                return game.i18n.localize("ARMOUR.RIGHT_ARM");
            case "body":
                return game.i18n.localize("ARMOUR.BODY");
            case "leftLeg":
                return game.i18n.localize("ARMOUR.LEFT_LEG");
            case "rightLeg":
                return game.i18n.localize("ARMOUR.RIGHT_LEG");
            default:
                return game.i18n.localize("ARMOUR.BODY");
        }
    }

    get PsychicPowerZone() {
        switch (this.damage.zone) {
            case "bolt":
                return game.i18n.localize("PSYCHIC_POWER.BOLT");
            case "barrage":
                return game.i18n.localize("PSYCHIC_POWER.BARRAGE");
            case "storm":
                return game.i18n.localize("PSYCHIC_POWER.STORM");
            default:
                return game.i18n.localize("PSYCHIC_POWER.BOLT");
        }
    }

    get isInstalled() { return this.installed
        ? game.i18n.localize("Yes")
        : game.i18n.localize("No");
    }


    get isMentalDisorder() { return this.type === "mentalDisorder"; }

    get isMalignancy() { return this.type === "malignancy"; }

    get isMutation() { return this.type === "mutation"; }

    get isTalent() { return this.type === "talent"; }

    get isTrait() { return this.type === "trait"; }

    get isAptitude() { return this.type === "aptitude"; }

    get isSpecialAbility() { return this.type === "specialAbility"; }

    get isPsychicPower() { return this.type === "psychicPower"; }

    get isCriticalInjury() { return this.type === "criticalInjury"; }

    get isWeapon() { return this.type === "weapon"; }

    get isArmour() { return this.type === "armour"; }

    get isGear() { return this.type === "gear"; }

    get isDrug() { return this.type === "drug"; }

    get isTool() { return this.type === "tool"; }

    get isCybernetic() { return this.type === "cybernetic"; }

    get isWeaponModification() { return this.type === "weaponModification"; }

    get isAmmunition() { return this.type === "ammunition"; }

    get isForceField() { return this.type === "forceField"; }

    get isAbilities() { return this.isTalent || this.isTrait || this.isSpecialAbility; }

    get isAdditive() { return this.system.isAdditive; }

    get craftsmanship() { return this.system.craftsmanship;}

    get description() { return this.system.description;}

    get availability() { return this.system.availability;}

    get weight() { return this.system.weight;}

    get quantity() { return this.system.quantity;}

    get weightSum() { return this.system.quantity * this.system.weight;}

    get effect() { return this.system.effect;}

    get weapon() { return this.system.weapon;}

    get source() { return this.system.source;}

    get subtype() { return this.system.type;}

    get part() { return this.system.part;}

    get maxAgility() { return this.system.maxAgility;}

    get installed() { return this.system.installed;}

    get shortDescription() { return this.system.shortDescription;}

    get protectionRating() { return this.system.protectionRating;}

    get overloadChance() { return this.system.overloadChance;}

    get cost() { return this.system.cost;}

    get prerequisite() { return this.system.prerequisite;}

    get action() { return this.system.action;}

    get focusPower() { return this.system.focusPower;}

    get range() { return this.system.range;}

    get sustained() { return this.system.sustained;}

    get psychicType() { return this.system.subtype;}

    get damage() { return this.system.damage;}

    get benefit() { return this.system.benefit;}

    get prerequisites() { return this.system.prerequisites;}

    get aptitudes() { return this.system.aptitudes;}

    get starter() { return this.system.starter;}

    get tier() { return this.system.tier;}

    get class() { return this.system.class;}

    get rateOfFire() { return this.system.rateOfFire;}

    get damageType() {
        return this.system.damageType
        || this.system?.damage?.type
        || this.system.effect?.damage?.type
        || this.system.type;
    }

    get penetration() { return this.system.penetration;}

    get clip() { return this.system.clip;}

    get reload() { return this.system.reload;}

    get special() { return this.system.special;}

    get attack() { return this.system.attack;}

    get upgrades() { return this.system.upgrades;}

}

/**
 * A helper class for building MeasuredTemplates (adapted from https://github.com/foundryvtt/dnd5e).
 */
class PlaceableTemplate extends MeasuredTemplate {

    /**
     * Track the timestamp when the last mouse move event was captured.
     * @type {number}
     */
    #moveTime = 0;

    /* -------------------------------------------- */

    /**
     * The initially active CanvasLayer to re-activate after the workflow is complete.
     * @type {CanvasLayer}
     */
    #initialLayer;

    /* -------------------------------------------- */

    /**
     * Track the bound event handlers so they can be properly canceled later.
     * @type {object}
     */
    #events;

    /* -------------------------------------------- */

    /**
     * A factory method to create a cone PlaceableTemplate instance
     * @param {string} origin  The id of the item originating the cone.
     * @param {number} angle   The cone angle.
     * @param {number} length  The cone length.
     * @returns {PlaceableTemplate}    The template .
     */
    static cone(origin, angle, length) {
        const templateData = {
            t: "cone",
            user: game.user.id,
            distance: length,
            direction: 0,
            x: 0,
            y: 0,
            fillColor: game.user.color,
            flags: { "liber-imperium": { origin: origin } },
            angle: angle
        };
        const cls = CONFIG.MeasuredTemplate.documentClass;
        const template = new cls(templateData, {parent: canvas.scene});
        const object = new this(template);
        object.actorSheet = game.actors.get(origin.actor).sheet || null;
        return object;
    }

    /* -------------------------------------------- */

    /**
     * Creates a preview of the ability template.
     * @returns {Promise}  A promise that resolves with the final measured template if created.
     */
    drawPreview() {
        const initialLayer = canvas.activeLayer;

        // Draw the template and switch to the template layer
        this.draw();
        this.layer.activate();
        this.layer.preview.addChild(this);

        // Hide the sheet that originated the preview
        this.actorSheet?.minimize();

        // Activate interactivity
        return this.activatePreviewListeners(initialLayer);
    }

    /* -------------------------------------------- */

    /**
     * Activate listeners for the template preview
     * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
     * @returns {Promise}                 A promise that resolves with the final measured template if created.
     */
    activatePreviewListeners(initialLayer) {
        return new Promise((resolve, reject) => {
            this.#initialLayer = initialLayer;
            this.#events = {
                cancel: this._onCancelPlacement.bind(this),
                confirm: this._onConfirmPlacement.bind(this),
                move: this._onMovePlacement.bind(this),
                resolve,
                reject,
                rotate: this._onRotatePlacement.bind(this)
            };

            // Activate listeners
            canvas.stage.on("mousemove", this.#events.move);
            canvas.stage.on("mousedown", this.#events.confirm);
            canvas.app.view.oncontextmenu = this.#events.cancel;
            canvas.app.view.onwheel = this.#events.rotate;
        });
    }

    /* -------------------------------------------- */

    /**
     * Shared code for when template placement ends by being confirmed or canceled.
     * @param {Event} event  Triggering event that ended the placement.
     */
    async _finishPlacement(event) {
        this.layer._onDragLeftCancel(event);
        canvas.stage.off("mousemove", this.#events.move);
        canvas.stage.off("mousedown", this.#events.confirm);
        canvas.app.view.oncontextmenu = null;
        canvas.app.view.onwheel = null;
        this.#initialLayer.activate();
        await this.actorSheet?.maximize();
    }

    /* -------------------------------------------- */

    /**
     * Move the template preview when the mouse moves.
     * @param {Event} event  Triggering mouse event.
     */
    _onMovePlacement(event) {
        event.stopPropagation();
        const now = Date.now(); // Apply a 20ms throttle
        if ( now - this.#moveTime <= 20 ) return;
        const center = event.data.getLocalPosition(this.layer);
        const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
        const snapped = canvas.grid.getSnappedPosition(center.x, center.y, interval);
        this.document.updateSource({x: snapped.x, y: snapped.y});
        this.refresh();
        this.#moveTime = now;
    }

    /* -------------------------------------------- */

    /**
     * Rotate the template preview by 3˚ increments when the mouse wheel is rotated.
     * @param {Event} event  Triggering mouse event.
     */
    _onRotatePlacement(event) {
        if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
        event.stopPropagation();
        const delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
        const snap = event.shiftKey ? delta : 5;
        const update = {direction: this.document.direction + (snap * Math.sign(event.deltaY))};
        this.document.updateSource(update);
        this.refresh();
    }

    /* -------------------------------------------- */

    /**
     * Confirm placement when the left mouse button is clicked.
     * @param {Event} event  Triggering mouse event.
     */
    async _onConfirmPlacement(event) {
        await this._finishPlacement(event);
        const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
        const destination = canvas.grid.getSnappedPosition(this.document.x, this.document.y, interval);
        this.document.updateSource(destination);
        this.#events.resolve(canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.document.toObject()]));
    }

    /* -------------------------------------------- */

    /**
     * Cancel placement when the right mouse button is clicked.
     * @param {Event} event  Triggering mouse event.
     */
    async _onCancelPlacement(event) {
        await this._finishPlacement(event);
        this.#events.reject();
    }

}

/**
 * Roll a generic roll, and post the result to chat.
 * @param {object} rollData
 */
async function commonRoll(rollData) {
    await _computeCommonTarget(rollData);
    await _rollTarget(rollData);
    if (rollData.flags.isEvasion) {
        rollData.numberOfHits = _computeNumberOfHits(
            rollData.attackDos,
            rollData.dos,
            rollData.attackType,
            rollData.shotsFired,
            rollData.weapon.traits);
    }
    await _sendRollToChat(rollData);
}

/**
 * Roll a combat roll, and post the result to chat.
 * @param {object} rollData
 */
async function combatRoll(rollData) {
    if (rollData.weapon.traits.spray && game.settings.get("liber-imperium", "useSpraytemplate")) {
        let template = PlaceableTemplate.cone({ item: rollData.itemId, actor: rollData.ownerId },
            30, rollData.weapon.range);
        await template.drawPreview();
    }
    if (rollData.weapon.traits.skipAttackRoll) {
        rollData.attackResult = 5; // Attacks that skip the hit roll always hit body; 05 reversed 50 = body
        rollData.flags.isDamageRoll = true;
        await _rollDamage(rollData);
        await _updateRangedAmmo(rollData);
        await sendDamageToChat(rollData);
    } else {
        await _computeCombatTarget(rollData);
        await _rollTarget(rollData);
        rollData.attackDos = rollData.dos;
        rollData.attackResult = rollData.result;
        if (!rollData.isReRoll) {
            await _updateRangedAmmo(rollData);
        }
        rollData.numberOfHits = _computeNumberOfHits(
            rollData.attackDos,
            0,
            rollData.attackType,
            rollData.shotsFired,
            rollData.weapon.traits);
        await _sendRollToChat(rollData);
    }
}

/**
 * Roll damage for an attack and post the result to chat
 * @param {object} rollData
 */
async function damageRoll(rollData) {
    await _rollDamage(rollData);
    await sendDamageToChat(rollData);
}

/**
 * Post an "empty clip, need to reload" message to chat.
 * @param {object} rollData
 */
async function reportEmptyClip(rollData) {
    await _emptyClipToChat(rollData);
}

/**
 * Compute the target value, including all +/-modifiers, for a roll.
 * @param {object} rollData
 */
async function _computeCombatTarget(rollData) {

    let attackType = 0;
    if (rollData.attackType) {
        _computeRateOfFire(rollData);
        attackType = rollData.attackType.modifier;
    }
    let psyModifier = 0;
    if (typeof rollData.psy !== "undefined" && typeof rollData.psy.useModifier !== "undefined" && rollData.psy.useModifier) {
    // Set Current Psyrating to the allowed maximum if it is bigger
        if (rollData.psy.value > rollData.psy.max) {
            rollData.psy.value = rollData.psy.max;
        }
        psyModifier = (rollData.psy.rating - rollData.psy.value) * 10;
        rollData.psy.push = psyModifier < 0;
        if (rollData.psy.push && rollData.psy.warpConduit) {
            let ratingBonus = new Roll("1d5").evaluate({ async: false }).total;
            rollData.psy.value += ratingBonus;
        }
    }

    let targetMods = rollData.target.modifier
    + (rollData.aim?.val ? rollData.aim.val : 0)
    + (rollData.rangeMod ? rollData.rangeMod : 0)
    + (rollData.weapon?.traits?.twinLinked ? 20: 0)
    + attackType
    + psyModifier;

    rollData.target.final = _getRollTarget(targetMods, rollData.target.base);
}

/**
 * Compute the target value, including all +/-modifiers, for a roll.
 * @param {object} rollData
 */
async function _computeCommonTarget(rollData) {
    if (rollData.flags.isEvasion) {
        let skill;
        switch (rollData.evasions.selected) {
            case "dodge": skill = rollData.evasions.dodge; break;
            case "parry": skill = rollData.evasions.parry; break;
            case "deny": skill = rollData.evasions.deny; break;
        }
        rollData.target.final = _getRollTarget(rollData.target.modifier, skill.target.base);
    } else {
        rollData.target.final = _getRollTarget(rollData.target.modifier, rollData.target.base);
    }
}

/**
 * Checks and adjusts modifiers for the rolls target number and returns the final target number
 * @param {int} targetMod calculated bonuses
 * @param {int} baseTarget the intial target value to be modified
 * @returns {int} the final target number
 */
function _getRollTarget(targetMod, baseTarget) {
    if (targetMod > 60) {
        return baseTarget + 60;
    } else if (targetMod < -60) {
        return baseTarget + -60;
    } else {
        return baseTarget + targetMod;
    }
}


/**
 * Roll a d100 against a target, and apply the result to the rollData.
 * @param {object} rollData
 */
async function _rollTarget(rollData) {
    let r = new Roll("1d100", {});
    await r.evaluate();
    rollData.result = r.total;
    rollData.rollObject = r;
    rollData.flags.isSuccess = rollData.result <= rollData.target.final;
    if (rollData.flags.isSuccess) {
        rollData.dof = 0;
        rollData.dos = 1 + _getDegree(rollData.target.final, rollData.result);
    } else {
        rollData.dos = 0;
        rollData.dof = 1 + _getDegree(rollData.result, rollData.target.final);
    }
    if (rollData.psy) _computePsychicPhenomena(rollData);
}
/**
 * Handle rolling and collecting parts of a combat damage roll.
 * @param {object} rollData
 */
async function _rollDamage(rollData) {
    let formula = "0";
    rollData.damages = [];
    if (rollData.weapon.damageFormula) {
        formula = rollData.weapon.damageFormula;

        if (rollData.weapon.traits.tearing) {
            formula = _appendTearing(formula);
        }
        if (rollData.weapon.traits.proven) {
            formula = _appendNumberedDiceModifier(formula, "min", rollData.weapon.traits.proven);
        }
        if (rollData.weapon.traits.primitive) {
            formula = _appendNumberedDiceModifier(formula, "max", rollData.weapon.traits.primitive);
        }

        formula = `${formula}+${rollData.weapon.damageBonus}`;
        formula = _replaceSymbols(formula, rollData);
    }


    let penetration = await _rollPenetration(rollData);

    let firstHit = await _computeDamage(
        formula,
        penetration,
        rollData.attackDos,
        rollData.aim?.isAiming,
        rollData.weapon.traits
    );
    const firstLocation = _getLocation(rollData.attackResult);
    firstHit.location = firstLocation;
    rollData.damages.push(firstHit);

    let additionalhits = rollData.numberOfHits -1;

    for (let i = 0; i < additionalhits; i++) {
        let additionalHit = await _computeDamage(
            formula,
            penetration,
            rollData.attackDos,
            rollData.aim?.isAiming,
            rollData.weapon.traits
        );
        additionalHit.location = _getAdditionalLocation(firstLocation, i);
        rollData.damages.push(additionalHit);
    }

    let minDamage = rollData.damages.reduce(
        (min, damage) => min.minDice < damage.minDice ? min : damage, rollData.damages[0]);

    if (minDamage.minDice < rollData.dos) {
        minDamage.total += (rollData.dos - minDamage.minDice);
    }
}

/**
 * Calculates the amount of hits of a successful attack
 * @param {int} attackDos Degrees of success on the Attack
 * @param {int} evasionDos Degrees of success on the Evasion
 * @param {object} attackType The mode of attack and its parameters
 * @param {int} shotsFired Number actually achiveable hits
 * @param {object} weaponTraits The traits of the weapon used for the attack
 * @returns {int}  the number of hits the attack has scrored
 */
function _computeNumberOfHits(attackDos, evasionDos, attackType, shotsFired, weaponTraits) {

    let stormMod = weaponTraits.storm ? 2 : 1;
    let maxHits = attackType.maxHits * stormMod;

    if (weaponTraits.twinLinked && attackDos >=2) {
        maxHits += 1;
        attackDos += attackType.hitMargin;
        if (shotsFired) shotsFired += 1;
    }

    let hits = (1 + Math.floor((attackDos - 1) / attackType.hitMargin)) * stormMod;

    if (shotsFired && shotsFired < maxHits) {
        maxHits = shotsFired;
    }

    if (hits > maxHits) {
        hits = maxHits;
    }

    hits -= evasionDos;

    if (hits <= 0) {
        return 0;
    } else {
        return hits;
    }
}

/**
 * Roll and compute damage.
 * @param {string} damageFormula
 * @param {number} penetration
 * @param {number} dos
 * @param {boolean} isAiming
 * @param {object} weaponTraits
 * @returns {object}
 */
async function _computeDamage(damageFormula, penetration, dos, isAiming, weaponTraits) {
    let r = new Roll(damageFormula);
    await r.evaluate();
    let damage = {
        total: r.total,
        righteousFury: 0,
        dices: [],
        penetration: penetration,
        dos: dos,
        formula: damageFormula,
        replaced: false,
        damageRender: await r.render(),
        damageRoll: r
    };

    if (weaponTraits.accurate && isAiming) {
        let numDice = ~~((dos - 1) / 2); // -1 because each degree after the first counts
        if (numDice >= 1) {
            if (numDice > 2) numDice = 2;
            let ar = new Roll(`${numDice}d10`);
            await ar.evaluate();
            damage.total += ar.total;
            ar.terms.flatMap(term => term.results).forEach(async die => {
                if (die.active && die.result < dos) damage.dices.push(die.result);
                if (die.active && (typeof damage.minDice === "undefined" || die.result < damage.minDice)) damage.minDice = die.result;
            });
            damage.accurateRender = await ar.render();
        }
    }

    r.terms.forEach(term => {
        if (typeof term === "object" && term !== null) {
            let rfFace = weaponTraits.rfFace ? weaponTraits.rfFace : term.faces; // Without the Vengeful weapon trait rfFace is undefined
            term.results?.forEach(async result => {
                let dieResult = result.count ? result.count : result.result; // Result.count = actual value if modified by term
                if (result.active && dieResult >= rfFace) damage.righteousFury = await _rollRighteousFury();
                if (result.active && dieResult < dos) damage.dices.push(dieResult);
                if (result.active && (typeof damage.minDice === "undefined" || dieResult < damage.minDice)) damage.minDice = dieResult;
            });
        }
    });
    return damage;
}

/**
 * Reduce Ammo of the used Weapon
 * @param {object} rollData
 * @returns {Promise}
 */
async function _updateRangedAmmo(rollData) {
    let firerate = 1;
    let mod = rollData.weapon.traits.storm || rollData.weapon.traits.twinLinked ? 2 : 1;
    if (rollData.weapon.isRange && rollData.weapon.clip.max > 0) {
        if (rollData.weapon.clip.value < 1) {
            return;
        }
        let weapon = game.actors.get(rollData.ownerId)?.items?.get(rollData.itemId);
        if (weapon) {
            switch (rollData.attackType.name) {
                case "standard":
                case "called_shot": {
                    rollData.weapon.clip.value -= firerate;
                    break;
                }
                case "semi_auto": {
                    firerate = rollData.weapon.rateOfFire.burst * mod;
                    if (rollData.weapon.clip.value < firerate) {
                        rollData.shotsFired = rollData.weapon.clip.value;
                        rollData.weapon.clip.value = 0;
                    } else {
                        rollData.weapon.clip.value -= firerate;
                    }
                    break;
                }
                case "full_auto": {
                    firerate = rollData.weapon.rateOfFire.full * mod;
                    if (rollData.weapon.clip.value < firerate) {
                        rollData.shotsFired = rollData.weapon.clip.value;
                        rollData.weapon.clip.value = 0;
                    } else {
                        rollData.weapon.clip.value -= firerate;
                    }
                    break;
                }
            }
            await weapon.update({"system.clip.value": rollData.weapon.clip.value});
        }
    }
}

/**
 * Evaluate final penetration, by leveraging the dice roll API.
 * @param {object} rollData
 * @returns {number}
 */
async function _rollPenetration(rollData) {
    let penetration = (rollData.weapon.penetrationFormula) ? _replaceSymbols(rollData.weapon.penetrationFormula, rollData) : "0";
    let multiplier = 1;

    if (rollData.dos >= 3) {
        if (penetration.includes("(")) // Legacy Support
        {
            let rsValue = penetration.match(/\(\d+\)/gi); // Get Razorsharp Value
            penetration = penetration.replace(/\d+.*\(\d+\)/gi, rsValue); // Replace construct BaseValue(RazorsharpValue) with the extracted date
        } else if (rollData.weapon.traits.razorSharp) {
            multiplier = 2;
        }
    }
    let r = new Roll(penetration.toString());
    await r.evaluate();
    return r.total * multiplier;
}

/**
 * Roll a Righteous Fury dice, and return the value.
 * @returns {number}
 */
async function _rollRighteousFury() {
    let r = new Roll("1d5");
    await r.evaluate();
    return r.total;
}

/**
 * Check for psychic phenomena (i.e, the user rolled two matching numbers, etc.), and add the result to the rollData.
 * @param {object} rollData
 */
function _computePsychicPhenomena(rollData) {
    rollData.psy.hasPhenomena = rollData.psy.push ? !_isDouble(rollData.result) : _isDouble(rollData.result);
}

/**
 * Check if a number (d100 roll) has two matching digits.
 * @param {number} number
 * @returns {boolean}
 */
function _isDouble(number) {
    if (number === 100) {
        return true;
    } else {
        const digit = number % 10;
        return number - digit === digit * 10;
    }
}

/**
 * Get the hit location from a WS/BS roll.
 * @param {number} result
 * @returns {string}
 */
function _getLocation(result) {
    const toReverse = result < 10 ? `0${result}` : result.toString();
    const locationTarget = parseInt(toReverse.split("").reverse().join(""));
    if (locationTarget <= 10) {
        return "ARMOUR.HEAD";
    } else if (locationTarget <= 20) {
        return "ARMOUR.RIGHT_ARM";
    } else if (locationTarget <= 30) {
        return "ARMOUR.LEFT_ARM";
    } else if (locationTarget <= 70) {
        return "ARMOUR.BODY";
    } else if (locationTarget <= 85) {
        return "ARMOUR.RIGHT_LEG";
    } else if (locationTarget <= 100) {
        return "ARMOUR.LEFT_LEG";
    } else {
        return "ARMOUR.BODY";
    }
}

/**
 * Calculate modifiers/etc. from RoF type, and add them to the rollData.
 * @param {object} rollData
 */
function _computeRateOfFire(rollData) {
    switch (rollData.attackType.name) {
        case "standard":
            rollData.attackType.modifier = 10;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "bolt":
        case "blast":
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "swift":
        case "semi_auto":
        case "barrage":
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 2;
            rollData.attackType.maxHits = rollData.weapon.rateOfFire.burst;
            break;

        case "lightning":
        case "full_auto":
            rollData.attackType.modifier = -10;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = rollData.weapon.rateOfFire.full;
            break;

        case "called_shot":
            rollData.attackType.modifier = -20;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "charge":
            rollData.attackType.modifier = 20;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        case "allOut":
            rollData.attackType.modifier = 30;
            rollData.attackType.hitMargin = 1;
            rollData.attackType.maxHits = 1;
            break;

        default:
            rollData.attackType.modifier = 0;
            rollData.attackType.hitMargin = 0;
            rollData.attackType.maxHits = 1;
            break;
    }
}

const additionalHit = {
    head: ["ARMOUR.HEAD", "ARMOUR.RIGHT_ARM", "ARMOUR.BODY", "ARMOUR.LEFT_ARM", "ARMOUR.BODY"],
    rightArm: ["ARMOUR.RIGHT_ARM", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY", "ARMOUR.RIGHT_ARM"],
    leftArm: ["ARMOUR.LEFT_ARM", "ARMOUR.LEFT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY", "ARMOUR.LEFT_ARM"],
    body: ["ARMOUR.BODY", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.LEFT_ARM", "ARMOUR.BODY"],
    rightLeg: ["ARMOUR.RIGHT_LEG", "ARMOUR.BODY", "ARMOUR.RIGHT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY"],
    leftLeg: ["ARMOUR.LEFT_LEG", "ARMOUR.BODY", "ARMOUR.LEFT_ARM", "ARMOUR.HEAD", "ARMOUR.BODY"]
};

/**
 * Get successive hit locations for an attack which scored multiple hits.
 * @param {string} firstLocation
 * @param {number} numberOfHit
 * @returns {string}
 */
function _getAdditionalLocation(firstLocation, numberOfHit) {
    if (firstLocation === "ARMOUR.HEAD") {
        return _getLocationByIt(additionalHit.head, numberOfHit);
    } else if (firstLocation === "ARMOUR.RIGHT_ARM") {
        return _getLocationByIt(additionalHit.rightArm, numberOfHit);
    } else if (firstLocation === "ARMOUR.LEFT_ARM") {
        return _getLocationByIt(additionalHit.leftArm, numberOfHit);
    } else if (firstLocation === "ARMOUR.BODY") {
        return _getLocationByIt(additionalHit.body, numberOfHit);
    } else if (firstLocation === "ARMOUR.RIGHT_LEG") {
        return _getLocationByIt(additionalHit.rightLeg, numberOfHit);
    } else if (firstLocation === "ARMOUR.LEFT_LEG") {
        return _getLocationByIt(additionalHit.leftLeg, numberOfHit);
    } else {
        return _getLocationByIt(additionalHit.body, numberOfHit);
    }
}

/**
 * Lookup hit location from array.
 * @param {Array} part
 * @param {number} numberOfHit
 * @returns {string}
 */
function _getLocationByIt(part, numberOfHit) {
    const index = numberOfHit > (part.length - 1) ? part.length - 1 : numberOfHit;
    return part[index];
}


/**
 * Get degrees of success/failure from a target and a roll.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function _getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
}
/**
 * Replaces all Symbols in the given Formula with their Respective Values
 * The Symbols consist of Attribute Boni and Psyrating
 * @param {*} formula
 * @param {*} rollData
 * @returns {string}
 */
function _replaceSymbols(formula, rollData) {
    let actor = game.actors.get(rollData.ownerId);
    let attributeBoni = actor.attributeBoni;
    if (rollData.psy) {
        formula = formula.replaceAll(/PR/gi, rollData.psy.value);
    }
    for (let boni of attributeBoni) {
        formula = formula.replaceAll(boni.regex, boni.value);
    }
    return formula;
}

/**
 * Add a special weapon modifier value to a roll formula.
 * @param {string} formula
 * @param {string} modifier
 * @param {number} value
 * @returns {string}
 */
function _appendNumberedDiceModifier(formula, modifier, value) {
    let diceRegex = /\d+d\d+/;
    if (!formula.includes(modifier)) {
        let match = formula.match(diceRegex);
        if (match) {
            let dice = match[0];
            dice += `${modifier}${value}`;
            formula = formula.replace(diceRegex, dice);
        }
    }
    return formula;
}

/**
 * Add the "tearing" special weapon modifier to a roll formula.
 * @param {string} formula
 * @returns {string}
 */
function _appendTearing(formula) {
    let diceRegex = /\d+d\d+/;
    if (!formula.match(/dl|kh/gi, formula)) { // Already has drop lowest or keep highest
        let match = formula.match(/\d+/g, formula);
        let numDice = parseInt(match[0]) + 1;
        let faces = parseInt(match[1]);
        let diceTerm = `${numDice}d${faces}dl`;
        formula = formula.replace(diceRegex, diceTerm);
    }
    return formula;
}

/**
 * Post a roll to chat.
 * @param {object} rollData
 */
async function _sendRollToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "liber-imperium.rollData": rollData
        }
    };

    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }

    if (rollData.rollObject) {
        rollData.render = await rollData.rollObject.render();
        chatData.rolls = [rollData.rollObject];
    }

    let html;
    if (rollData.flags.isEvasion) {
        html = await renderTemplate("systems/liber-imperium/template/chat/evasion.hbs", rollData);
    } else {
        html = await renderTemplate("systems/liber-imperium/template/chat/roll.hbs", rollData);
    }
    chatData.content = html;

    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }

    ChatMessage.create(chatData);
}
/**
 * Post rolled damage to chat.
 * @param {object} rollData
 */
async function sendDamageToChat(rollData) {
    let speaker = ChatMessage.getSpeaker();
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get("core", "rollMode"),
        speaker: speaker,
        flags: {
            "liber-imperium.rollData": rollData
        }
    };

    if (speaker.token) {
        rollData.tokenId = speaker.token;
    }

    chatData.rolls = rollData.damages.flatMap(r => r.damageRoll);

    const html = await renderTemplate("systems/liber-imperium/template/chat/damage.hbs", rollData);
    chatData.content = html;

    if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    } else if (chatData.rollMode === "selfroll") {
        chatData.whisper = [game.user];
    }

    ChatMessage.create(chatData);
}

/**
 * Post a "you need to reload" message to chat.
 * @param {object} rollData
 */
async function _emptyClipToChat(rollData) {
    let chatData = {
        user: game.user.id,
        content: await renderTemplate("systems/liber-imperium/template/chat/emptyMag.hbs", rollData),
        flags: {
            "liber-imperium.rollData": rollData
        }
    };
    ChatMessage.create(chatData);
}

/**
 * Show a generic roll dialog.
 * @param {object} rollData
 */
async function prepareCommonRoll(rollData) {
    const html = await renderTemplate("systems/liber-imperium/template/dialog/common-roll.hbs", rollData);
    let dialog = new Dialog({
        title: game.i18n.localize(rollData.name),
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    if (rollData.flags?.isEvasion) {
                        const skill = html.find("#selectedSkill")[0];
                        if (skill) {
                            rollData.name = game.i18n.localize(skill.options[skill.selectedIndex].text);
                            rollData.evasions.selected = skill.value;
                        }
                    } else {
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(html.find("#target")[0].value, 10);
                        rollData.rolledWith = html.find("[name=characteristic] :selected").text();
                    }
                    rollData.target.modifier = parseInt(html.find("#modifier")[0].value, 10);
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = false;
                    await commonRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }

        },
        default: "roll",
        close: () => {},
        render: html => {
            const sel = html.find("select[name=characteristic");
            const target = html.find("#target");
            sel.change(() => {
                target.val(sel.val());
            });
        }
    }, {
        width: 200
    });
    dialog.render(true);
}

/**
 * Show a combat roll dialog.
 * @param {object} rollData
 * @param {DarkHeresyActor} actorRef
 */
async function prepareCombatRoll(rollData, actorRef) {
    if (rollData.weapon.isRanged && rollData.weapon.clip.value <= 0) {
        reportEmptyClip(rollData);
    } else {
        const html = await renderTemplate("systems/liber-imperium/template/dialog/combat-roll.hbs", rollData);
        let dialog = new Dialog({
            title: rollData.name,
            content: html,
            buttons: {
                roll: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTON.ROLL"),
                    callback: async html => {
                        rollData.name = game.i18n.localize(rollData.name);
                        rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                        rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                        const range = html.find("#range")[0];
                        if (range) {
                            rollData.rangeMod = parseInt(range.value, 10);
                            rollData.rangeModText = range.options[range.selectedIndex].text;
                        }

                        const attackType = html.find("#attackType")[0];
                        rollData.attackType = {
                            name: attackType?.value,
                            text: attackType?.options[attackType.selectedIndex].text,
                            modifier: 0
                        };

                        const aim = html.find("#aim")[0];
                        rollData.aim = {
                            val: parseInt(aim?.value, 10),
                            isAiming: aim?.value !== "0",
                            text: aim?.options[aim.selectedIndex].text
                        };

                        if (rollData.weapon.traits.inaccurate) {
                            rollData.aim.val=0;
                        } else if (rollData.weapon.traits.accurate && rollData.aim.isAiming) {
                            rollData.aim.val += 10;
                        }

                        rollData.weapon.damageFormula = html.find("#damageFormula")[0].value.replace(" ", "");
                        rollData.weapon.damageType = html.find("#damageType")[0].value;
                        rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                        rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                        rollData.flags.isDamageRoll = false;
                        rollData.flags.isCombatRoll = true;

                        if (rollData.weapon.traits.skipAttackRoll) {
                            rollData.attackType.name = "standard";
                        }

                        await combatRoll(rollData);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTON.CANCEL"),
                    callback: () => {}
                }
            },
            default: "roll",
            close: () => {}
        }, {width: 200});
        dialog.render(true);
    }
}

/**
 * Show a psychic power roll dialog.
 * @param {object} rollData
 */
async function preparePsychicPowerRoll(rollData) {
    const html = await renderTemplate("systems/liber-imperium/template/dialog/psychic-power-roll.hbs", rollData);
    let dialog = new Dialog({
        title: rollData.name,
        content: html,
        buttons: {
            roll: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("BUTTON.ROLL"),
                callback: async html => {
                    rollData.name = game.i18n.localize(rollData.name);
                    rollData.target.base = parseInt(html.find("#target")[0]?.value, 10);
                    rollData.target.modifier = parseInt(html.find("#modifier")[0]?.value, 10);
                    rollData.psy.value = parseInt(html.find("#psy")[0].value, 10);
                    rollData.psy.warpConduit = html.find("#warpConduit")[0].checked;
                    rollData.weapon.damageFormula = html.find("#damageFormula")[0].value;
                    rollData.weapon.damageType = html.find("#damageType")[0].value;
                    rollData.weapon.damageBonus = parseInt(html.find("#damageBonus")[0].value, 10);
                    rollData.weapon.penetrationFormula = html.find("#penetration")[0].value;
                    rollData.weapon.rateOfFire = { burst: rollData.psy.value, full: rollData.psy.value };
                    const attackType = html.find("#attackType")[0];
                    rollData.attackType.name = attackType.value;
                    rollData.attackType.text = attackType.options[attackType.selectedIndex].text;
                    rollData.psy.useModifier = true;
                    rollData.flags.isDamageRoll = false;
                    rollData.flags.isCombatRoll = true;
                    await combatRoll(rollData);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BUTTON.CANCEL"),
                callback: () => {}
            }
        },
        default: "roll",
        close: () => {}
    }, {width: 200});
    dialog.render(true);
}

class DarkHeresyUtil {

    static createCommonAttackRollData(actor, item) {
        return {
            name: item.name,
            itemName: item.name, // Seperately here because evasion may override it
            ownerId: actor.id,
            itemId: item.id,
            target: {
                base: 0,
                modifier: 0
            },
            weapon: {
                damageBonus: 0,
                damageType: item.damageType
            },
            psy: {
                value: actor.psy.rating,
                display: false
            },
            attackType: {
                name: "standard",
                text: ""
            },
            flags: {
                isAttack: true
            }
        };
    }

    static createCommonNormalRollData(actor, value) {
        return {
            target: {
                base: value.total,
                modifier: 0
            },
            flags: {
                isAttack: false
            },
            ownerId: actor.id
        };
    }

    static createWeaponRollData(actor, weaponItem) {
        let characteristic = this.getWeaponCharacteristic(actor, weaponItem);
        let rateOfFire;
        if (weaponItem.class === "melee") {
            rateOfFire = {burst: characteristic.bonus, full: characteristic.bonus};
        } else {
            rateOfFire = {burst: weaponItem.rateOfFire.burst, full: weaponItem.rateOfFire.full};
        }
        let weaponTraits = this.extractWeaponTraits(weaponItem.special);
        let isMelee = weaponItem.class === "melee";
        let attributeMod = (isMelee && !weaponItem.damage.match(/SB/gi) ? "+SB" : "");

        let rollData = this.createCommonAttackRollData(actor, weaponItem);

        rollData.target.base = characteristic.total + weaponItem.attack;
        rollData.rangeMod = !isMelee ? 10 : 0;

        rollData.weapon = foundry.utils.mergeObject(rollData.weapon, {
            isMelee: isMelee,
            isRange: !isMelee,
            clip: weaponItem.clip,
            rateOfFire: rateOfFire,
            range: !isMelee ? weaponItem.range : 0,
            damageFormula: weaponItem.damage + attributeMod + (weaponTraits.force ? "+PR": ""),
            penetrationFormula: weaponItem.penetration + (weaponTraits.force ? "+PR" : ""),
            traits: weaponTraits,
            special: weaponItem.special
        });

        return rollData;
    }

    static createPsychicRollData(actor, power) {
        let focusPowerTarget = this.getFocusPowerTarget(actor, power);

        let rollData = this.createCommonAttackRollData(actor, power);
        rollData.target.base= focusPowerTarget.total;
        rollData.target.modifier= power.focusPower.difficulty;
        rollData.weapon = foundry.utils.mergeObject(rollData.weapon, {
            damageFormula: power.damage.formula,
            penetrationFormula: power.damage.penetration,
            traits: this.extractWeaponTraits(power.damage.special),
            special: power.damage.special
        });
        rollData.attackType.name = power.damage.zone;
        rollData.psy = {
            value: actor.psy.rating,
            rating: actor.psy.rating,
            max: this.getMaxPsyRating(actor),
            warpConduit: false,
            display: true
        };
        return rollData;
    }

    static createSkillRollData(actor, skillName) {
        const skill = actor.skills[skillName];
        const defaultChar = skill.defaultCharacteristic || skill.characteristics[0];

        let characteristics = this.getCharacteristicOptions(actor, defaultChar);
        characteristics = characteristics.map(char => {
            char.target += skill.advance;
            return char;
        });

        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, skill), {
            name: skill.label,
            characteristics: characteristics
        });
    }

    static createSpecialtyRollData(actor, skillName, specialityName) {
        const skill = actor.skills[skillName];
        const speciality = skill.specialities[specialityName];
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, speciality), {
            name: speciality.label
        });
    }

    static createCharacteristicRollData(actor, characteristicName) {
        const characteristic = actor.characteristics[characteristicName];
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: characteristic.label
        });
    }

    static createFearTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "FEAR.HEADER"
        });
    }

    static createMalignancyTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "CORRUPTION.MALIGNANCY",
            target: {
                modifier: this.getMalignancyModifier(actor.corruption)
            }
        });
    }

    static createTraumaTestRolldata(actor) {
        const characteristic = actor.characteristics.willpower;
        return foundry.utils.mergeObject(this.createCommonNormalRollData(actor, characteristic), {
            name: "TRAUMA.HEADER",
            target: {
                modifier: this.getTraumaModifier(actor.insanity)
            }
        });
    }


    static extractWeaponTraits(traits) {
    // These weapon traits never go above 9 or below 2
        return {
            accurate: this.hasNamedTrait(/(?<!in)Accurate/gi, traits),
            rfFace: this.extractNumberedTrait(/Vengeful.*\(\d\)/gi, traits), // The alternativ die face Righteous Fury is triggered on
            proven: this.extractNumberedTrait(/Proven.*\(\d\)/gi, traits),
            primitive: this.extractNumberedTrait(/Primitive.*\(\d\)/gi, traits),
            razorSharp: this.hasNamedTrait(/Razor.?-? *Sharp/gi, traits),
            spray: this.hasNamedTrait(/Spray/gi, traits),
            skipAttackRoll: this.hasNamedTrait(/Spray/gi, traits), // Currently, spray will always be the same as skipAttackRoll. However, in the future, there may be other skipAttackRoll weapons that are not Spray.
            tearing: this.hasNamedTrait(/Tearing/gi, traits),
            storm: this.hasNamedTrait(/Storm/gi, traits),
            twinLinked: this.hasNamedTrait(/Twin.?-? *Linked/gi, traits),
            force: this.hasNamedTrait(/Force/gi, traits),
            inaccurate: this.hasNamedTrait(/Inaccurate/gi, traits)
        };
    }

    static getMaxPsyRating(actor) {
        let base = actor.psy.rating;
        switch (actor.psy.class) {
            case "bound":
                return base + 2;
            case "unbound":
                return base + 4;
            case "daemonic":
                return base + 3;
        }
    }

    static extractNumberedTrait(regex, traits) {
        let rfMatch = traits.match(regex);
        if (rfMatch) {
            regex = /\d+/gi;
            return parseInt(rfMatch[0].match(regex)[0]);
        }
        return undefined;
    }

    static hasNamedTrait(regex, traits) {
        let rfMatch = traits.match(regex);
        if (rfMatch) {
            return true;
        } else {
            return false;
        }
    }

    static getWeaponCharacteristic(actor, weapon) {
        if (weapon.class === "melee") {
            return actor.characteristics.weaponSkill;
        } else {
            return actor.characteristics.ballisticSkill;
        }
    }

    static getFocusPowerTarget(actor, psychicPower) {
        const normalizeName = psychicPower.focusPower.test.toLowerCase();
        if (actor.characteristics.hasOwnProperty(normalizeName)) {
            return actor.characteristics[normalizeName];
        } else if (actor.skills.hasOwnProperty(normalizeName)) {
            return actor.skills[normalizeName];
        } else {
            return actor.characteristics.willpower;
        }
    }

    static getCharacteristicOptions(actor, selected) {
        const characteristics = [];
        for (let char of Object.values(actor.characteristics)) {
            characteristics.push({
                label: char.label,
                target: char.total,
                selected: char.short === selected
            });
        }
        return characteristics;
    }

    static getMalignancyModifier(corruption) {
        if (corruption <= 30) {
            return 0;
        } else if (corruption <= 60) {
            return -10;
        } else if (corruption <= 90) {
            return -20;
        } else {
            return -30;
        }
    }

    static getTraumaModifier(insanity) {
        if (insanity < 10) {
            return 0;
        } else if (insanity < 40) {
            return 10;
        } else if (insanity < 60) {
            return 0;
        } else if (insanity < 80) {
            return -10;
        } else {
            return -20;
        }
    }
}

class DarkHeresySheet extends ActorSheet {
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".item-create").click(ev => this._onItemCreate(ev));
        html.find(".item-edit").click(ev => this._onItemEdit(ev));
        html.find(".item-delete").click(ev => this._onItemDelete(ev));
        html.find("input").focusin(ev => this._onFocusIn(ev));
        html.find(".roll-characteristic").click(async ev => await this._prepareRollCharacteristic(ev));
        html.find(".roll-skill").click(async ev => await this._prepareRollSkill(ev));
        html.find(".roll-speciality").click(async ev => await this._prepareRollSpeciality(ev));
        html.find(".roll-insanity").click(async ev => await this._prepareRollInsanity(ev));
        html.find(".roll-corruption").click(async ev => await this._prepareRollCorruption(ev));
        html.find(".roll-weapon").click(async ev => await this._prepareRollWeapon(ev));
        html.find(".roll-psychic-power").click(async ev => await this._prepareRollPsychicPower(ev));
    }

    /** @override */
    async getData() {
        const data = super.getData();
        data.system = data.data.system;
        data.items = this.constructItemLists(data);
        data.enrichment = await this._enrichment();
        return data;
    }

    async _enrichment() {
        let enrichment = {};
        if (this.actor.type !== "npc") {
            enrichment["system.bio.notes"] = await TextEditor.enrichHTML(this.actor.system.bio.notes, {async: true});
        } else {
            enrichment["system.notes"] = await TextEditor.enrichHTML(this.actor.system.notes, {async: true});
        }
        return foundry.utils.expandObject(enrichment);
    }

    /** @override */
    get template() {
        if (!game.user.isGM && this.actor.limited) {
            return "systems/liber-imperium/template/sheet/actor/limited-sheet.hbs";
        } else {
            return this.options.template;
        }
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [
                {
                    label: game.i18n.localize("BUTTON.ROLL"),
                    class: "custom-roll",
                    icon: "fas fa-dice",
                    onclick: async () => await this._prepareCustomRoll()
                }
            ].concat(buttons);
        }
        return buttons;
    }

    _onItemCreate(event) {
        event.preventDefault();
        let header = event.currentTarget.dataset;

        let data = {
            name: `New ${game.i18n.localize(`TYPES.Item.${header.type.toLowerCase()}`)}`,
            type: header.type
        };
        this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
    }

    _onItemEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.sheet.render(true);
    }

    _onItemDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        this.actor.deleteEmbeddedDocuments("Item", [div.data("itemId")]);
        div.slideUp(200, () => this.render(false));
    }

    async _prepareCustomRoll() {
        const rollData = {
            name: "DIALOG.CUSTOM_ROLL",
            baseTarget: 50,
            modifier: 0,
            ownerId: this.actor.id
        };
        await prepareCommonRoll(rollData);
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = $(event.currentTarget).data("characteristic");
        await prepareCommonRoll(
            DarkHeresyUtil.createCharacteristicRollData(this.actor, characteristicName)
        );
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).data("skill");
        await prepareCommonRoll(
            DarkHeresyUtil.createSkillRollData(this.actor, skillName)
        );
    }

    async _prepareRollSpeciality(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).parents(".item").data("skill");
        const specialityName = $(event.currentTarget).data("speciality");
        await prepareCommonRoll(
            DarkHeresyUtil.createSpecialtyRollData(this.actor, skillName, specialityName)
        );
    }

    async _prepareRollInsanity(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createFearTestRolldata(this.actor)
        );
    }

    async _prepareRollCorruption(event) {
        event.preventDefault();
        await prepareCommonRoll(
            DarkHeresyUtil.createMalignancyTestRolldata(this.actor)
        );
    }

    async _prepareRollWeapon(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const weapon = this.actor.items.get(div.data("itemId"));
        await prepareCombatRoll(
            DarkHeresyUtil.createWeaponRollData(this.actor, weapon),
            this.actor
        );
    }

    async _prepareRollPsychicPower(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const psychicPower = this.actor.items.get(div.data("itemId"));
        await preparePsychicPowerRoll(
            DarkHeresyUtil.createPsychicRollData(this.actor, psychicPower)
        );
    }

    constructItemLists() {
        let items = {};
        let itemTypes = this.actor.itemTypes;
        items.mentalDisorders = itemTypes.mentalDisorder;
        items.malignancies = itemTypes.malignancy;
        items.mutations = itemTypes.mutation;
        if (this.actor.type === "npc") {
            items.abilities = itemTypes.talent
                .concat(itemTypes.trait)
                .concat(itemTypes.specialAbility);
        }
        items.talents = itemTypes.talent;
        items.traits = itemTypes.trait;
        items.specialAbilities = itemTypes.specialAbility;
        items.aptitudes = itemTypes.aptitude;

        items.psychicPowers = itemTypes.psychicPower;

        items.criticalInjuries = itemTypes.criticalInjury;

        items.gear = itemTypes.gear;
        items.drugs = itemTypes.drug;
        items.tools = itemTypes.tool;
        items.cybernetics = itemTypes.cybernetic;

        items.armour = itemTypes.armour;
        items.forceFields = itemTypes.forceField;

        items.weapons = itemTypes.weapon;
        items.weaponMods = itemTypes.weaponModification;
        items.ammunitions = itemTypes.ammunition;
        this._sortItemLists(items);

        return items;
    }

    _sortItemLists(items) {
        for (let list in items) {
            if (Array.isArray(items[list])) items[list] = items[list].sort((a, b) => a.sort - b.sort);
            else if (typeof items[list] == "object") _sortItemLists(items[list]);
        }
    }
}

class AcolyteSheet extends DarkHeresySheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "actor"],
            template: "systems/liber-imperium/template/sheet/actor/acolyte.hbs",
            width: 700,
            height: 881,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [].concat(buttons);
        }
        return buttons;
    }

    getData() {
        const data = super.getData();
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".aptitude-create").click(async ev => { await this._onAptitudeCreate(ev); });
        html.find(".aptitude-delete").click(async ev => { await this._onAptitudeDelete(ev); });
        html.find(".item-cost").focusout(async ev => { await this._onItemCostFocusOut(ev); });
        html.find(".item-starter").click(async ev => { await this._onItemStarterClick(ev); });
    }

    async _onAptitudeCreate(event) {
        event.preventDefault();
        let aptitudeId = Date.now().toString();
        let aptitude = { id: Date.now().toString(), name: "New Aptitude" };
        await this.actor.update({[`system.aptitudes.${aptitudeId}`]: aptitude});
        this._render(true);
    }

    async _onAptitudeDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        const aptitudeId = div.data("aptitudeId").toString();
        await this.actor.update({[`system.aptitudes.-=${aptitudeId}`]: null});
        this._render(true);
    }

    async _onItemCostFocusOut(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.cost": $(event.currentTarget)[0].value});
    }

    async _onItemStarterClick(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.starter": $(event.currentTarget)[0].checked});
    }
}

class NpcSheet extends DarkHeresySheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "actor"],
            template: "systems/liber-imperium/template/sheet/actor/npc.hbs",
            width: 700,
            height: 881,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (this.actor.isOwner) {
            buttons = [].concat(buttons);
        }
        return buttons;
    }

    getData() {
        const data = super.getData();
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".item-cost").focusout(async ev => { await this._onItemCostFocusOut(ev); });
        html.find(".item-starter").click(async ev => { await this._onItemStarterClick(ev); });
    }

    async _onItemCostFocusOut(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.cost": $(event.currentTarget)[0].value});
    }

    async _onItemStarterClick(event) {
        event.preventDefault();
        const div = $(event.currentTarget).parents(".item");
        let item = this.actor.items.get(div.data("itemId"));
        item.update({"system.starter": $(event.currentTarget)[0].checked});
    }
}

class DarkHeresyItemSheet extends ItemSheet {
    activateListeners(html) {
        super.activateListeners(html);
        html.find("input").focusin(ev => this._onFocusIn(ev));
    }

    async getData() {
        const data = await super.getData();
        data.enrichment = await this._handleEnrichment();
        data.system = data.data.system;
        return data;
    }

    async _handleEnrichment() {
        let enrichment ={};
        enrichment["system.description"] = await TextEditor.enrichHTML(this.item.system.description, {async: true});
        enrichment["system.effect"] = await TextEditor.enrichHTML(this.item.system.effect, {async: true});
        return foundry.utils.expandObject(enrichment);
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [
            {
                label: game.i18n.localize("BUTTON.POST_ITEM"),
                class: "item-post",
                icon: "fas fa-comment",
                onclick: ev => this.item.sendToChat()
            }
        ].concat(buttons);
        return buttons;
    }

    _onFocusIn(event) {
        $(event.currentTarget).select();
    }
}

class WeaponSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "weapon"],
            template: "systems/liber-imperium/template/sheet/weapon.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class AmmunitionSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "ammunition"],
            template: "systems/liber-imperium/template/sheet/ammunition.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class WeaponModificationSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "weapon-modification"],
            template: "systems/liber-imperium/template/sheet/weapon-modification.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ArmourSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "armour"],
            template: "systems/liber-imperium/template/sheet/armour.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ForceFieldSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "force-field"],
            template: "systems/liber-imperium/template/sheet/force-field.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class CyberneticSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "cybernetic"],
            template: "systems/liber-imperium/template/sheet/cybernetic.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class DrugSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "drug"],
            template: "systems/liber-imperium/template/sheet/drug.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class GearSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "gear"],
            template: "systems/liber-imperium/template/sheet/gear.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class ToolSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "tool"],
            template: "systems/liber-imperium/template/sheet/tool.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class CriticalInjurySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "critical-injury"],
            template: "systems/liber-imperium/template/sheet/critical-injury.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MalignancySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "malignancy"],
            template: "systems/liber-imperium/template/sheet/malignancy.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MentalDisorderSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "mental-disorder"],
            template: "systems/liber-imperium/template/sheet/mental-disorder.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class MutationSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "mutation"],
            template: "systems/liber-imperium/template/sheet/mutation.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class PsychicPowerSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "psychic-power"],
            template: "systems/liber-imperium/template/sheet/psychic-power.hbs",
            width: 500,
            height: 397,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class TalentSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "talent"],
            template: "systems/liber-imperium/template/sheet/talent.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class SpecialAbilitySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "special-ability"],
            template: "systems/liber-imperium/template/sheet/special-ability.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class TraitSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "trait"],
            template: "systems/liber-imperium/template/sheet/trait.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        buttons = [].concat(buttons);
        return buttons;
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}

class AptitudeSheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["liber-imperium", "sheet", "aptitude"],
            template: "systems/liber-imperium/template/sheet/aptitude.hbs",
            width: 500,
            height: 369,
            resizable: false,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "stats"
                }
            ]
        });
    }
}

const initializeHandlebars = () => {
    registerHandlebarsHelpers();
    preloadHandlebarsTemplates();
};

/**
 * Define a set of template paths to pre-load. Pre-loaded templates are compiled and cached for fast access when
 * rendering. These paths will also be available as Handlebars partials by using the file name.
 * @returns {Promise}
 */
function preloadHandlebarsTemplates() {
    const templatePaths = [
        "systems/liber-imperium/template/sheet/actor/acolyte.hbs",
        "systems/liber-imperium/template/sheet/actor/npc.hbs",
        "systems/liber-imperium/template/sheet/actor/limited-sheet.hbs",

        "systems/liber-imperium/template/sheet/actor/tab/abilities.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/combat.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/gear.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/notes.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/npc-notes.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/npc-stats.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/progression.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/psychic-powers.hbs",
        "systems/liber-imperium/template/sheet/actor/tab/stats.hbs",

        "systems/liber-imperium/template/sheet/mental-disorder.hbs",
        "systems/liber-imperium/template/sheet/aptitude.hbs",
        "systems/liber-imperium/template/sheet/malignancy.hbs",
        "systems/liber-imperium/template/sheet/mutation.hbs",
        "systems/liber-imperium/template/sheet/talent.hbs",
        "systems/liber-imperium/template/sheet/trait.hbs",
        "systems/liber-imperium/template/sheet/special-ability.hbs",
        "systems/liber-imperium/template/sheet/psychic-power.hbs",
        "systems/liber-imperium/template/sheet/critical-injury.hbs",
        "systems/liber-imperium/template/sheet/weapon.hbs",
        "systems/liber-imperium/template/sheet/armour.hbs",
        "systems/liber-imperium/template/sheet/gear.hbs",
        "systems/liber-imperium/template/sheet/drug.hbs",
        "systems/liber-imperium/template/sheet/tool.hbs",
        "systems/liber-imperium/template/sheet/cybernetic.hbs",
        "systems/liber-imperium/template/sheet/weapon-modification.hbs",
        "systems/liber-imperium/template/sheet/ammunition.hbs",
        "systems/liber-imperium/template/sheet/force-field.hbs",

        "systems/liber-imperium/template/sheet/characteristics/information.hbs",
        "systems/liber-imperium/template/sheet/characteristics/left.hbs",
        "systems/liber-imperium/template/sheet/characteristics/name.hbs",
        "systems/liber-imperium/template/sheet/characteristics/right.hbs",
        "systems/liber-imperium/template/sheet/characteristics/total.hbs",

        "systems/liber-imperium/template/chat/item.hbs",
        "systems/liber-imperium/template/chat/roll.hbs",
        "systems/liber-imperium/template/chat/damage.hbs",
        "systems/liber-imperium/template/chat/critical.hbs",
        "systems/liber-imperium/template/chat/evasion.hbs",
        "systems/liber-imperium/template/chat/emptyMag.hbs",

        "systems/liber-imperium/template/dialog/common-roll.hbs",
        "systems/liber-imperium/template/dialog/combat-roll.hbs",
        "systems/liber-imperium/template/dialog/psychic-power-roll.hbs"
    ];
    return loadTemplates(templatePaths);
}

/**
 * Add custom Handlerbars helpers.
 */
function registerHandlebarsHelpers() {
    Handlebars.registerHelper("removeMarkup", function(text) {
        const markup = /<(.*?)>/gi;
        return text.replace(markup, "");
    });

    Handlebars.registerHelper("enrich", function(string) {
        return TextEditor.enrichHTML(string, {async: false});
    });

    Handlebars.registerHelper("damageTypeLong", function(damageType) {
        damageType = (damageType || "i").toLowerCase();
        switch (damageType) {
            case "e":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY");
            case "i":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
            case "r":
                return game.i18n.localize("DAMAGE_TYPE.RENDING");
            case "x":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT");
        }
    });


    Handlebars.registerHelper("damageTypeShort", function(damageType) {
        switch (damageType) {
            case "energy":
                return game.i18n.localize("DAMAGE_TYPE.ENERGY_SHORT");
            case "impact":
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
            case "rending":
                return game.i18n.localize("DAMAGE_TYPE.RENDING_SHORT");
            case "explosive":
                return game.i18n.localize("DAMAGE_TYPE.EXPLOSIVE_SHORT");
            default:
                return game.i18n.localize("DAMAGE_TYPE.IMPACT_SHORT");
        }
    });

    Handlebars.registerHelper("config", function(key) {
        return game.darkHeresy.config[key];
    });

}

const migrateWorld = async () => {
    const schemaVersion = 6;
    const worldSchemaVersion = Number(game.settings.get("liber-imperium", "worldSchemaVersion"));
    if (worldSchemaVersion !== schemaVersion && game.user.isGM) {
        ui.notifications.info("Upgrading the world, please wait...");
        for (let actor of game.actors.contents) {
            try {
                const update = migrateActorData(actor, worldSchemaVersion);
                if (!isObjectEmpty(update)) {
                    await actor.update(update, {enforceTypes: false});
                }
            } catch(e) {
                console.error(e);
            }
        }
        for (let pack of
            game.packs.filter(p => p.metadata.package === "world" && ["Actor"].includes(p.metadata.type))) {
            await migrateCompendium(pack, worldSchemaVersion);
        }
        game.settings.set("liber-imperium", "worldSchemaVersion", schemaVersion);
        ui.notifications.info("Upgrade complete!");
    }
};

const migrateActorData = (actor, worldSchemaVersion) => {
    const update = {};
    if (worldSchemaVersion < 1) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {
            actor.data.skills.psyniscience.characteristics = ["Per", "WP"];
            update["system.skills.psyniscience"] = actor.data.data.skills.psyniscience;
        }
    }
    if (worldSchemaVersion < 2) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {

            let characteristic = actor.data.characteristics.intelligence.base;
            let advance = -20;
            let total = characteristic.total + advance;

            actor.data.data.skills.forbiddenLore.specialities.officioAssassinorum = {
                label: "Officio Assassinorum",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.pirates = {
                label: "Pirates",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.psykers = {
                label: "Psykers",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.theWarp = {
                label: "The Warp",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            actor.data.data.skills.forbiddenLore.specialities.xenos = {
                label: "Xenos",
                isKnown: false,
                advance: advance,
                total: total,
                cost: 0
            };
            update["system.skills.forbiddenLore"] = actor.data.data.skills.forbiddenLore;
        }

    }

    // // migrate aptitudes
    if (worldSchemaVersion < 4) {
        if (actor.data.type === "acolyte" || actor.data.type === "npc") {

            let textAptitudes = actor.data.data?.aptitudes;

            if (textAptitudes !== null && textAptitudes !== undefined) {
                let aptitudeItemsData =
                    Object.values(textAptitudes)
                    // Be extra careful and filter out bad data because the existing data is bugged
                        ?.filter(textAptitude =>
                            "id" in textAptitude
                        && textAptitude?.name !== null
                        && textAptitude?.name !== undefined
                        && typeof textAptitude?.name === "string"
                        && 0 !== textAptitude?.name?.trim().length)
                        ?.map(textAptitude => {
                            return {
                                name: textAptitude.name,
                                type: "aptitude",
                                isAptitude: true,
                                img: "systems/liber-imperium/asset/icons/aptitudes/aptitude400.png"
                            };
                        });
                if (aptitudeItemsData !== null && aptitudeItemsData !== undefined) {
                    actor.createEmbeddedDocuments("Item", [aptitudeItemsData]);
                }
            }
            update["system.-=aptitudes"] = null;
        }
    }
    if (worldSchemaVersion < 3) {
        actor.prepareData();
        update["system.armour"] = actor.data.armour;
    }

    if (worldSchemaVersion < 5) {
        actor.prepareData();
        let experience = actor.data.data?.experience;
        let value = (experience?.value || 0) + (experience?.totalspent || 0);
        // In case of an Error in the calculation don't do anything loosing data is worse
        // than doing nothing in this case since the user can easily do this himself
        if (!isNaN(value) && value !== undefined) {
            update["system.experience.value"] = value;
        }
    }

    if (worldSchemaVersion < 6) {
        actor.prepareData();
        if (actor.type === "npc") {
            if (actor.system.bio?.notes) {
                actor.system.notes = actor.system.bio.notes;
            }
        }
    }

    return update;
};

/**
 * Migrate Data in Compendiums
 * @param {CompendiumCollection} pack
 * @param {number} worldSchemaVersion
 * @returns {Promise<void>}
 */
const migrateCompendium = async function(pack, worldSchemaVersion) {
    const entity = pack.metadata.type;

    await pack.migrate();
    const content = await pack.getContent();

    for (let ent of content) {
        let updateData = {};
        if (entity === "Actor") {
            updateData = migrateActorData(ent, worldSchemaVersion);
        }
        if (!isObjectEmpty(updateData)) {
            foundry.utils.expandObject(updateData);
            updateData._id = ent.id;
            await pack.updateEntity(updateData);
        }
    }
};

/**
 * Listeners for Chatmessages
 * @param {HTMLElement} html
 */
function chatListeners(html) {
    html.on("click", ".invoke-test", onTestClick.bind(this));
    html.on("click", ".invoke-damage", onDamageClick.bind(this));
    html.on("click", ".reload-Weapon", onReloadClick.bind(this));
    html.on("dblclick", ".liber-imperium.chat.roll>.background.border", onChatRollClick.bind(this));
}

/**
 * This function is used to hook into the Chat Log context menu to add additional options to each message
 * These options make it easy to conveniently apply damage to controlled tokens based on the value of a Roll
 *
 * @param {HTMLElement} html    The Chat Message being rendered
 * @param {Array} options       The Array of Context Menu options
 *
 * @returns {Array}              The extended options Array including new context choices
 */
const addChatMessageContextOptions = function(html, options) {
    let canApply = li => {
        const message = game.messages.get(li.data("messageId"));
        return message.getRollData()?.flags.isDamageRoll
            && message.isContentVisible
            && canvas.tokens.controlled.length;
    };
    options.push(
        {
            name: game.i18n.localize("CHAT.CONTEXT.APPLY_DAMAGE"),
            icon: '<i class="fas fa-user-minus"></i>',
            condition: canApply,
            callback: li => applyChatCardDamage(li)
        }
    );

    let canReroll = li => {
        const message = game.messages.get(li.data("messageId"));
        let actor = game.actors.get(message.getRollData()?.ownerId);
        return message.isRoll
            && !message.getRollData()?.flags.isDamageRoll
            && message.isContentVisible
            && actor?.fate.value > 0;
    };

    options.push(
        {
            name: game.i18n.localize("CHAT.CONTEXT.REROLL"),
            icon: '<i class="fa-solid fa-repeat"></i>',
            condition: canReroll,
            callback: li => {
                const message = game.messages.get(li.data("messageId"));
                rerollTest(message.getRollData());
            }
        }
    );
    return options;
};

/**
 * Apply rolled dice damage to the token or tokens which are currently controlled.
 * This allows for damage to be scaled by a multiplier to account for healing, critical hits, or resistance
 *
 * @param {HTMLElement} roll    The chat entry which contains the roll data
 * @param {number} multiplier   A damage multiplier to apply to the rolled damage.
 * @returns {Promise}
 */
function applyChatCardDamage(roll, multiplier) {
    // Get the damage data, get them as arrays in case of multiple hits
    const amount = roll.find(".damage-total");
    const location = roll.find(".damage-location");
    const penetration = roll.find(".damage-penetration");
    const type = roll.find(".damage-type");
    const righteousFury = roll.find(".damage-righteous-fury");

    // Put the data from different hits together
    const damages = [];
    for (let i = 0; i < amount.length; i++) {
        damages.push({
            amount: $(amount[i]).text(),
            location: $(location[i]).data("location"),
            penetration: $(penetration[i]).text(),
            type: $(type[i]).text(),
            righteousFury: $(righteousFury[i]).text()
        });
    }

    // Apply to any selected actors
    return Promise.all(canvas.tokens.controlled.map(t => {
        const a = t.actor;
        return a.applyDamage(damages);
    }));
}

/**
 * Rerolls the Test using the same Data as the initial Roll while reducing an actors fate
 * @param {object} rollData
 * @returns {Promise}
 */
function rerollTest(rollData) {
    let actor = game.actors.get(rollData.ownerId);
    actor.update({ "system.fate.value": actor.fate.value -1 });
    delete rollData.damages; // Reset so no old data is shown on failure

    rollData.flags.isReRoll = true;
    if (rollData.flags.isCombatRoll) {
    // All the regexes in this are broken once retrieved from the chatmessage
    // No idea why this happens so we need to fetch them again so the roll works correctly
        rollData.attributeBoni = actor.attributeBoni;
        return combatRoll(rollData);
    } else {
        return commonRoll(rollData);
    }
}

/**
 * Rolls a Test for the Selected Actor
 * @param {Event} ev
 */
function onTestClick(ev) {
    let actor = game.macro.getActor();
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let rollData = msg.getRollData();

    if (!actor) {
        ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);
        return;
    }
    let evasions = {
        dodge: DarkHeresyUtil.createSkillRollData(actor, "dodge"),
        parry: DarkHeresyUtil.createSkillRollData(actor, "parry"),
        deny: DarkHeresyUtil.createCharacteristicRollData(actor, "willpower"),
        selected: "dodge"
    };
    rollData.evasions = evasions;
    rollData.target.modifier = 0;
    rollData.flags.isEvasion = true;
    rollData.flags.isAttack = false;
    rollData.flags.isDamageRoll = false;
    rollData.flags.isCombatRoll = false;
    if (rollData.psy) rollData.psy.display = false;
    rollData.name = game.i18n.localize("DIALOG.EVASION");
    prepareCommonRoll(rollData);
}

/**
 * Rolls an Evasion chat for the currently selected character from the chatcard
 * @param {Event} ev
 * @returns {Promise}
 */
function onDamageClick(ev) {
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let rollData = msg.getRollData();
    rollData.flags.isEvasion = false;
    rollData.flags.isCombatRoll = false;
    rollData.flags.isDamageRoll = true;
    return damageRoll(rollData);
}

/**
 * Reloads the associated weapon who is empty Without considering ammo in the users inventory
 * @param {Event} ev
 */
async function onReloadClick(ev) {
    let id = $(ev.currentTarget).parents(".message").attr("data-message-id");
    let msg = game.messages.get(id);
    let rollData = msg.getRollData();
    let weapon = game.actors.get(rollData.ownerId)?.items?.get(rollData.itemId);
    await weapon.update({"system.clip.value": rollData.weapon.clip.max});
}

/**
 * Show/hide dice rolls when a chat message is clicked.
 * @param {Event} event
 */
function onChatRollClick(event) {
    event.preventDefault();
    let roll = $(event.currentTarget.parentElement);
    let tip = roll.find(".dice-rolls");
    if ( !tip.is(":visible") ) tip.slideDown(200);
    else tip.slideUp(200);
}

class DhMacroUtil {

    static async createMacro(data, slot)
    {
    // Create item macro if rollable item - weapon, spell, prayer, trait, or skill
        let document = await fromUuid(data.uuid);
        let macro;
        if (document.documentName === "Item") {
            let command = `game.macro.rollAttack("${document.name}", "${document.type}");`;
            macro = game.macros.contents.find(m => (m.name === document.name) && (m.command === command));
            if (!macro) {
                macro = await Macro.create({
                    name: document.name,
                    type: "script",
                    img: document.img,
                    command: command
                }, { displaySheet: false });
            }
        }
        else if (document.documentName === "Actor") {
            macro = await Macro.create({
                name: document.name,
                type: "script",
                img: document.img,
                command: `game.actors.get("${document.id}").sheet.render(true)`
            }, { displaySheet: false });
        }
        if (macro) game.user.assignHotbarMacro(macro, slot);
    }

    static rollAttack(itemName, itemType) {
        let actor = this.getActor();

        if (!actor) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);

        let item = actor.items.find(i => i.name === itemName && i.type === itemType);

        if (!item) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ITEM_NOT_FOUND")} ${itemName}`);

        if (item.isPsychicPower) {
            this.rollPsychicPower(actor, item);
        }
        if (item.isWeapon) {
            this.rollWeapon(actor, item);
        }
    }

    static rollTest(name, type, specialty) {
        let actor = this.getActor();

        if (!actor) return ui.notifications.warn(`${game.i18n.localize("NOTIFICATION.MACRO_ACTOR_NOT_FOUND")}`);

        let rollData;

        if (specialty) {
            rollData = DarkHeresyUtil.createSpecialtyRollData(actor, name, specialty);
        } else if (type === "skill") {
            rollData = DarkHeresyUtil.createSkillRollData(actor, name);
        } else if (name === "fear") {
            rollData = DarkHeresyUtil.createFearTestRolldata(actor);
        } else if (name === "malignancy") {
            rollData = DarkHeresyUtil.createMalignancyTestRolldata(actor);
        } else if (name === "trauma") {
            rollData = DarkHeresyUtil.createTraumaTestRolldata(actor);
        } else {
            rollData = DarkHeresyUtil.createCharacteristicRollData(actor, name);
        }
        prepareCommonRoll(rollData);
    }

    static rollPsychicPower(actor, item) {
        let rollData = DarkHeresyUtil.createPsychicRollData(actor, item);
        preparePsychicPowerRoll(rollData);
    }

    static rollWeapon(actor, item) {
        let rollData = DarkHeresyUtil.createWeaponRollData(actor, item);
        prepareCombatRoll(rollData);
    }

    static getActor() {
        const speaker = ChatMessage.getSpeaker();
        let actor;

        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);

        return actor;
    }
}

let Dh = {};

Dh.attackType = {};

Dh.attackTypeRanged = {
    none: "ATTACK_TYPE.NONE",
    standard: "ATTACK_TYPE.STANDARD",
    semi_auto: "ATTACK_TYPE.SEMI_AUTO",
    full_auto: "ATTACK_TYPE.FULL_AUTO",
    called_shot: "ATTACK_TYPE.CALLED_SHOT"
};

Dh.attackTypeMelee = {
    none: "ATTACK_TYPE.NONE",
    standard: "ATTACK_TYPE.STANDARD",
    charge: "ATTACK_TYPE.CHARGE",
    swift: "ATTACK_TYPE.SWIFT",
    lightning: "ATTACK_TYPE.LIGHTNING",
    allOut: "ATTACK_TYPE.ALLOUT",
    called_shot: "ATTACK_TYPE.CALLED_SHOT"
};

Dh.attackTypePsy = {
    none: "ATTACK_TYPE.NONE",
    bolt: "PSYCHIC_POWER.BOLT",
    barrage: "PSYCHIC_POWER.BARRAGE",
    storm: "PSYCHIC_POWER.STORM",
    blast: "PSYCHIC_POWER.BLAST"
};

Dh.ranges = {
    0: "RANGE.NONE",
    30: "RANGE.POINT_BLANK",
    10: "RANGE.SHORT",
    "-10": "RANGE.LONG",
    "-30": "RANGE.EXTREME"
};

Dh.damageTypes = {
    energy: "DAMAGE_TYPE.ENERGY",
    impact: "DAMAGE_TYPE.IMPACT",
    rending: "DAMAGE_TYPE.RENDING",
    explosive: "DAMAGE_TYPE.EXPLOSIVE"
};

Dh.aimModes = {
    0: "AIMING.NONE",
    10: "AIMING.HALF",
    20: "AIMING.FULL"
};

Dh.evasions = {
    dodge: "SKILL.DODGE",
    parry: "SKILL.PARRY",
    deny: "DIALOG.DENY_THE_WITCH"
};

Dh.craftmanship = {
    poor: "CRAFTSMANSHIP.POOR",
    common: "CRAFTSMANSHIP.COMMON",
    good: "CRAFTSMANSHIP.GOOD",
    best: "CRAFTSMANSHIP.BEST"
};

Dh.availability = {
    ubiquitous: "AVAILABILITY.UBIQUITOUS",
    abundant: "AVAILABILITY.ABUNDANT",
    plentiful: "AVAILABILITY.PLENTIFUL",
    common: "AVAILABILITY.COMMON",
    average: "AVAILABILITY.AVERAGE",
    scarce: "AVAILABILITY.SCARCE",
    rare: "AVAILABILITY.RARE",
    "very-rare": "AVAILABILITY.VERY_RARE",
    "extremely-rare": "AVAILABILITY.EXTREMELY_RARE",
    "near-unique": "AVAILABILITY.NEAR_UNIQUE",
    unique: "AVAILABILITY.UNIQUE"
};


Dh.armourTypes = {
    basic: "ARMOUR_TYPE.BASIC",
    flak: "ARMOUR_TYPE.FLAK",
    mesh: "ARMOUR_TYPE.MESH",
    carapace: "ARMOUR_TYPE.CARAPACE",
    power: "ARMOUR_TYPE.POWER"
};

Dh.weaponType = {
    las: "WEAPON.LAS",
    solidprojectile: "WEAPON.SOLIDPROJECTILE",
    bolt: "WEAPON.BOLT",
    melta: "WEAPON.MELTA",
    plasma: "WEAPON.PLASMA",
    flame: "WEAPON.FLAME",
    lowtech: "WEAPON.LOWTECH",
    launcher: "WEAPON.LAUNCHER",
    explosive: "WEAPON.EXPLOSIVE",
    exotic: "WEAPON.EXOTIC",
    chain: "WEAPON.CHAIN",
    power: "WEAPON.POWER",
    shock: "WEAPON.SHOCK",
    force: "WEAPON.FORCE"
};

Dh.weaponClass = {
    melee: "WEAPON.MELEE",
    thrown: "WEAPON.THROWN",
    pistol: "WEAPON.PISTOL",
    basic: "WEAPON.BASIC",
    heavy: "WEAPON.HEAVY",
    launched: "WEAPON.LAUNCHED",
    placed: "WEAPON.PLACED",
    vehicle: "WEAPON.VEHICLE"
};

Dh.psykerClass = {
    bound: "PSYCHIC_POWER.BOUND",
    unbound: "PSYCHIC_POWER.UNBOUND",
    daemonic: "PSYCHIC_POWER.DAEMONIC"
};

Dh.advanceStagesCharacteristics = {
    0: "ADVANCE.NONE",
    5: "ADVANCE.SIMPLE",
    10: "ADVANCE.INTERMEDIATE",
    15: "ADVANCE.TRAINED",
    20: "ADVANCE.PROFICIENT",
    25: "ADVANCE.EXPERT"
};

Dh.advanceStagesSkills = {
    "-20": "ADVANCE.UNTRAINED",
    0: "ADVANCE.KNOWN",
    10: "ADVANCE.TRAINED",
    20: "ADVANCE.EXPERIENCED",
    30: "ADVANCE.VETERAN"
};

Dh.characteristicCosts = [
    [0, 0, 0],
    [100, 250, 500],
    [250, 500, 750],
    [500, 750, 1000],
    [750, 1000, 1500],
    [1250, 1500, 2500]];

Dh.talentCosts = [[200, 300, 600], [300, 450, 900], [400, 600, 1200]];

Dh.hitLocations = {
    head: "ARMOUR.HEAD",
    leftArm: "ARMOUR.LEFT_ARM",
    rightArm: "ARMOUR.RIGHT_ARM",
    body: "ARMOUR.BODY",
    leftLeg: "ARMOUR.LEFT_LEG",
    rightLeg: "ARMOUR.RIGHT_LEG"
};

CONFIG.statusEffects = [
    {
        id: "bleeding",
        label: "CONDITION.BLEEDING",
        icon: "systems/liber-imperium/asset/icons/bleeding.png"
    },
    {
        id: "blinded",
        label: "CONDITION.BLINDED",
        icon: "systems/liber-imperium/asset/icons/blinded.png"
    },
    {
        id: "deafened",
        label: "CONDITION.DEAFEND",
        icon: "systems/liber-imperium/asset/icons/deafened.png"
    },
    {
        id: "fear",
        label: "CONDITION.FEAR",
        icon: "systems/liber-imperium/asset/icons/fear.png"
    },
    {
        id: "fire",
        label: "CONDITION.FIRE",
        icon: "systems/liber-imperium/asset/icons/flame.png"
    },
    {
        id: "grappled",
        label: "CONDITION.GRAPPLED",
        icon: "systems/liber-imperium/asset/icons/grappled.png"
    },
    {
        id: "hidden",
        label: "CONDITION.HIDDEN",
        icon: "systems/liber-imperium/asset/icons/hidden.png"
    },
    {
        id: "pinned",
        label: "CONDITION.PINNED",
        icon: "systems/liber-imperium/asset/icons/pinning.png"
    },
    {
        id: "poisond",
        label: "CONDITION.POISONED",
        icon: "systems/liber-imperium/asset/icons/poisoned.png"
    },
    {
        id: "prone",
        label: "CONDITION.PRONE",
        icon: "systems/liber-imperium/asset/icons/prone.png"
    },
    {
        id: "stunned",
        label: "CONDITION.STUNNED",
        icon: "systems/liber-imperium/asset/icons/stunned.png"
    },
    {
        id: "unconscious",
        label: "CONDITION.UNCONSCIOUS",
        icon: "systems/liber-imperium/asset/icons/unconscious.png"
    },
    {
        id: "dead",
        label: "EFFECT.StatusDead", // Foundry Default Text Key
        icon: "systems/liber-imperium/asset/icons/dead.png"
    }
];

Hooks.once("init", function() {
    CONFIG.Combat.initiative = { formula: "@initiative.base + @initiative.bonus", decimals: 0 };
    CONFIG.Actor.documentClass = DarkHeresyActor;
    CONFIG.Item.documentClass = DarkHeresyItem;
    CONFIG.fontDefinitions["Caslon Antique"] = {editor: true, fonts: []};
    game.darkHeresy = {
        config: Dh,
        testInit: {
            prepareCommonRoll,
            prepareCombatRoll,
            preparePsychicPowerRoll
        },
        tests: {
            commonRoll,
            combatRoll
        }
    };
    game.macro = DhMacroUtil;
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("liber-imperium", AcolyteSheet, { types: ["acolyte"], makeDefault: true });
    Actors.registerSheet("liber-imperium", NpcSheet, { types: ["npc"], makeDefault: true });
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("liber-imperium", WeaponSheet, { types: ["weapon"], makeDefault: true });
    Items.registerSheet("liber-imperium", AmmunitionSheet, { types: ["ammunition"], makeDefault: true });
    Items.registerSheet("liber-imperium", WeaponModificationSheet, { types: ["weaponModification"], makeDefault: true });
    Items.registerSheet("liber-imperium", ArmourSheet, { types: ["armour"], makeDefault: true });
    Items.registerSheet("liber-imperium", ForceFieldSheet, { types: ["forceField"], makeDefault: true });
    Items.registerSheet("liber-imperium", CyberneticSheet, { types: ["cybernetic"], makeDefault: true });
    Items.registerSheet("liber-imperium", DrugSheet, { types: ["drug"], makeDefault: true });
    Items.registerSheet("liber-imperium", GearSheet, { types: ["gear"], makeDefault: true });
    Items.registerSheet("liber-imperium", ToolSheet, { types: ["tool"], makeDefault: true });
    Items.registerSheet("liber-imperium", CriticalInjurySheet, { types: ["criticalInjury"], makeDefault: true });
    Items.registerSheet("liber-imperium", MalignancySheet, { types: ["malignancy"], makeDefault: true });
    Items.registerSheet("liber-imperium", MentalDisorderSheet, { types: ["mentalDisorder"], makeDefault: true });
    Items.registerSheet("liber-imperium", MutationSheet, { types: ["mutation"], makeDefault: true });
    Items.registerSheet("liber-imperium", PsychicPowerSheet, { types: ["psychicPower"], makeDefault: true });
    Items.registerSheet("liber-imperium", TalentSheet, { types: ["talent"], makeDefault: true });
    Items.registerSheet("liber-imperium", SpecialAbilitySheet, { types: ["specialAbility"], makeDefault: true });
    Items.registerSheet("liber-imperium", TraitSheet, { types: ["trait"], makeDefault: true });
    Items.registerSheet("liber-imperium", AptitudeSheet, { types: ["aptitude"], makeDefault: true });

    initializeHandlebars();

    game.settings.register("liber-imperium", "worldSchemaVersion", {
        name: "World Version",
        hint: "Used to automatically upgrade worlds data when the system is upgraded.",
        scope: "world",
        config: true,
        default: 0,
        type: Number
    });
    game.settings.register("liber-imperium", "autoCalcXPCosts", {
        name: "Calculate XP Costs",
        hint: "If enabled, calculate XP costs automatically.",
        scope: "world",
        config: true,
        default: false,
        type: Boolean
    });
    game.settings.register("liber-imperium", "useSpraytemplate", {
        name: "Use Template with Spray Weapons",
        hint: "If enabled, Spray Weapons will require the user to put down a template before the roll is made. Templates are NOT removed automatically",
        scope: "client",
        config: true,
        default: true,
        type: Boolean
    });

});

Hooks.once("ready", function() {
    migrateWorld();
    CONFIG.ChatMessage.documentClass.prototype.getRollData = function() {
        return this.getFlag("liber-imperium", "rollData");
    };
});


/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */

/** Add Event Listeners for Buttons on chat boxes */
Hooks.once("renderChatLog", (chat, html) => {
    chatListeners(html);
});

/** Add Options to context Menu of chatmessages */
Hooks.on("getChatLogEntryContext", addChatMessageContextOptions);

/**
 * Create a macro when dropping an entity on the hotbar
 * Item      - open roll dialog for item
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type === "Item" || data.type === "Actor")
    {
        DhMacroUtil.createMacro(data, slot);
        return false;
    }
});

Hooks.on("renderDarkHeresySheet", (sheet, html, data) => {
    html.find("input.cost").prop("disabled", game.settings.get("liber-imperium", "autoCalcXPCosts"));
    html.find(":not(.psychic-power) > input.item-cost").prop("disabled", game.settings.get("liber-imperium", "autoCalcXPCosts"));
});
