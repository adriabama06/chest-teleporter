import fs from "fs";
import mineflayer from "mineflayer";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import sleep from "./sleep.js";
import { parseCoord, MIN_POS_WORK_AREA1, MAX_POS_WORK_AREA1, MIN_POS_WORK_AREA2, MAX_POS_WORK_AREA2 } from "./coords.js";
import { findChestsInArea, formatPos } from "./chests.js";

const { pathfinder, Movements, goals } = mineflayer_pathfinder;

const areaArg = process.argv[2];
if (areaArg !== "1" && areaArg !== "2") {
    console.error("Usage: npm run cache <1|2> <X,Y,Z> [<X,Y,Z> ...]");
    process.exit(1);
}

const isStorage2 = areaArg === "2";
const OUTPUT_FILE = isStorage2 ? "cache2.json" : "cache1.json";

const waypoints = process.argv.slice(3).map(parseCoord);
if (waypoints.length < 1 || waypoints.some((pos) => isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z))) {
    console.error("Usage: npm run cache <1|2> <X,Y,Z> [<X,Y,Z> ...]");
    process.exit(1);
}

waypoints.push(waypoints[0]);

const STEP_DISTANCE = 4;

const MIN_AREA = isStorage2 ? MIN_POS_WORK_AREA2 : MIN_POS_WORK_AREA1;
const MAX_AREA = isStorage2 ? MAX_POS_WORK_AREA2 : MAX_POS_WORK_AREA1;

const setChests = new Set();

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

function posKey(pos) {
    return `${pos.x},${pos.y},${pos.z}`;
}

function vec3Distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function interpolatePoints(from, to, maxDist) {
    const points = [];
    const dist = vec3Distance(from, to);
    const steps = Math.max(1, Math.ceil(dist / maxDist));

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push(new Vec3(
            Math.round(from.x + (to.x - from.x) * t),
            Math.round(from.y + (to.y - from.y) * t),
            Math.round(from.z + (to.z - from.z) * t)
        ));
    }

    return points;
}

function buildRoute() {
    if (waypoints.length === 1) return [waypoints[0]];

    const route = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const points = interpolatePoints(waypoints[i], waypoints[i + 1], STEP_DISTANCE);
        if (i > 0) points.shift(); // Skip the joint point already added by the previous segment
        route.push(...points);
    }
    return route;
}

function saveCache() {
    const positions = [...setChests];

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(positions, null, 2));
    console.log(`Cache saved to ${OUTPUT_FILE} (${positions.length} chests)`);
}

bot.once("spawn", async () => {
    await bot.waitForChunksToLoad();
    await sleep(3000);

    bot.pathfinder.setMovements(defaultMovements);

    const route = buildRoute();
    console.log(`Scanning work area ${formatPos(MIN_AREA)} -> ${formatPos(MAX_AREA)}`);
    console.log(`Following route of ${route.length} point(s), saving to ${OUTPUT_FILE}`);

    for (let i = 0; i < route.length; i++) {
        const point = route[i];

        try {
            await bot.pathfinder.goto(new goals.GoalNear(point.x, point.y, point.z, 1));
        } catch {
            console.log(`Could not reach ${formatPos(point)}, scanning anyway...`);
        }

        await bot.waitForChunksToLoad();

        // Full work area scan every point, only chests inside the area can be found
        const found = findChestsInArea(bot, MIN_AREA, MAX_AREA);
        for (const chest of found) setChests.add(posKey(chest.position));
        console.log(`Scanned ${i + 1}/${route.length} at ${formatPos(point)} - found ${found.length}, total ${setChests.size}`);
    }

    saveCache();
    bot.quit();
    process.exit(0);
});

bot.on("error", (err) => console.error("Bot error:", err.message));
bot.on("kicked", (reason) => {
    console.error("Kicked:", reason);
    process.exit(1);
});
