import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1 } from "./coords.js";
import sleep from "./sleep.js";
import { OpenChest } from "./chests.js";

const { pathfinder, Movements, goals } = mineflayer_pathfinder;

const bot = mineflayer.createBot({
    host: process.env.SERVER_IP,
    port: process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : undefined,
    version: process.env.VERSION,
    auth: process.env.AUTH_TELEPORTER || "offline",
    username: process.env.USERNAME_TELEPORTER,
    password: process.env.PASSWORD_TELEPORTER
});

bot.loadPlugin(pathfinder);

const defaultMovements = new Movements(bot);
defaultMovements.canDig = false;
defaultMovements.scafoldingBlocks = [];
defaultMovements.blocksToAvoid.add(32);
for (let i = 284; i <= 292; i++) { // Trapdoor
    defaultMovements.blocksToAvoid.add(i);
}
for (let i = 814; i <= 815; i++) { // Trapdoor
    defaultMovements.blocksToAvoid.add(i);
}

bot.once("spawn", async () => {
    await bot.waitForChunksToLoad();
    await bot.waitForTicks(10);
    bot.pathfinder.setMovements(defaultMovements);
});

const TEMP_CHESTS = [TEMP_CHEST1, TEMP_CHEST2];

bot.on("chat", async (username, message) => {
    if(message == "!pearl") {
        await SetupEnderPearl(bot, TRAPDOOR1);
    }
    if(message == "!act") {
        await ActivateTrapdoor(bot, TRAPDOOR1);
    }
    if(message == "!dea") {
        await DeactivateTrapdoor(bot, TRAPDOOR1);
    }
    if(message == "!come") {
        const player = bot.players[username];
        if(player && player.entity) {
            const goal = new goals.GoalXZ(player.entity.position.x, player.entity.position.z);
            bot.pathfinder.setGoal(goal);
        }
    }
    if(message == "!ex") {
        await ExitTrapdoor(bot);
    }
    if(message == "!get") {
        const closest_temp_chest = TEMP_CHESTS.reduce((closest, chest) =>
            bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
        );

        await bot.pathfinder.goto(new goals.GoalNear(closest_temp_chest.x, closest_temp_chest.y, closest_temp_chest.z, MAX_RANGE_CHEST));

        await bot.lookAt(closest_temp_chest);

        const temp_chest = bot.blockAt(closest_temp_chest);

        if (!temp_chest) {
            throw new Error(`[DROP] Chest at ${closest_food_chest} is not loaded in world.`);
        }
        
        const temp_container = await bot.openContainer(temp_chest);

        await bot.waitForTicks(10);

        const openchest = new OpenChest(bot, temp_chest, temp_container);

        await openchest.getAllItems();

        openchest.close();
    }
    if(message == "!drop") {
        const closest_temp_chest = TEMP_CHESTS.reduce((closest, chest) =>
            bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
        );

        await bot.pathfinder.goto(new goals.GoalNear(closest_temp_chest.x, closest_temp_chest.y, closest_temp_chest.z, MAX_RANGE_CHEST));

        await bot.lookAt(closest_temp_chest);

        const temp_chest = bot.blockAt(closest_temp_chest);

        if (!temp_chest) {
            throw new Error(`[DROP] Chest at ${closest_food_chest} is not loaded in world.`);
        }

        const temp_container = await bot.openContainer(temp_chest);

        await bot.waitForTicks(10);
        
        const openchest = new OpenChest(bot, temp_chest, temp_container);

        await openchest.depositAllItems();

        openchest.close();
    }
});
