import fs from "fs";

import minecraft_data from "minecraft-data";
import prismarine_block from "prismarine-block";
import mineflayer_pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import sleep from "./sleep.js";
import { findBlocks, parseCoord, PEARL_CHEST1, PEARL_CHEST2 } from "./coords.js";
import { OpenChest } from "./chests.js";

const { goals } = mineflayer_pathfinder;

/**
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} trapdoor_coord 
 */
export async function ActivateTrapdoor(bot, trapdoor_coord) {
    await bot.pathfinder.goto(new goals.GoalNear(trapdoor_coord.x, trapdoor_coord.y, trapdoor_coord.z, 2.5));

    const trapdoor = bot.blockAt(trapdoor_coord);

    if (!trapdoor) {
        throw new Error(`[Trapdoor] Block at ${trapdoor_coord} is not loaded in world.`);
    }


    if (!trapdoor.getProperties().open) return;

    await bot.lookAt(trapdoor_coord);

    await bot.activateBlock(trapdoor);
}

/**
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} trapdoor_coord 
 */
export async function DeactivateTrapdoor(bot, trapdoor_coord) {
    await bot.pathfinder.goto(new goals.GoalNear(trapdoor_coord.x, trapdoor_coord.y, trapdoor_coord.z, 2.5));

    const trapdoor = bot.blockAt(trapdoor_coord);

    if (!trapdoor) {
        throw new Error(`[Trapdoor] Block at ${trapdoor_coord} is not loaded in world.`);
    }

    if (trapdoor.getProperties().open) return;

    await bot.lookAt(trapdoor_coord);

    await bot.activateBlock(trapdoor);
}

/**
 * Calculates the standing position on top of the supporting block behind the trapdoor.
 *
 * In Minecraft blockstate logic:
 * - facing="north": Opens toward North (-Z) -> hinge is attached to the block to the South (+Z).
 * - facing="south": Opens toward South (+Z) -> hinge is attached to the block to the North (-Z).
 * - facing="west":  Opens toward West (-X)  -> hinge is attached to the block to the East (+X).
 * - facing="east":  Opens toward East (+X)  -> hinge is attached to the block to the West (-X).
 *
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} trapdoor_coord
 * @returns {import("vec3").Vec3}
 */
export function GetBehindTrapdoor(bot, trapdoor_coord) {
    const trapdoor = bot.blockAt(trapdoor_coord);
    if (!trapdoor) {
        throw new Error(`[Trapdoor] Block at ${trapdoor_coord} is not loaded in world.`);
    }

    const props = trapdoor.getProperties();
    if (!props || !props.facing) {
        throw new Error(`[Trapdoor] Block at ${trapdoor_coord} is not a trapdoor (name: ${trapdoor.name}).`);
    }

    const final_position = trapdoor_coord.clone();
    final_position.y += 1; // Stand on top of the supporting block

    switch (props.facing) {
        case "north":
            final_position.z += 1;
            break;
        case "south":
            final_position.z -= 1;
            break;
        case "west":
            final_position.x += 1;
            break;
        case "east":
            final_position.x -= 1;
            break;
        default:
            console.warn(`[Trapdoor] Unknown facing value: ${props.facing}`);
    }

    return final_position;
}

export function DirectionToYaw(text) {
    switch (text) {
        case "north":
            return 0;
        case "south":
            return Math.PI;
        case "west":
            return Math.PI / 2;
        case "east":
            return -Math.PI / 2;
        default:
            console.warn(`Unknown direction: ${text}`);
            return 0;
    }
}

/**
 * Converts yaw & pitch (mineflayer convention, radians) to a direction Vec3.
 * Same formula mineflayer uses internally to get the view direction.
 *
 * @param {number} yaw
 * @param {number} pitch
 * @returns {import("vec3").Vec3}
 */
export function YawPitchToVec(yaw, pitch) {
    return new Vec3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    );
}

