import { OpenChest, goToChest, getContainerCapacity } from "./chests.js";

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
         * Chests that are (or were) assumed to be empty. They are the
         * candidates for storing items.
         * @type {import("prismarine-block").Block[]}
         */
        this.emptyChests = [];
        /**
         * Chests that are (or were) assumed to not be empty (they contain
         * items). They are the candidates for obtaining items.
         * @type {import("prismarine-block").Block[]}
         */
        this.chestsWithSpace = [];

        if (asume_init == "empty") {
            this.emptyChests = [...this.chests];
        } else {
            this.chestsWithSpace = [...this.chests];
        }
    }

    /**
     * Opens the closest chest that still has free space to deposit items.
     *
     * Chests in this.emptyChests are tried (closest first). The real state is
     * only known once the chest is opened, so it is verified after opening it:
     * chests that turn out to be full are moved to this.chestsWithSpace.
     *
     * Chests that were partially filled by previous deposits stay in
     * this.emptyChests (they still have free space), so the next batches keep
     * filling the same chest before opening a new one — otherwise double
     * chests would be abandoned at half full.
     *
     * @returns {Promise<OpenChest | null>} The opened chest with free space, or null if there is none.
     */
    async openChestWithSpace() {
        return await this.openChestFulfilling(
            this.emptyChests,
            this.chestsWithSpace,
            (openchest) => !openchest.isFull(),
            "withSpace",
            "notEmpty"
        );
    }

    /**
     * Opens the closest chest that has items to take.
     *
     * Chests in this.chestsWithSpace are tried (closest first). The real state
     * is only known once the chest is opened, so it is verified after opening
     * it: chests that turn out to be empty are moved to this.emptyChests.
     *
     * @returns {Promise<OpenChest | null>} The opened chest with items, or null if there is none.
     */
    async openChestWithItems() {
        return await this.openChestFulfilling(
            this.chestsWithSpace,
            this.emptyChests,
            (openchest) => !openchest.isEmpty(),
            "withItems",
            "empty"
        );
    }

    /**
     * Records the state of a chest after depositing items into it.
     *
     * If the chest got full it is moved to this.chestsWithSpace (it is not
     * empty anymore, so it will not be used for storing again). If it still
     * has free space it is left in this.emptyChests, so the next batches
     * continue filling the same chest (e.g. half filled double chests).
     *
     * @param {OpenChest} openchest The opened chest that was used to deposit.
     * @param {boolean} full Whether the chest was full after the deposit.
     */
    updateChestAfterDeposit(openchest, full) {
        if (!full) return;

        const pos = openchest.position;

        this.emptyChests = this.emptyChests.filter((chest) => !chest.position.equals(pos));
        this.chestsWithSpace.push(openchest.chest);

        console.log(`[STORAGE] Chest at ${vec3ToString(pos)} is now full, moved to the "notEmpty" list`);
    }

    /**
     * Opens the chests of `candidates` (closest first) until one fulfills `fulfills`.
     *
     * The chests of `candidates` are assumed to fulfill the requirement, but the
     * real state can only be known once the chest is opened, so every chest is
     * verified after opening it. The chests that do not fulfill the requirement
     * are removed from `candidates` (so they are skipped on the next iterations)
     * and moved to `reclassifiedTo`, since their real state is now known.
     *
     * @param {import("prismarine-block").Block[]} candidates Chests assumed to fulfill the requirement.
     * @param {import("prismarine-block").Block[]} reclassifiedTo List where the chests that do not fulfill the requirement are moved to.
     * @param {(openchest: OpenChest) => boolean} fulfills Checks if an opened chest fulfills the requirement.
     * @param {string} requirement Name of the requirement, for log messages.
     * @param {string} reclassifiedName Name of the reclassifiedTo list, for log messages.
     * @returns {Promise<OpenChest | null>} The opened chest that fulfills the requirement, or null if there is none.
     */
    async openChestFulfilling(candidates, reclassifiedTo, fulfills, requirement, reclassifiedName) {
        // The bot moves around, so try the closest candidate first on every call
        // sortChestsByDistance(this.bot, candidates);

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
                const capacity = getContainerCapacity(openchest.container);
                const usedSlots = openchest.container.containerItems().length;
                console.log(`[STORAGE] Opened chest at ${vec3ToString(pos)} that fulfills "${requirement}" (${usedSlots}/${capacity} slots used, window type: ${openchest.container.type})`);
                return openchest;
            }

            // The chest does not fulfill the requirement: close it, remove it
            // from this list (it is skipped on the next iterations) and move it
            // to the other list, since its real state is now known
            openchest.close();
            await this.bot.waitForTicks(5);
            candidates.shift();
            reclassifiedTo.push(chest);

            console.log(`[STORAGE] Chest at ${vec3ToString(pos)} does not fulfill "${requirement}", moved to the "${reclassifiedName}" list`);
        }

        console.log(`[STORAGE] No chest left fulfills "${requirement}"`);
        return null;
    }
}
