import { test } from "node:test";
import assert from "node:assert/strict";
import { Vec3 } from "vec3";

process.env.WORK_AREA1 ??= "0,0,0|1,1,1";
process.env.WORK_AREA2 ??= "0,0,0|1,1,1";
process.env.TRAPDOOR1 ??= "0,0,0";
process.env.TEMP_CHEST1 ??= "0,0,0";
process.env.PEARL_CHEST1 ??= "0,0,0";
process.env.FOOD_CHEST1 ??= "0,64,0";
process.env.TRAPDOOR2 ??= "0,0,0";
process.env.TEMP_CHEST2 ??= "0,0,0";
process.env.PEARL_CHEST2 ??= "0,0,0";
process.env.FOOD_CHEST2 ??= "5,64,5";

const { StorageChests } = await import("../src/StorageChests.js");

function fakeDoubleChestWindow() {
    const slots = new Array(90).fill(null);

    return {
        type: "minecraft:generic_9x6",
        inventoryStart: 54,
        inventoryEnd: 90,
        slots,
        containerItems: () => slots.slice(0, 54).filter(Boolean),
        close: () => { }
    };
}

function fakeBot(windowsByKey) {
    const blocks = new Map();
    for (const key of windowsByKey.keys()) {
        const [x, y, z] = key.split(",").map(Number);
        blocks.set(key, { name: "chest", position: new Vec3(x, y, z) });
    }

    return {
        entity: { position: new Vec3(0, 64, 0) },
        pathfinder: { goto: async () => { } },
        lookAt: async () => { },
        waitForTicks: async () => { },
        blockAt: (pos) => blocks.get(`${pos.x},${pos.y},${pos.z}`) ?? null,
        openContainer: async (block) => windowsByKey.get(`${block.position.x},${block.position.y},${block.position.z}`)
    };
}

function fillChest(window, from, to, type) {
    for (let i = from; i < to; i++) window.slots[i] = { name: "dirt", type, count: 64 };
}

test("openChestWithSpace keeps filling the same chest before opening a new one", async () => {
    const windows = new Map([["0,64,0", fakeDoubleChestWindow()], ["10,64,0", fakeDoubleChestWindow()]]);
    const bot = fakeBot(windows);

    const blockA = bot.blockAt(new Vec3(0, 64, 0));
    const blockB = bot.blockAt(new Vec3(10, 64, 0));

    const storage = new StorageChests(bot, [blockA, blockB], "empty");

    // Round 1: the bot deposits 27 stacks into chest A (half of the double chest)
    const first = await storage.openChestWithSpace();
    assert.deepEqual(first.chest.position, blockA.position);
    fillChest(windows.get("0,64,0"), 0, 27, 1);
    storage.updateChestAfterDeposit(first, first.isFull());

    // Chest A is not full: it stays as a candidate so the next batch keeps filling it
    assert.equal(storage.emptyChests.length, 2);
    assert.equal(storage.chestsWithSpace.length, 0);

    // Round 2: the bot deposits 27 more stacks -> same chest A, not B
    const second = await storage.openChestWithSpace();
    assert.deepEqual(second.chest.position, blockA.position);
    fillChest(windows.get("0,64,0"), 27, 54, 1);
    storage.updateChestAfterDeposit(second, second.isFull());

    // Chest A is now full: moved to the "notEmpty" list
    assert.deepEqual(storage.chestsWithSpace.map((chest) => chest.position), [blockA.position]);
    assert.deepEqual(storage.emptyChests.map((chest) => chest.position), [blockB.position]);

    // Round 3: chest A is full -> the bot opens chest B
    const third = await storage.openChestWithSpace();
    assert.deepEqual(third.chest.position, blockB.position);
});

test("openChestWithSpace reclassifies an assumed-empty chest that is actually full", async () => {
    const windows = new Map([["0,64,0", fakeDoubleChestWindow()], ["10,64,0", fakeDoubleChestWindow()]]);
    const bot = fakeBot(windows);

    const blockA = bot.blockAt(new Vec3(0, 64, 0));
    const blockB = bot.blockAt(new Vec3(10, 64, 0));

    fillChest(windows.get("0,64,0"), 0, 54, 1);

    const storage = new StorageChests(bot, [blockA, blockB], "empty");

    const opened = await storage.openChestWithSpace();

    assert.deepEqual(opened.chest.position, blockB.position);
    assert.deepEqual(storage.chestsWithSpace.map((chest) => chest.position), [blockA.position]);
});

test("openChestWithItems reclassifies an assumed-with-items chest that is actually empty", async () => {
    const windows = new Map([["0,64,0", fakeDoubleChestWindow()], ["10,64,0", fakeDoubleChestWindow()]]);
    const bot = fakeBot(windows);

    const blockA = bot.blockAt(new Vec3(0, 64, 0));
    const blockB = bot.blockAt(new Vec3(10, 64, 0));

    fillChest(windows.get("10,64,0"), 0, 54, 1);

    const storage = new StorageChests(bot, [blockA, blockB], "withItems");

    const opened = await storage.openChestWithItems();

    assert.deepEqual(opened.chest.position, blockB.position);
    assert.deepEqual(storage.emptyChests.map((chest) => chest.position), [blockA.position]);
});
