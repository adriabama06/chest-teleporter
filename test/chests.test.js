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

const { OpenChest, isBotInventoryEmpty, getContainerCapacity } = await import("../src/chests.js");

test("getContainerCapacity defaults to 27", () => {
    assert.equal(getContainerCapacity(null), 27);
    assert.equal(getContainerCapacity({}), 27);
    assert.equal(getContainerCapacity({ type: "minecraft:chest" }), 27);
});

test("getContainerCapacity parses NxN window types", () => {
    assert.equal(getContainerCapacity({ type: "chest_9x3" }), 27);
    assert.equal(getContainerCapacity({ type: "chest_9x9" }), 81);
});

test("getContainerCapacity falls back to inventoryStart", () => {
    assert.equal(getContainerCapacity({ type: "minecraft:hopper", inventoryStart: 5 }), 5);
});

test("isBotInventoryEmpty checks bot inventory items", () => {
    assert.equal(isBotInventoryEmpty({ inventory: { items: () => [] } }), true);
    assert.equal(isBotInventoryEmpty({ inventory: { items: () => [{ name: "dirt" }] } }), false);
});

function fakeWindow(chestSlots, botSlots) {
    return {
        type: `chest_${chestSlots.length}x1`,
        inventoryStart: chestSlots.length,
        inventoryEnd: chestSlots.length + botSlots.length,
        slots: [...chestSlots, ...botSlots]
    };
}

test("OpenChest.isFull returns false when there are empty slots", () => {
    const bot = { clickWindow: async () => { } };
    const container = fakeWindow([{ name: "diamond", type: 1, count: 64 }, null], []);

    assert.equal(new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container).isFull(), false);
});

test("OpenChest.isFull returns true when every slot is occupied", () => {
    const bot = { clickWindow: async () => { } };
    const container = fakeWindow([{ name: "diamond", type: 1, count: 10 }, { name: "dirt", type: 2, count: 3 }], []);

    assert.equal(new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container).isFull(), true);
});

test("OpenChest.isFull ignores the bot inventory slots of the window", () => {
    const bot = { clickWindow: async () => { } };
    const container = fakeWindow([null], [{ name: "diamond", type: 1, count: 5 }]);

    assert.equal(new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container).isFull(), false);
});

test("OpenChest.isFull returns true without a container", () => {
    const bot = { clickWindow: async () => { } };
    assert.equal(new OpenChest(bot, { position: new Vec3(0, 0, 0) }, null).isFull(), true);
});

test("OpenChest.isEmpty checks container items", () => {
    const bot = { clickWindow: async () => { } };
    const chest = { position: new Vec3(0, 64, 0) };

    const empty = new OpenChest(bot, chest, { containerItems: () => [] });
    const full = new OpenChest(bot, chest, { containerItems: () => [{ name: "dirt" }] });

    assert.equal(empty.isEmpty(), true);
    assert.equal(full.isEmpty(), false);
});

test("OpenChest.getAllItems shift-clicks every container slot", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, _mouse, mode) => clicks.push([slot, mode]),
        inventory: { items: () => [] }
    };
    const container = {
        containerItems: () => [{ slot: 0, type: 1, count: 5 }, { slot: 1, type: 2, count: 5 }],
        slots: [{ name: "diamond", type: 1, count: 5 }, { name: "dirt", type: 2, count: 5 }]
    };

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.getAllItems();

    assert.deepEqual(clicks, [[0, 1], [1, 1]]);
});

test("OpenChest.getAllItems skips slots emptied by previous clicks", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, _mouse, mode) => {
            clicks.push([slot, mode]);
            container.slots[slot] = null;
        },
        inventory: { items: () => [] }
    };
    const container = {
        containerItems: () => [{ slot: 0, type: 1, count: 5 }, { slot: 1, type: 1, count: 5 }],
        slots: [{ name: "diamond", type: 1, count: 10 }, null]
    };

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.getAllItems();

    assert.deepEqual(clicks, [[0, 1]]);
});

