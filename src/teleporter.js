import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1, TRAPDOOR2 } from "./coords.js";
import sleep from "./sleep.js";
import { OpenChest, MAX_RANGE_CHEST, isBotInventoryEmpty, hasItemsToDeposit } from "./chests.js";
import { isBotOk, makeBotOk } from "./health.js";

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

const TEMP_CHESTS = [TEMP_CHEST1, TEMP_CHEST2];
const TRAPDOORS = [TRAPDOOR1, TRAPDOOR2];

bot.once("spawn", async () => {
    await bot.waitForChunksToLoad();
    await bot.waitForTicks(10);
    bot.pathfinder.setMovements(defaultMovements);

    // Dev commands
    const devCommands = {
        "!setup_pearl": async () => {
            const closestTrapdoor = TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            );
            await SetupEnderPearl(bot, closestTrapdoor);
        },
        "!activate_trapdoor": async () => {
            const closestTrapdoor = TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            );
            await ActivateTrapdoor(bot, closestTrapdoor);
        },
        "!deactivate_trapdoor": async () => {
            const closestTrapdoor = TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            );
            await DeactivateTrapdoor(bot, closestTrapdoor);
        },
        "!exit_trapdoor": async () => {
            await ExitTrapdoor(bot);
        },
        "!come": async () => {
            const player = bot.nearestEntity((entity) => entity.player && entity.username && entity.username == process.env.BOT_OWNER);
            if (player) {
                const goal = new goals.GoalXZ(player.position.x, player.position.z);
                bot.pathfinder.setGoal(goal);
            }
        },
        "!get_from_temp_chest": async () => {
            const closest_temp_chest = TEMP_CHESTS.reduce((closest, chest) =>
                bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
            );

            await bot.pathfinder.goto(new goals.GoalNear(closest_temp_chest.x, closest_temp_chest.y, closest_temp_chest.z, MAX_RANGE_CHEST));
            await bot.lookAt(closest_temp_chest);

            const temp_chest = bot.blockAt(closest_temp_chest);
            if (!temp_chest) {
                throw new Error(`[GET] Chest at ${closest_temp_chest} is not loaded in world.`);
            }

            const temp_container = await bot.openContainer(temp_chest);
            await bot.waitForTicks(10);

            const openchest = new OpenChest(bot, temp_chest, temp_container);
            const itemsInChest = temp_container.containerItems().filter(item => item && item.name !== "ender_pearl");

            if (itemsInChest.length === 0) {
                openchest.close();
                return false;
            }

            await openchest.get27Items();
            openchest.close();
            return true;
        },
        "!drop_to_temp_chest": async () => {
            const closest_temp_chest = TEMP_CHESTS.reduce((closest, chest) =>
                bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
            );

            await bot.pathfinder.goto(new goals.GoalNear(closest_temp_chest.x, closest_temp_chest.y, closest_temp_chest.z, MAX_RANGE_CHEST));
            await bot.lookAt(closest_temp_chest);

            const temp_chest = bot.blockAt(closest_temp_chest);
            if (!temp_chest) {
                throw new Error(`[DROP] Chest at ${closest_temp_chest} is not loaded in world.`);
            }

            const temp_container = await bot.openContainer(temp_chest);
            await bot.waitForTicks(10);

            const openchest = new OpenChest(bot, temp_chest, temp_container);
            await openchest.depositAllItems();
            openchest.close();
        }
    };

    // Bot communication commands
    const botCommunicationCommands = {
        "!start": async () => {
            console.log("[Teleporter] Starting transfer routine...");
            await devCommands["!setup_pearl"]();
            if (!isBotOk(bot)) await makeBotOk(bot);
            bot.chat(`/msg ${process.env.USERNAME_STORAGE1} ${process.env.SECRET_MSG} !prepare_chest`);
        },

        "!chest_ready": async () => {
            console.log("[Teleporter] Storage 1 reported chest ready. Getting items from temp chest...");
            const hasItems = await devCommands["!get_from_temp_chest"]();

            if (!hasItems) {
                console.log("[Teleporter] No items in temp chest to send. Transfer finished!");
                return;
            }

            if (!isBotOk(bot)) await makeBotOk(bot);

            console.log("[Teleporter] Items picked up. Asking Storage 2 to teleport to Base 2...");
            bot.chat(`/msg ${process.env.USERNAME_STORAGE2} ${process.env.SECRET_MSG} !sending_items`);
        },

        "!sending_items_ok": async () => {
            console.log("[Teleporter] Teleported to Base 2. Processing drop-off...");
            await bot.waitForTicks(20 * 5);

            await devCommands["!deactivate_trapdoor"]();
            await devCommands["!exit_trapdoor"]();
            await devCommands["!drop_to_temp_chest"]();
            await devCommands["!setup_pearl"]();

            if (!isBotOk(bot)) await makeBotOk(bot);

            console.log("[Teleporter] Items deposited in Base 2 temp chest. Notifying Storage 2 to store them...");
            bot.chat(`/msg ${process.env.USERNAME_STORAGE2} ${process.env.SECRET_MSG} !store_items`);
        },

        "!store_items_ok": async () => {
            console.log("[Teleporter] Storage 2 finished storing items. Asking Storage 1 to prepare next batch...");
            if (!isBotOk(bot)) await makeBotOk(bot);
            bot.chat(`/msg ${process.env.USERNAME_STORAGE1} ${process.env.SECRET_MSG} !request_items`);
        },

        "!request_items_ok": async () => {
            console.log("[Teleporter] Teleported back to Base 1. Preparing next batch...");
            await bot.waitForTicks(20 * 5);

            await devCommands["!deactivate_trapdoor"]();
            await devCommands["!exit_trapdoor"]();
            await devCommands["!setup_pearl"]();

            if (!isBotOk(bot)) await makeBotOk(bot);

            const hasItems = await devCommands["!get_from_temp_chest"]();

            if (!hasItems) {
                console.log("[Teleporter] No more items in temp chest. Transfer complete!");
                return;
            }

            console.log("[Teleporter] Next batch picked up. Asking Storage 2 to teleport...");
            bot.chat(`/msg ${process.env.USERNAME_STORAGE2} ${process.env.SECRET_MSG} !sending_items`);
        }
    };

    bot.on("messagestr", async (message, position) => {
        if (position === "game_info") return;

        const secret = process.env.SECRET_MSG;
        if (!secret) return;

        const secretIndex = message.indexOf(secret);
        if (secretIndex === -1) return;

        const afterSecret = message.slice(secretIndex + secret.length).trim();
        const args = afterSecret.split(/\s+/);
        const command = args[0];

        if (!command) return;

        console.log(`[Teleporter] Received command: ${command}`);

        if (devCommands[command]) {
            await devCommands[command](args);
        } else if (botCommunicationCommands[command]) {
            await botCommunicationCommands[command](args);
        }
    });
});
