import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { ActivateTrapdoor, DeactivateTrapdoor, ExitTrapdoor, SetupEnderPearl } from "./trapdor.js";
import { TRAPDOOR1 } from "./coords.js";
import sleep from "./sleep.js";

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
defaultMovements.allowParkour = true;
defaultMovements.allowSprinting = true;
defaultMovements.allowFreeMotion = true;
defaultMovements.blocksToAvoid.add(32);
for (let i = 284; i <= 292; i++) { // Trapdoor
    defaultMovements.blocksToAvoid.add(i);
}
for (let i = 814; i <= 815; i++) { // Trapdoor
    defaultMovements.blocksToAvoid.add(i);
}

bot.once("spawn", async () => {
    await bot.waitForChunksToLoad();
    await sleep(500);
    bot.pathfinder.setMovements(defaultMovements);
});

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
});