test("OpenChest.getAllItems stops when bot inventory is full", async () => {
    const clicks = [];
    const fullInventory = new Array(36).fill({ name: "stone", type: 3, count: 64 });
    const bot = {
        clickWindow: async (slot) => clicks.push(slot),
        inventory: { items: () => fullInventory }
    };
    const container = {
        containerItems: () => [{ slot: 0, type: 1, count: 5 }],
        slots: [{ name: "diamond", type: 1, count: 5 }]
    };

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.getAllItems();

    assert.deepEqual(clicks, []);
});

test("OpenChest.getAllItems falls back to container.withdraw when shift-click fails", async () => {
    const bot = {
        clickWindow: async () => { throw new Error("no shift-click"); },
        inventory: { items: () => [] }
    };
    const withdrawals = [];
    const container = {
        containerItems: () => [{ slot: 0, type: 1, count: 5 }],
        slots: [{ name: "diamond", type: 1, count: 5 }],
        withdraw: async (type, _meta, count) => withdrawals.push([type, count])
    };

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.getAllItems();

    assert.deepEqual(withdrawals, [[1, 5]]);
});

test("OpenChest.pickItem picks a single item, leaving the rest in the chest", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, mouse, mode) => clicks.push([slot, mouse, mode]),
        inventory: { items: () => [] }
    };
    const container = fakeWindow([{ name: "bread", type: 1, count: 64 }], [null]);

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.pickItem(0);

    assert.deepEqual(clicks, [[0, 0, 0], [1, 1, 0], [0, 0, 0]]);
});

test("OpenChest.pickItem restores the stack and throws when bot inventory is full", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, mouse, mode) => clicks.push([slot, mouse, mode]),
        inventory: { items: () => [] }
    };
    const container = fakeWindow([{ name: "bread", type: 1, count: 64 }], [{ name: "stone", type: 2, count: 64 }]);

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);

    await assert.rejects(() => open.pickItem(0), /No empty bot inventory slot/);
    assert.deepEqual(clicks, [[0, 0, 0], [0, 0, 0]]);
});

test("OpenChest.pickItem does nothing on an empty slot", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, mouse, mode) => clicks.push([slot, mouse, mode]),
        inventory: { items: () => [] }
    };
    const container = fakeWindow([null], []);

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.pickItem(0);

    assert.deepEqual(clicks, []);
});

test("OpenChest.depositAllItems shift-clicks every bot slot in the window", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot, _mouse, mode) => clicks.push([slot, mode]),
        inventory: { items: () => [] }
    };
    const container = fakeWindow(
        [null, null],
        [{ name: "diamond", type: 1, count: 5 }, { name: "dirt", type: 2, count: 5 }]
    );

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.depositAllItems();

    assert.deepEqual(clicks, [[2, 1], [3, 1]]);
});

test("OpenChest.depositAllItems stops when the container is full", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot) => clicks.push(slot),
        inventory: { items: () => [] }
    };
    const container = fakeWindow(
        [{ name: "gold", type: 2, count: 64 }, { name: "gold", type: 2, count: 64 }],
        [{ name: "diamond", type: 1, count: 5 }]
    );

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.depositAllItems();

    assert.deepEqual(clicks, []);
});

test("OpenChest.depositAllItems stops on partial stacks without empty slots", async () => {
    const clicks = [];
    const bot = {
        clickWindow: async (slot) => clicks.push(slot),
        inventory: { items: () => [] }
    };
    const container = fakeWindow(
        [{ name: "diamond", type: 1, count: 10 }, { name: "dirt", type: 2, count: 3 }],
        [{ name: "diamond", type: 1, count: 5 }]
    );

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.depositAllItems();

    assert.deepEqual(clicks, []);
});

test("OpenChest.depositAllItems falls back to container.deposit when shift-click fails", async () => {
    const bot = {
        clickWindow: async () => { throw new Error("no shift-click"); },
        inventory: { items: () => [] }
    };
    const deposits = [];
    const container = fakeWindow([null], [{ name: "diamond", type: 1, count: 5 }]);
    container.deposit = async (type, _meta, count) => deposits.push([type, count]);

    const open = new OpenChest(bot, { position: new Vec3(0, 0, 0) }, container);
    await open.depositAllItems();

    assert.deepEqual(deposits, [[1, 5]]);
});
