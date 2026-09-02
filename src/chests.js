import sleep from "./sleep.js";

export const MAX_RANGE_CHEST = 4;

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
                await bot.waitForTicks(2);
            } catch {
                try {
                    await this.container.withdraw(targetItem.type, null, targetItem.count);
                    await bot.waitForTicks(2);
                } catch { }
            }
        }
    }

    /**
     * Move to the container all items (until bot inventory is empty or the container is full)
     */
    async depositAllItems() {
        for (let i = this.container.inventoryStart; i < this.container.inventoryEnd; i++) {
            const slotItem = this.container.slots[i];
            if (!slotItem) continue;
            if (this.isFull()) {
                console.log("No space left in container");
                break;
            }

            try {
                await this.bot.clickWindow(i, 0, 1);
                await bot.waitForTicks(2);
            } catch {
                try {
                    await this.container.deposit(slotItem.type, null, slotItem.count);
                    await bot.waitForTicks(2);
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
        if (!item) return;

        await this.bot.clickWindow(slot, 0, 0);
        await bot.waitForTicks(2);

        const botSlots = this.container.slots.slice(this.container.inventoryStart, this.container.inventoryEnd);
        const emptySlot = botSlots.findIndex((s) => !s);

        if (emptySlot === -1) {
            await this.bot.clickWindow(slot, 0, 0);
            await bot.waitForTicks(2);
            throw new Error("No empty bot inventory slot to pick a single item");
        }

        await this.bot.clickWindow(this.container.inventoryStart + emptySlot, 1, 0);
        await bot.waitForTicks(2);

        await this.bot.clickWindow(slot, 0, 0);
        await bot.waitForTicks(2);
    }

    /**
     * Sorts the container items from lowest to highest Item.type.
     */
    async sort() {
        await sortChest(this.bot, this.container);
    }
}

/**
 * Checks if the bot inventory has no items.
 * @param {import("mineflayer").Bot} bot
 * @returns {boolean}
 */
export function isBotInventoryEmpty(bot) {
    return bot.inventory.items().length === 0;
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
