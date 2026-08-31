import { Vec3 } from "vec3";

/**
 * Parses a "x,y,z" string into a Vec3 object.
 * @param {string} text 
 * @returns {Vec3}
 */
export function parseCoord(text) {
    const [x, y, z] = text.split(",").map(Number);
    return new Vec3(x, y, z);
}

/**
 * Checks if a position is within min and max boundaries.
 * @param {Vec3} min 
 * @param {Vec3} max 
 * @param {Vec3} pos 
 * @returns {boolean}
 */
export function isInside(min, max, pos) {
    return (
        pos.x >= min.x && pos.x <= max.x &&
        pos.y >= min.y && pos.y <= max.y &&
        pos.z >= min.z && pos.z <= max.z
    );
}

/**
 * Finds the first block in the area matching the predicate.
 * @param {import("mineflayer").Bot} bot
 * @param {Vec3} min 
 * @param {Vec3} max 
 * @param {(block: import("prismarine-block").Block) => boolean} fn
 * @returns {import("prismarine-block").Block | null}
 */
export function findBlock(bot, min, max, fn) {
    for (let x = min.x; x <= max.x; x++) {
        for (let y = min.y; y <= max.y; y++) {
            for (let z = min.z; z <= max.z; z++) {
                const block = bot.blockAt(new Vec3(x, y, z));
                if (block && fn(block)) return block;
            }
        }
    }
    return null;
}

/**
 * Finds all blocks in the area matching the predicate.
 * @param {import("mineflayer").Bot} bot
 * @param {Vec3} min 
 * @param {Vec3} max 
 * @param {(block: import("prismarine-block").Block) => boolean} fn
 * @returns {import("prismarine-block").Block[]}
 */
export function findBlocks(bot, min, max, fn) {
    const blocks = [];

    for (let x = min.x; x <= max.x; x++) {
        for (let y = min.y; y <= max.y; y++) {
            for (let z = min.z; z <= max.z; z++) {
                const block = bot.blockAt(new Vec3(x, y, z));
                if (block && fn(block)) blocks.push(block);
            }
        }
    }

    return blocks;
}

if (!process.env.WORK_AREA1 || !process.env.WORK_AREA1.includes("|") || !process.env.WORK_AREA2 || !process.env.WORK_AREA2.includes("|")) {
    console.error("Error: WORK_AREA environment variable is missing or invalid (format: 'X1,Y1,Z1|X2,Y2,Z2').");
    process.exit(1);
}

const [pos1_a, pos1_b] = process.env.WORK_AREA1.split("|").map(parseCoord);
const [pos2_a, pos2_b] = process.env.WORK_AREA2.split("|").map(parseCoord);

export const MIN_POS_WORK_AREA1 = new Vec3(
    Math.min(pos1_a.x, pos1_b.x),
    Math.min(pos1_a.y, pos1_b.y),
    Math.min(pos1_a.z, pos1_b.z)
);

export const MAX_POS_WORK_AREA1 = new Vec3(
    Math.max(pos1_a.x, pos1_b.x),
    Math.max(pos1_a.y, pos1_b.y),
    Math.max(pos1_a.z, pos1_b.z)
);

export const MIN_POS_WORK_AREA2 = new Vec3(
    Math.min(pos2_a.x, pos2_b.x),
    Math.min(pos2_a.y, pos2_b.y),
    Math.min(pos2_a.z, pos2_b.z)
);

export const MAX_POS_WORK_AREA2 = new Vec3(
    Math.max(pos2_a.x, pos2_b.x),
    Math.max(pos2_a.y, pos2_b.y),
    Math.max(pos2_a.z, pos2_b.z)
);

export const TRAPDOOR1 = parseCoord(process.env.TRAPDOOR1);
export const TEMP_CHEST1 = parseCoord(process.env.TEMP_CHEST1);
export const PEARL_CHEST1 = parseCoord(process.env.PEARL_CHEST1);
export const FOOD_CHEST1 = parseCoord(process.env.FOOD_CHEST1);

export const TRAPDOOR2 = parseCoord(process.env.TRAPDOOR2);
export const TEMP_CHEST2 = parseCoord(process.env.TEMP_CHEST2);
export const PEARL_CHEST2 = parseCoord(process.env.PEARL_CHEST2);
export const FOOD_CHEST2 = parseCoord(process.env.FOOD_CHEST2);
