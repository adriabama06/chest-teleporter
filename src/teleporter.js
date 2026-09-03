import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { TEMP_CHEST1, TEMP_CHEST2, TRAPDOOR1, TRAPDOOR2 } from "./coords.js";
import sleep from "./sleep.js";
import { OpenChest, MAX_RANGE_CHEST, isBotInventoryEmpty } from "./chests.js";
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
        "!pearl": async () => {
            await SetupEnderPearl(bot, TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            ));
        },
        "!act": async () => {
            await ActivateTrapdoor(bot, TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            ));
        },
        "!dea": async () => {
            await DeactivateTrapdoor(bot, TRAPDOORS.reduce((closest, pos) =>
                bot.entity.position.distanceTo(pos) < bot.entity.position.distanceTo(closest) ? pos : closest
            ));
        },
        "!come": async () => {
            const player = bot.nearestEntity((entity) => entity.player && entity.username && entity.username == process.env.BOT_OWNER);
            if (player) {
                const goal = new goals.GoalXZ(player.position.x, player.position.z);
                bot.pathfinder.setGoal(goal);
            }
        },
        "!ex": async () => {
            await ExitTrapdoor(bot);
        },
        "!get": async () => {
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

            await openchest.getAllItems();

            openchest.close();
        },
        "!drop": async () => {
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
            bot.chat(`/msg ${process.env.USERNAME_STORAGE1} ${process.env.SECRET_MSG} !prepare_chest`);
        },

        "!chest_ready": async () => {
            await devCommands["!get"]();

            bot.chat(`/msg ${process.env.USERNAME_STORAGE2} ${process.env.SECRET_MSG} !sending_items`);
        },

        "!sending_items_ok": async () => {
            await bot.waitForTicks(20 * 5);

            await devCommands["!dea"]();

            await devCommands["!ex"]();

            await devCommands["!drop"]();

            bot.chat(`/msg ${process.env.USERNAME_STORAGE2} ${process.env.SECRET_MSG} !store_items`);

            await devCommands["!pearl"]();

            if(!isBotOk(bot)) await makeBotOk(bot);

            bot.chat(`/msg ${process.env.USERNAME_STORAGE1} ${process.env.SECRET_MSG} !request_items`);
        },

        "!request_items_ok": async () => {
            await bot.waitForTicks(20 * 5);

            await devCommands["!dea"]();

            await devCommands["!ex"]();

            await devCommands["!get"]();

            if(isBotInventoryEmpty(bot)) {
                console.log("No items to send.");
                return;
            }

            await devCommands["!pearl"]();

            if(!isBotOk(bot)) await makeBotOk(bot);

            bot.chat(`/msg ${process.env.USERNAME_STORAGE1} ${process.env.SECRET_MSG} !sending_items`);
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
