import { OpenChest, goToChest } from "./chests.js";

/**
 * @param {import("vec3").Vec3} vec
 */
function vec3ToString(vec) {
    return `${vec.x},${vec.y},${vec.z}`;
}

/**
 * Sorts the chests in place from the closest to the furthest from the bot.
 * @param {import("mineflayer").Bot} bot
 * @param {import("prismarine-block").Block[]} chests
 */
function sortChestsByDistance(bot, chests) {
    chests.sort((a, b) =>
        bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position)
    );
}

export class StorageChests {
    /**
     * @param {import("mineflayer").Bot} bot
     * @param {import("prismarine-block").Block[]} chests
     * @param {"empty" | "withItems"} asume_init
     */
    constructor(bot, chests, asume_init) {
        this.bot = bot;
        this.chests = chests;

        // Sort this.chests by distance to bot.entity.position
        sortChestsByDistance(this.bot, this.chests);

        /**
         * @type {import("prismarine-block").Block[]}
         */
        this.emptyChests = [];
        /**
         * @type {import("prismarine-block").Block[]}
         */
        this.withItemsChests = [];

        if (asume_init == "empty") {
            this.emptyChests = [...this.chests];
        } else {
            this.withItemsChests = [...this.chests];
        }
    }

    /**
     * Opens chests from this.emptyChests (closest first) until one is really empty.
     *
     * Every chest on the list is only *assumed* to be empty: the real state can
     * only be known once the chest is opened, so each chest is checked after
     * opening it. Chests that turn out to not be empty are removed from this
     * list (skipped on the next iterations) and moved to this.withItemsChests.
     *
     * @returns {Promise<OpenChest | null>} The opened chest that is empty, or null if there is none.
     */
    async openEmptyChest() {
        return await this.openChestFulfilling(
            this.emptyChests,
            this.withItemsChests,
            (openchest) => openchest.isEmpty(),
            "empty"
        );
    }

    /**
     * Opens chests from this.withItemsChests (closest first) until one really has items.
     *
     * Every chest on the list is only *assumed* to have items: the real state can
     * only be known once the chest is opened, so each chest is checked after
     * opening it. Chests that turn out to be empty are removed from this list
     * (skipped on the next iterations) and moved to this.emptyChests.
     *
     * @returns {Promise<OpenChest | null>} The opened chest that has items, or null if there is none.
     */
    async openChestWithItems() {
        return await this.openChestFulfilling(
            this.withItemsChests,
            this.emptyChests,
            (openchest) => !openchest.isEmpty(),
            "withItems"
        );
    }

    /**
     * Opens the chests of `candidates` (closest first) until one fulfills `fulfills`.
     *
     * The chests of `candidates` are assumed to fulfill the requirement, but the
     * real state can only be checked once the chest is opened, so every chest is
     * verified after opening it. The chests that do not fulfill the requirement
     * are removed from `candidates` (so they are skipped on the next iterations)
     * and moved to `reclassifiedTo`, since their real state is now known.
     *
     * @param {import("prismarine-block").Block[]} candidates Chests assumed to fulfill the requirement.
     * @param {import("prismarine-block").Block[]} reclassifiedTo List where the chests that do not fulfill the requirement are moved to.
     * @param {(openchest: OpenChest) => boolean} fulfills Checks if an opened chest fulfills the requirement.
     * @param {string} requirement Name of the requirement, for log messages.
     * @returns {Promise<OpenChest | null>} The opened chest that fulfills the requirement, or null if there is none.
     */
    async openChestFulfilling(candidates, reclassifiedTo, fulfills, requirement) {
        // The bot moves around, so try the closest candidate first on every call
        sortChestsByDistance(this.bot, candidates);

        while (candidates.length > 0) {
            const chest = candidates[0];
            const pos = chest.position;

            if (!(await goToChest(this.bot, pos))) {
                console.log(`[STORAGE] Cannot reach chest at ${vec3ToString(pos)}, removing it from the "${requirement}" list`);
                candidates.shift();
                continue;
            }

            await this.bot.lookAt(pos);

            // The stored block can be stale, re-fetch it now that its chunk is loaded
            const block = this.bot.blockAt(pos);
            if (!block || !block.name.includes("chest")) {
                console.log(`[STORAGE] Block at ${vec3ToString(pos)} does not exist or is not a chest anymore, removing it from the "${requirement}" list`);
                candidates.shift();
                continue;
            }

            let openchest = null;
            let fulfillsRequirement = false;
            try {
                const container = await this.bot.openContainer(block);
                await this.bot.waitForTicks(10);
                openchest = new OpenChest(this.bot, block, container);

                // The chest was assumed to fulfill the requirement, but this
                // can only be known for sure once it is opened
                fulfillsRequirement = fulfills(openchest);
            } catch (err) {
                console.log(`[STORAGE] Cannot use chest at ${vec3ToString(pos)} (${err.message}), removing it from the "${requirement}" list`);
                if (openchest) openchest.close();
                candidates.shift();
                continue;
            }

            if (fulfillsRequirement) {
                console.log(`[STORAGE] Opened chest at ${vec3ToString(pos)} that fulfills "${requirement}"`);
                return openchest;
            }

            // The chest does not fulfill the requirement: close it, remove it
            // from this list (it is skipped on the next iterations) and move it
            // to the other list, since its real state is now known
            openchest.close();
            await this.bot.waitForTicks(5);
            candidates.shift();
            reclassifiedTo.push(chest);

            const otherListName = requirement === "empty" ? "withItems" : "empty";
            console.log(`[STORAGE] Chest at ${vec3ToString(pos)} does not fulfill "${requirement}", moved to the "${otherListName}" list`);
        }

        console.log(`[STORAGE] No chest left fulfills "${requirement}"`);
        return null;
    }
}
