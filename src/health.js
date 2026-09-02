import mineflayer_pathfinder from "mineflayer-pathfinder";
import sleep from "./sleep.js";
import { FOOD_CHEST1, FOOD_CHEST2 } from "./coords.js";
import { OpenChest, MAX_RANGE_CHEST } from "./chests.js";

const { goals } = mineflayer_pathfinder;

const FOOD_CHESTS = [FOOD_CHEST1, FOOD_CHEST2];

const MIN_HEALTH = 6; // 3 hearts
const MIN_FOOD = 6; // 3 food

/**
 * @param {import("mineflayer").Bot} bot
 */
export async function isBotOk(bot) {
    if(bot.health <= MIN_HEALTH) return false;
    if(bot.food <= MIN_FOOD) return false;

    return true;
}

/**
 * Picks one item from the closest food chest and consumes it.
 * @param {import("mineflayer").Bot} bot
 */
export async function autoEat(bot) {
    if(bot.food >= 20) return;

    const closest_food_chest = FOOD_CHESTS.reduce((closest, chest) =>
        bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
    );

    await bot.pathfinder.goto(new goals.GoalNear(closest_food_chest.x, closest_food_chest.y, closest_food_chest.z, MAX_RANGE_CHEST));

    const chest = bot.blockAt(closest_food_chest);

    if (!chest) {
        throw new Error(`[Health] Chest at ${closest_food_chest} is not loaded in world.`);
    }

    await bot.lookAt(chest.position);
    const container = await bot.openContainer(chest);

    await sleep(500);

    const openchest = new OpenChest(bot, chest, container);
    const first_item = container.containerItems()[0];

    if (!first_item) {
        console.log("No food in the chest: ", closest_food_chest);
        openchest.close();
        return;
    }

    await openchest.pickItem(first_item.slot);
    openchest.close();

    const item = bot.inventory.items().find(i => i.type === first_item.type);
    if (!item) return; // Bruh, idk what happened, maybe pickItem has not worked correctly

    await bot.equip(item, "hand");
    await bot.consume();
}

/**
 * @param {import("mineflayer").Bot} bot
 */
export async function healthBot(bot) {
    while (bot.health <= MIN_HEALTH) {
        await autoEat(bot);

        await bot.waitForTicks(20);
    }
}

/**
 * @param {import("mineflayer").Bot} bot
 */
export async function foodBot(bot) {
    while (bot.food <= MIN_FOOD) {
        await autoEat(bot);

        await bot.waitForTicks(10);
    }
}
