import fs from "fs";
import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { findBlocks, isInside, parseCoord, TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1 } from "./coords.js";
import sleep from "./sleep.js";
import { Vec3 } from "vec3";

const { pathfinder, Movements, goals } = mineflayer_pathfinder;

export const MAX_RANGE_CHEST = 4;
export const CACHE_FILE = "cache.json";

/**
 * Formats a position as "(x, y, z)" for log messages.
 * @param {{ x: number, y: number, z: number }} pos
 * @returns {string}
 */
export function formatPos(pos) {
    return `(${pos.x}, ${pos.y}, ${pos.z})`;
}

export class OpenChest {
    /**
     * @param {import("mineflayer").Bot} bot
     * @param {import("prismarine-block").Block} chest
     * @param {import("mineflayer").Chest} container
     */
    constructor(bot, chest, container) {
        this.bot = bot;
        this.chest = chest;
        this.container = container;
    }

    get position() {
        return this.chest.position;
    }

    close() {
        this.container.close();
    }

    /**
     * Checks if the container has no items.
     * @returns {boolean}
     */
    isEmpty() {
        return this.container.containerItems().length === 0;
    }

    /**
     * Checks if the container has no empty slots left.
     * @returns {boolean}
     */
    isFull() {
        if (!this.container || !this.container.slots) return true;

        const capacity = getContainerCapacity(this.container);
        const chestSlots = this.container.slots.slice(0, capacity);

        return chestSlots.every((slot) => !!slot);
    }

    /**
     * Move to the bot inventory all items (until bot inventory is full or the container is empty)
     */
    async getAllItems() {
        const items = this.container.containerItems();

        for (let i = 0; i < items.length && this.bot.inventory.items().length < 36; i++) {
            const targetItem = items[i];
            const currentSlotItem = this.container.slots[targetItem.slot];

            if (!currentSlotItem) continue;

            try {
                await this.bot.clickWindow(targetItem.slot, 0, 1);
                if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
            } catch {
                try {
                    await this.container.withdraw(targetItem.type, null, targetItem.count);
                    if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
                } catch { }
            }
        }
    }

    /**
     * Move to the bot inventory all items (until bot inventory is full or the container is empty).
     * Only fills the 27 storage slots (main inventory, hotbar excluded), because the items
     * are later deposited into a temp chest that has only 27 slots, not 36.
     */
    async get27Items() {
        const items = this.container.containerItems();

        // bot.inventory.slots layout: 0-8 crafting/armor, 9-35 main inventory (27), 36-44 hotbar.
        const MAIN_INVENTORY_START = 9;
        const HOTBAR_START = 36;
        const MAX_STORAGE_STACKS = HOTBAR_START - MAIN_INVENTORY_START; // 27

        // bot.inventory.items() can be stale while a chest window is open, so instead of
        // re-reading it every iteration we take a one-time snapshot of the occupied main
        // slots BEFORE moving anything, and then keep count ourselves of how many stacks
        // were actually moved. moved can never exceed the free space there was at the start.
        const occupiedBefore = this.bot.inventory.slots.slice(MAIN_INVENTORY_START, HOTBAR_START).filter(Boolean).length;
        const freeSlots = Math.max(0, MAX_STORAGE_STACKS - occupiedBefore);
        let moved = 0;

        for (let i = 0; i < items.length && moved < freeSlots; i++) {
            const targetItem = items[i];
            const currentSlotItem = this.container.slots[targetItem.slot];

            if (!currentSlotItem) continue;

            try {
                await this.bot.clickWindow(targetItem.slot, 0, 1);
                if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
            } catch {
                try {
                    await this.container.withdraw(targetItem.type, null, targetItem.count);
                    if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
                } catch { }
            }

            moved++;
        }

        if (items.length > 0 && moved >= freeSlots) {
            console.log(`No space left in bot storage inventory (${occupiedBefore + moved}/${MAX_STORAGE_STACKS} stacks, hotbar excluded)`);
        }
    }

    /**
     * Move to the container all items (until bot inventory is empty or the container is full)
     */
    async depositAllItems() {
        for (let i = this.container.inventoryStart; i < this.container.inventoryEnd; i++) {
            const slotItem = this.container.slots[i];
            if (!slotItem) continue;
            if (slotItem.name === "ender_pearl") continue;
            if (this.isFull()) {
                console.log("No space left in container");
                break;
            }

            try {
                await this.bot.clickWindow(i, 0, 1);
                if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
            } catch {
                try {
                    await this.container.deposit(slotItem.type, null, slotItem.count);
                    if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
                } catch { break; }
            }
        }
    }

