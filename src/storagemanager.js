import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { FOOD_CHEST1, FOOD_CHEST2, MAX_POS_WORK_AREA1, MAX_POS_WORK_AREA2, MIN_POS_WORK_AREA1, MIN_POS_WORK_AREA2, TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1, TRAPDOOR2 } from "./coords.js";
import sleep from "./sleep.js";
import { OpenChest, ScanChests, MAX_RANGE_CHEST, isBotInventoryEmpty } from "./chests.js";
import { StorageChests } from "./StorageChests.js";
import { isBotOk, makeBotOk } from "./health.js";

const { pathfinder, Movements, goals } = mineflayer_pathfinder;

const bot = mineflayer.createBot({
    host: process.env.SERVER_IP,
    port: process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : undefined,
    version: process.env.VERSION,
    auth: ((process.argv[2] && process.argv[2] == "2") ? process.env.AUTH_STORAGE2 : process.env.AUTH_STORAGE1) || "offline",
    username: (process.argv[2] && process.argv[2] == "2") ? process.env.USERNAME_STORAGE2 : process.env.USERNAME_STORAGE1,
    password: (process.argv[2] && process.argv[2] == "2") ? process.env.PASSWORD_STORAGE2 : process.env.PASSWORD_STORAGE1
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

    const TEMP_CHEST = [TEMP_CHEST1, TEMP_CHEST2].reduce((closest, chest) =>
        bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
    );

    const TRAPDOOR = [TRAPDOOR1, TRAPDOOR2].reduce((closest, chest) =>
        bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
    );

    const MIN_AREA = [MIN_POS_WORK_AREA1, MIN_POS_WORK_AREA2].reduce((closest, pos) =>
        bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
    );

    const MAX_AREA = [MAX_POS_WORK_AREA1, MAX_POS_WORK_AREA2].reduce((closest, pos) =>
        bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
    );

    const CACHEFILE = MAX_AREA.equals(MAX_POS_WORK_AREA1) ? "cache1" : "cache2";

    console.log(`Cache detected: ${CACHEFILE}`);

    const CHESTS = await ScanChests(bot, MIN_AREA, MAX_AREA, CACHEFILE);

    const StorageManager = new StorageChests(bot, CHESTS, CACHEFILE == "cache1" ? "withItems" : "empty");

    // Dev commands
    const devCommands = {
        "!act": async () => {
            await ActivateTrapdoor(bot, TRAPDOOR);
        },
        "!dea": async () => {
            await DeactivateTrapdoor(bot, TRAPDOOR);
        },
        "!come": async () => {
            const player = bot.nearestEntity((entity) => entity.player && entity.username && entity.username == process.env.BOT_OWNER);
            if (player) {
                const goal = new goals.GoalXZ(player.position.x, player.position.z);
                bot.pathfinder.setGoal(goal);
            }
        },
        "!get": async () => {
            await bot.pathfinder.goto(new goals.GoalNear(TEMP_CHEST.x, TEMP_CHEST.y, TEMP_CHEST.z, MAX_RANGE_CHEST));

            await bot.lookAt(TEMP_CHEST);

            const temp_chest = bot.blockAt(TEMP_CHEST);

            if (!temp_chest) {
                throw new Error(`[DROP] Chest at ${TEMP_CHEST} is not loaded in world.`);
            }

            const temp_container = await bot.openContainer(temp_chest);

            await bot.waitForTicks(10);

            const openchest = new OpenChest(bot, temp_chest, temp_container);

            await openchest.getAllItems();

            openchest.close();
        },
        "!drop": async () => {
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
        "!obtain": async () => {
            const chest = await StorageManager.openChestWithItems();

            if (!chest) {
                console.log("No chests found to get items");
                return false;
            }

            await chest.get27Items();

            chest.close();
            return true;
        },
        "!store": async () => {
            while (!isBotInventoryEmpty(bot)) {
                const chest = await StorageManager.openEmptyChest();

                if (!chest) {
                    console.log("No empty chests found to store items");
                    return;
                }

                await chest.depositAllItems();

                chest.close();
            }
        }
    };

    // Bot communication commands
    const botCommunicationCommands = {
        "!prepare_chest": async () => {
            let obtained = await devCommands["!obtain"]();
            if (obtained === false) return;
            await devCommands["!drop"]();

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !chest_ready`);

            obtained = await devCommands["!obtain"]();
            if (obtained === false) return;
            await devCommands["!drop"]();
        },

        "!sending_items": async () => {
            if(!isBotOk(bot)) await makeBotOk(bot);

            await devCommands["!act"]();

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !sending_items_ok`);
        },

        "!request_items": async () => {
            if(!isBotOk(bot)) await makeBotOk(bot);

            await devCommands["!act"]();

            bot.chat(`/msg ${process.env.USERNAME_TELEPORTER} ${process.env.SECRET_MSG} !request_items_ok`);

            const obtained = await devCommands["!obtain"]();
            if (obtained === false) return;
            await devCommands["!drop"]();
        }
    };

    bot.on("messagestr", async (message, position) => {
        if (position != "chat") return;

        let args = message.split(" ");
        const i = args.indexOf(process.env.SECRET_MSG);

        if (i == -1) return;

        args = args.slice(i + 1);
        const command = args[0];

        console.log(message);

        if (devCommands[command]) {
            await devCommands[command](args);
        } else if (botCommunicationCommands[command]) {
            await botCommunicationCommands[command](args);
        }
    });
});