export function DirectionToVec(text) {
    switch (text) {
        case "north":
            return new Vec3(0, 0, -1);
        case "south":
            return new Vec3(0, 0, 1);
        case "west":
            return new Vec3(-1, 0, 0);
        case "east":
            return new Vec3(1, 0, 0);
        default:
            console.warn(`Unknown direction vec: ${text}`);
            return new Vec3(1, 0, 0);
    }
}


/**
 * @param {import("mineflayer").Bot} bot
 * @param {import("vec3").Vec3} trapdoor_coord 
 */
export async function SetupEnderPearl(bot, trapdoor_coord) {
    if (!bot.inventory.items().find(item => item.name == "ender_pearl")) {
        const closest_ender_pearl_chest = [PEARL_CHEST1, PEARL_CHEST2].reduce((closest, chest) =>
            bot.entity.position.distanceTo(chest) < bot.entity.position.distanceTo(closest) ? chest : closest
        );

        await bot.pathfinder.goto(new goals.GoalNear(closest_ender_pearl_chest.x, closest_ender_pearl_chest.y, closest_ender_pearl_chest.z, MAX_RANGE_CHEST));

        await bot.lookAt(closest_ender_pearl_chest);

        const ender_pearl_chest = bot.blockAt(closest_ender_pearl_chest);

        if (!ender_pearl_chest) {
            throw new Error(`[PEARL] Chest at ${closest_ender_pearl_chest} is not loaded in world.`);
        }

        const ender_pearl_chest_container = await bot.openContainer(ender_pearl_chest);

        await bot.waitForTicks(10);

        const openchest = new OpenChest(bot, ender_pearl_chest, ender_pearl_chest_container);

        const first_item = ender_pearl_chest_container.containerItems()[0];

        if (!first_item) {
            console.log("[PEARL] I got no ender pearls :c", closest_ender_pearl_chest);
            openchest.close();
            return;
        }

        await openchest.pickItem(first_item);

        openchest.close();

        await bot.waitForTicks(10);
    }

    await bot.equip(bot.inventory.items().find(item => item.name == "ender_pearl"), "hand");

    await DeactivateTrapdoor(bot, trapdoor_coord); // Make the trapdoor be open to throw the ender pearl

    const start_movement_position = GetBehindTrapdoor(bot, trapdoor_coord);

    await bot.pathfinder.goto(new goals.GoalBlock(start_movement_position.x, start_movement_position.y, start_movement_position.z));

    const trapdoor = bot.blockAt(trapdoor_coord);

    await bot.waitForTicks(10);

    await bot.look(DirectionToYaw(trapdoor.getProperties().facing), -Math.PI / 2); // Look into the direction of the trapdoor & look down

    await bot.waitForTicks(10);

    bot.setControlState("sneak", true);
    await bot.waitForTicks(10);
    bot.setControlState("forward", true);

    while (!bot.blockAtCursor(20) || bot.blockAtCursor(20).name != "soul_sand") {
        await bot.waitForTicks(1);
    }

    await bot.waitForTicks(1); // Walk 1 ticks extra

    bot.setControlState("forward", false);

    await bot.waitForTicks(10);

    bot.setControlState("sneak", false);

    bot.activateItem();
}

/**
 * @param {import("mineflayer").Bot} bot
 */
export async function ExitTrapdoor(bot) {
    const final_position = bot.entity.position.clone();

    final_position.add(YawPitchToVec(bot.entity.yaw, 0).round());

    while (bot.blockAt(bot.entity.position).isWaterlogged) {
        bot.setControlState("forward", true);
        bot.setControlState("jump", true);

        await bot.waitForTicks(1);
    }

    bot.setControlState("jump", false);

    await bot.waitForTicks(4); // Walk 4 ticks extra

    bot.setControlState("forward", false);

    await bot.waitForTicks(4); // Wait 4 ticks extra

    try {
        await bot.pathfinder.goto(new goals.GoalBlock(final_position.x, final_position.y, final_position.z)); // Center the bot
    } catch {
        // No path to goal
    }
}