    /**
     * Picks a single item (not the full stack) from the specified container slot into the bot inventory.
     * @param {number} slot
     */
    async pickItem(slot) {
        const item = this.container.slots[slot];
        if (!item) {
            console.log("No item found at slot", slot);
            return;
        }

        await this.bot.clickWindow(slot, 0, 0);
        if (this.bot.waitForTicks) await this.bot.waitForTicks(2);

        const botSlots = this.container.slots.slice(this.container.inventoryStart, this.container.inventoryEnd);
        const emptySlot = botSlots.findIndex((s) => !s);

        if (emptySlot === -1) {
            await this.bot.clickWindow(slot, 0, 0);
            if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
            throw new Error("No empty bot inventory slot to pick a single item");
        }

        await this.bot.clickWindow(this.container.inventoryStart + emptySlot, 1, 0);
        if (this.bot.waitForTicks) await this.bot.waitForTicks(2);

        await this.bot.clickWindow(slot, 0, 0);
        if (this.bot.waitForTicks) await this.bot.waitForTicks(2);
    }

    /**
     * Sorts the container items from lowest to highest Item.type.
     */
    async sort() {
        await sortChest(this.bot, this.container);
    }
}

/**
 * Checks if the bot has items to deposit (excluding ender pearls).
 * @param {import("mineflayer").Bot} bot
 * @returns {boolean}
 */
export function hasItemsToDeposit(bot) {
    return bot.inventory.items().some(item => item && item.name !== "ender_pearl");
}

/**
 * Checks if the bot inventory has no items (or only ender pearls).
 * @param {import("mineflayer").Bot} bot
 * @returns {boolean}
 */
export function isBotInventoryEmpty(bot) {
    return !hasItemsToDeposit(bot);
}

/**
 * Calculates total item capacity of a chest container.
 * @param {import("mineflayer").Chest} container
 * @returns {number}
 */
export function getContainerCapacity(container) {
    if (!container || !container.type) return 27;
    const parts = container.type.split("_");
    if (parts.length > 1 && parts[1].includes("x")) {
        const [cols, rows] = parts[1].split("x").map(Number);
        if (!isNaN(cols) && !isNaN(rows)) return cols * rows;
    }
    return container.inventoryStart || 27;
}

/**
 * Finds solid floor block below chest position.
 * @param {import("mineflayer").Bot} bot
 * @param {import("prismarine-block").Block | import("vec3").Vec3} chest
 * @returns {import("prismarine-block").Block | null}
 */
export function findFloorBlock(bot, chest) {
    const pos = chest.position ?? chest;
    for (let i = 1; (pos.y - i) > -64; i++) {
        const block = bot.blockAt(new Vec3(pos.x, pos.y - i, pos.z));
        if (block && !block.name.includes("chest") && !block.name.includes("air")) {
            return block;
        }
    }
    return null;
}

/**
 * Navigates the bot towards a target chest block.
 * @param {import("mineflayer").Bot} bot
 * @param {import("prismarine-block").Block | import("vec3").Vec3} chest
 * @returns {Promise<boolean>}
 */
export async function goToChest(bot, chest) {
    const pos = chest.position ?? chest;
    const floorBlock = findFloorBlock(bot, pos);
    console.log(`[MOVE] Walking to chest at ${formatPos(pos)}`);

    if (floorBlock !== null && Math.abs(floorBlock.position.y - bot.entity.position.y) > 1.5) {
        console.log(`[MOVE] Chest is on a different level, going to floor block at ${formatPos(floorBlock.position)}`);
        try {
            await bot.pathfinder.goto(new goals.GoalNear(floorBlock.position.x, floorBlock.position.y, floorBlock.position.z, 1.5));
        } catch { }
    }

    try {
        await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, MAX_RANGE_CHEST));
        console.log(`[MOVE] Reached chest at ${formatPos(pos)}`);
        return true;
    } catch {
        console.log(`[MOVE] Cannot reach chest at ${formatPos(pos)}`);
        return false;
    }
}

/**
 * Checks if a block is a valid chest to store/obtain items (first half for double chests).
 * @param {import("prismarine-block").Block} block
 * @returns {boolean}
 */
export function isValidChestBlock(block) {
    return (
        (block.name === "chest" || block.name.includes("copper_chest") /* An example, you can add more types of chests */) &&
        block._properties && typeof block._properties.type === "string" &&
        (block._properties.type === "single" || block._properties.type === "right")
    );
}

/**
 * Finds all valid chests inside the area.
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} min
 * @param {import("vec3").Vec3} max
 * @returns {import("prismarine-block").Block[]}
 */
