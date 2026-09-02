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

const { autoEat } = await import("../src/health.js");

test("autoEat picks one item from the closest food chest and consumes it", async () => {
    const clicks = [];
    let openedPosition = null;
    let closed = 0;
    let equipped = null;
    let consumed = 0;

    const bread = { name: "bread", type: 1, count: 64, slot: 0 };
    const container = {
        type: "chest_1x1",
        inventoryStart: 1,
        inventoryEnd: 2,
        slots: [bread, null],
        containerItems: () => [{ ...bread }],
        close: () => closed++
    };

    const bot = {
        entity: { position: new Vec3(4, 64, 4) },
        pathfinder: { goto: async () => { } },
        lookAt: async () => { },
        blockAt: (pos) => ({ name: "chest", position: pos }),
        openContainer: async (block) => { openedPosition = block.position; return container; },
        clickWindow: async (slot, mouse, mode) => clicks.push([slot, mouse, mode]),
        inventory: { items: () => [{ name: "bread", type: 1, count: 1 }] },
        equip: async (item) => { equipped = item; },
        consume: async () => { consumed++; }
    };

    await autoEat(bot);

    assert.deepEqual(openedPosition, new Vec3(5, 64, 5));
    assert.deepEqual(clicks, [[0, 0, 0], [1, 1, 0], [0, 0, 0]]);
    assert.equal(closed, 1);
    assert.equal(equipped.type, 1);
    assert.equal(consumed, 1);
});

test("autoEat does nothing when the closest food chest is empty", async () => {
    let closed = 0;
    let consumed = 0;

    const container = {
        containerItems: () => [],
        close: () => closed++
    };

    const bot = {
        entity: { position: new Vec3(0, 64, 0) },
        pathfinder: { goto: async () => { } },
        lookAt: async () => { },
        blockAt: (pos) => ({ name: "chest", position: pos }),
        openContainer: async () => container,
        clickWindow: async () => { throw new Error("should not click"); },
        inventory: { items: () => [] },
        equip: async () => { throw new Error("should not equip"); },
        consume: async () => { consumed++; }
    };

    await autoEat(bot);

    assert.equal(closed, 1);
    assert.equal(consumed, 0);
});
