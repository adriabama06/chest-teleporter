import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { FOOD_CHEST1, FOOD_CHEST2, MAX_POS_WORK_AREA1, MAX_POS_WORK_AREA2, MIN_POS_WORK_AREA1, MIN_POS_WORK_AREA2, TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1, TRAPDOOR2 } from "./coords.js";
import sleep from "./sleep.js";
import { OpenChest, ScanChests, MAX_RANGE_CHEST, isBotInventoryEmpty, hasItemsToDeposit } from "./chests.js";
import { StorageChests } from "./StorageChests.js";
import { isBotOk, makeBotOk } from "./health.js";

const { pathfinder, Movements, goals } = mineflayer_pathfinder;

const isStorage2 = (process.argv[2] && process.argv[2] === "2");

const bot = mineflayer.createBot({
    host: process.env.SERVER_IP,
    port: process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : undefined,
    version: process.env.VERSION,
    auth: (isStorage2 ? process.env.AUTH_STORAGE2 : process.env.AUTH_STORAGE1) || "offline",
    username: isStorage2 ? process.env.USERNAME_STORAGE2 : process.env.USERNAME_STORAGE1,
    password: isStorage2 ? process.env.PASSWORD_STORAGE2 : process.env.PASSWORD_STORAGE1
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

    const TEMP_CHEST = isStorage2 ? TEMP_CHEST2 : TEMP_CHEST1;
    const TRAPDOOR = isStorage2 ? TRAPDOOR2 : TRAPDOOR1;
    const MIN_AREA = isStorage2 ? MIN_POS_WORK_AREA2 : MIN_POS_WORK_AREA1;
    const MAX_AREA = isStorage2 ? MAX_POS_WORK_AREA2 : MAX_POS_WORK_AREA1;
    const CACHEFILE = isStorage2 ? "cache2" : "cache1";

    console.log(`[StorageManager] Mode: ${isStorage2 ? "Storage 2 (Receiver)" : "Storage 1 (Sender)"}, Cache: ${CACHEFILE}`);

    const CHESTS = await ScanChests(bot, MIN_AREA, MAX_AREA, CACHEFILE);

    const StorageManager = new StorageChests(bot, CHESTS, isStorage2 ? "empty" : "withItems");

    // Dev commands
    const devCommands = {
        "!activate_trapdoor": async () => {
            await ActivateTrapdoor(bot, TRAPDOOR);
        },
        "!deactivate_trapdoor": async () => {
            await DeactivateTrapdoor(bot, TRAPDOOR);
        },
        "!come": async () => {
            const player = bot.nearestEntity((entity) => entity.player && entity.username && entity.username == process.env.BOT_OWNER);
            if (player) {
                const goal = new goals.GoalXZ(player.position.x, player.position.z);
                bot.pathfinder.setGoal(goal);
            }
        },
        "!get_from_temp_chest": async () => {
            await bot.pathfinder.goto(new goals.GoalNear(TEMP_CHEST.x, TEMP_CHEST.y, TEMP_CHEST.z, MAX_RANGE_CHEST));
            await bot.lookAt(TEMP_CHEST);

            const temp_chest = bot.blockAt(TEMP_CHEST);
            if (!temp_chest) {
                throw new Error(`[GET] Chest at ${TEMP_CHEST} is not loaded in world.`);
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
            await bot.pathfinder.goto(new goals.GoalNear(TEMP_CHEST.x, TEMP_CHEST.y, TEMP_CHEST.z, MAX_RANGE_CHEST));
            await bot.lookAt(TEMP_CHEST);

            const temp_chest = bot.blockAt(TEMP_CHEST);
            if (!temp_chest) {
                throw new Error(`[DROP] Chest at ${TEMP_CHEST} is not loaded in world.`);
            }

            const temp_container = await bot.openContainer(temp_chest);
            await bot.waitForTicks(10);

            const openchest = new OpenChest(bot, temp_chest, temp_container);
            await openchest.depositAllItems();
            openchest.close();
        },
        "!obtain_from_storage": async () => {
            const chest = await StorageManager.openChestWithItems();

            if (!chest) {
                console.log("[Storage] No chests found with items.");
                return false;
            }

            await chest.get27Items();
            chest.close();
            return true;
        },
        "!store_to_storage": async () => {
            while (hasItemsToDeposit(bot)) {
                const chest = await StorageManager.openChestWithSpace();

                if (!chest) {
                    console.log("[Storage] No chests with free space found to store items.");
                    return false;
                }

                await chest.depositAllItems();

                // Check the state before closing (the window slot data is fresh)
                const full = chest.isFull();

                chest.close();

                // If the chest is still not full (e.g. a double chest that got
                // half filled), keep it tracked so the next batch continues
                // filling the same chest instead of opening a new one
                StorageManager.updateChestAfterDeposit(chest, full);
            }
            return true;
        }
    };

    // Bot communication commands
    const botCommunicationCommands = {
        "!prepare_chest": async () => {
            console.log("[Storage 1] Preparing initial batch in temp chest...");
            if (!isBotOk(bot)) await makeBotOk(bot);

            const obtained = await devCommands["!obtain_from_storage"]();
            if (obtained) {
                await devCommands["!drop_to_temp_chest"]();
            } else {
                console.log("[Storage 1] Warehouse is empty.");
            }

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !chest_ready`);
        },

        "!sending_items": async () => {
            console.log("[Storage 2] Teleporting Teleporter to Base 2...");
            if (!isBotOk(bot)) await makeBotOk(bot);

            await devCommands["!activate_trapdoor"]();

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !sending_items_ok`);
        },

        "!store_items": async () => {
            console.log("[Storage 2] Collecting items from temp chest and storing in warehouse...");
            if (!isBotOk(bot)) await makeBotOk(bot);

            await devCommands["!get_from_temp_chest"]();
            await devCommands["!store_to_storage"]();

            console.log("[Storage 2] Finished storing. Notifying Teleporter...");
            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !store_items_ok`);
        },

        "!request_items": async () => {
            console.log("[Storage 1] Preparing next batch...");
            if (!isBotOk(bot)) await makeBotOk(bot);

            const obtained = await devCommands["!obtain_from_storage"]();
            if (obtained) {
                await devCommands["!drop_to_temp_chest"]();
            } else {
                console.log("[Storage 1] No more items in warehouse to send.");
            }

            console.log("[Storage 1] Teleporting Teleporter back to Base 1...");
            await devCommands["!activate_trapdoor"]();

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !request_items_ok`);
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

        console.log(`[StorageManager] Received command: ${command}`);

        if (devCommands[command]) {
            await devCommands[command](args);
        } else if (botCommunicationCommands[command]) {
            await botCommunicationCommands[command](args);
        }
    });
});