export function findChestsInArea(bot, min, max) {
    return findBlocks(bot, min, max, isValidChestBlock);
}

/**
 * Loads cached chest blocks from a cache file (JSON array of "x,y,z" strings, generated by cachebot.js).
 * Only positions inside the work area whose block is still a valid chest are returned.
 * @param {import("mineflayer").Bot} bot
 * @param {string} cachePath
 * @param {import("vec3").Vec3} min
 * @param {import("vec3").Vec3} max
 * @returns {import("prismarine-block").Block[]}
 */
export function readChestCache(bot, cachePath, min, max) {
    let positions;
    try {
        positions = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    } catch (err) {
        console.error(`[CACHE] Error reading ${cachePath}: ${err.message}`);
        return [];
    }

    if (!Array.isArray(positions)) {
        console.error(`[CACHE] Invalid cache format in ${cachePath} (expected an array of "x,y,z" strings)`);
        return [];
    }

    return positions
        .map((text) => {
            try {
                const pos = parseCoord(text);
                return isInside(min, max, pos) ? pos : null;
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .map((pos) => bot.blockAt(pos))
        .filter((block) => block && isValidChestBlock(block));
}

/**
 * Scan a region for chests, using a cache file when available.
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} min
 * @param {import("vec3").Vec3} max
 * @param {string | undefined} cachefile Cache file name/path ("cache1" or "cache2", ".json" is appended if missing)
 * @returns {Promise<import("prismarine-block").Block[]>}
 */
export async function ScanChests(bot, min, max, cachefile) {
    if (cachefile) {
        const cachePath = cachefile.endsWith(".json") ? cachefile : `${cachefile}.json`;

        if (fs.existsSync(cachePath)) {
            const cachedChests = readChestCache(bot, cachePath, min, max);

            if (cachedChests.length > 0) {
                console.log(`[CACHE] Using ${cachedChests.length} chest(s) from ${cachePath}`);
                return cachedChests;
            }

            console.error(`[CACHE] No valid chests found in ${cachePath}, scanning the work area...`);
        } else {
            console.error(`[CACHE] ${cachePath} not found, scanning the work area...`);
        }
    }

    const chests = findChestsInArea(bot, min, max);

    if (chests.length === 0) {
        console.error("Error: No valid drop chests found in the work area.");
        process.exit(1);
    }

    return chests;
}

/**
 * Sorts items inside a chest container from lowest to highest Item.type.
 * @param {import("mineflayer").Bot} bot
 * @param {import("mineflayer").Chest} container
 */
export async function sortChest(bot, container) {
    if (!container || !container.slots) return;

    const capacity = getContainerCapacity(container);

    const compareItems = (a, b) => {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        if (a.type !== b.type) {
            return a.type - b.type;
        }
        return b.count - a.count;
    };

    try {
        // Combine stacks, for example: [Diamond:32, Diamond:1, Diamond:4] => [Diamond:37]
        for (let i = 0; i < capacity; i++) {
            const itemI = container.slots[i];
            if (!itemI) continue;

            const maxStack = itemI.stackSize || 64;
            if (itemI.count >= maxStack) continue;

            for (let j = i + 1; j < capacity; j++) {
                const itemJ = container.slots[j];
                if (!itemJ || itemJ.type !== itemI.type) continue;

                await bot.clickWindow(j, 0, 0);
                await bot.waitForTicks(2);
                await bot.clickWindow(i, 0, 0);
                await bot.waitForTicks(2);

                if (container.selectedItem) {
                    await bot.clickWindow(j, 0, 0);
                    await bot.waitForTicks(2);
                }

                const updatedI = container.slots[i];
                if (updatedI && updatedI.count >= maxStack) break;
            }
        }

        for (let i = 0; i < capacity - 1; i++) {
            let minIdx = i;

            for (let j = i + 1; j < capacity; j++) {
                if (compareItems(container.slots[j], container.slots[minIdx]) < 0) {
                    minIdx = j;
                }
            }

            if (minIdx !== i) {
                await bot.clickWindow(i, 0, 0);
                await bot.waitForTicks(2);
                await bot.clickWindow(minIdx, 0, 0);
                await bot.waitForTicks(2);
                await bot.clickWindow(i, 0, 0);
                await bot.waitForTicks(2);
            }
        }

        if (container.selectedItem) {
            const emptySlot = container.slots.slice(0, capacity).findIndex((s) => !s);
            const targetSlot = emptySlot !== -1 ? emptySlot : 0;
            await bot.clickWindow(targetSlot, 0, 0);
            await bot.waitForTicks(2);
        }
    } catch (err) {
        console.error("Error sorting chest:", err);
    }
}
