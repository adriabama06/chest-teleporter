import test from 'node:test';
import assert from 'node:assert/strict';
import minecraft_data from 'minecraft-data';
import prismarine_block from 'prismarine-block';
import { Vec3 } from 'vec3';
import { Physics, PlayerState } from 'prismarine-physics';

import {
  hasSupportUnder,
  getPearlDropPlan,
  createSneakEdgeGuardCore,
  createLedgeWalkController,
  raycastDownFirstSolid
} from '../src/trapdor.js';

const mcData = minecraft_data('1.19.4');
const Block = prismarine_block('1.19.4');

const TRAPDOOR = { x: 13, y: 107, z: 81 };
const FLOOR_Y = 107;
const STAND_Y = 108;

// ---------------------------------------------------------------------------
// Mock world: a replica of the real stasis chamber at TRAPDOOR2 (13,107,81)
//   - floor top at y=108 (stone blocks at y=107) with a 1x1 hole at (13,81)
//   - open spruce trapdoor (facing east) in the hole cell, waterlogged
//   - water at (13,106,81), soul sand at (13,105,81) -> bubble column
// ---------------------------------------------------------------------------

function findStateId(blockName, filter) {
  const info = mcData.blocksByName[blockName];
  const total = info.states.reduce((acc, s) => acc * s.num_values, 1);
  for (let i = 0; i < total; i++) {
    const block = Block.fromStateId(info.defaultState + i, 0);
    const props = block.getProperties();
    if (Object.entries(filter).every(([k, v]) => props[k] === v)) {
      return info.defaultState + i;
    }
  }
  throw new Error(`state not found for ${blockName} ${JSON.stringify(filter)}`);
}

const STATE_IDS = {
  air: 0,
  stone: mcData.blocksByName.stone.defaultState,
  water: mcData.blocksByName.water.defaultState,
  soul_sand: mcData.blocksByName.soul_sand.defaultState,
  trapdoorOpen: findStateId('spruce_trapdoor', { facing: 'east', half: 'bottom', open: true, waterlogged: true })
};

function makeChamberWorld(trapdoorFacingStateId = STATE_IDS.trapdoorOpen) {
  const map = new Map();
  const set = (x, y, z, stateId) => map.set(`${x},${y},${z}`, stateId);

  for (let x = 9; x <= 17; x++) {
    for (let z = 78; z <= 84; z++) {
      set(x, FLOOR_Y, z, STATE_IDS.stone);
      set(x, FLOOR_Y - 1, z, STATE_IDS.stone);
      set(x, FLOOR_Y - 2, z, STATE_IDS.stone);
      set(x, FLOOR_Y - 3, z, STATE_IDS.stone);
    }
  }
  // The hole: open trapdoor cell, water below it, soul sand at the bottom
  set(TRAPDOOR.x, FLOOR_Y, TRAPDOOR.z, trapdoorFacingStateId);
  set(TRAPDOOR.x, FLOOR_Y - 1, TRAPDOOR.z, STATE_IDS.water);
  set(TRAPDOOR.x, FLOOR_Y - 2, TRAPDOOR.z, STATE_IDS.soul_sand);
  set(TRAPDOOR.x, FLOOR_Y - 3, TRAPDOOR.z, STATE_IDS.stone);

  const cache = new Map();
  return {
    getBlock(pos) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      let block = cache.get(key);
      if (block) return block;
      const stateId = map.get(key) ?? STATE_IDS.air;
      block = Block.fromStateId(stateId, 0);
      block.position = new Vec3(pos.x, pos.y, pos.z);
      cache.set(key, block);
      return block;
    }
  };
}

// Minimal bot shape for prismarine-physics PlayerState + our modules
function makeSimBot(world, { x = 12.5, z = 81.5, yaw = -Math.PI / 2, pitch = -Math.PI / 2 } = {}) {
  const bot = {
    version: '1.19.4',
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    inventory: { slots: new Array(46).fill(null) },
    entity: {
      position: new Vec3(x, STAND_Y, z),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      effects: {},
      attributes: {},
      yaw,
      pitch,
      height: 1.8,
      eyeHeight: 1.62
    }
  };
  bot.blockAt = (pos) => world.getBlock(pos);
  return bot;
}

function makeControl({ sneak = false, forward = false, back = false } = {}) {
  return { forward, back, left: false, right: false, jump: false, sprint: false, sneak };
}

function simulateWith(world) {
  const physics = Physics(mcData, world);
  return (bot, control) => {
    const state = new PlayerState(bot, control);
    const out = physics.simulatePlayer(state, world);
    out.apply(bot);
  };
}

test('BUG DEMO: mineflayer sneak does not stop the bot from walking off the ledge', () => {
  const world = makeChamberWorld();
  const simulateTick = simulateWith(world);
  const bot = makeSimBot(world);
  const control = makeControl({ sneak: true, forward: true });

  for (let t = 0; t < 80; t++) simulateTick(bot, control);

  // The bot walked east past the panel ledge and fell into the chamber
  assert.ok(bot.entity.position.x > 13.5, `bot should have walked past the edge (x=${bot.entity.position.x})`);
  assert.ok(bot.entity.position.y < 107.5, `bot should have fallen (y=${bot.entity.position.y})`);
});

test('FIX: closed loop ledge walk lands inside the pearl drop window and never falls', async () => {
  const world = makeChamberWorld();
  const simulateTick = simulateWith(world);
  const bot = makeSimBot(world);
  const control = makeControl({ sneak: true });

  const plan = getPearlDropPlan(bot, new Vec3(TRAPDOOR.x, TRAPDOOR.y, TRAPDOOR.z));
  assert.equal(plan.axis, 'x');
  assert.equal(plan.sign, 1);

  const restore = (p) => {
    bot.entity.position.set(p.x, p.y, p.z);
    bot.entity.velocity.set(0, 0, 0);
  };
  const hasSupport = (p) => hasSupportUnder(bot, p);

  const controller = createLedgeWalkController({
    plan,
    getPos: () => bot.entity.position,
    getVel: () => bot.entity.velocity,
    getOnGround: () => bot.entity.onGround,
    setControl: (name, state) => { control[name] = state; },
    restore,
    hasSupport
  });

  let minYDuringWalk = Infinity;
  for (let t = 0; t < 300 && controller.phase !== 'done' && controller.phase !== 'aborted'; t++) {
    simulateTick(bot, control);
    controller.onTick();
    minYDuringWalk = Math.min(minYDuringWalk, bot.entity.position.y);
  }
  const result = await controller.promise;

  assert.equal(controller.phase, 'done');
  assert.ok(result.reverts === 0, `expected no reverts, got ${result.reverts}`);
  assert.ok(minYDuringWalk >= STAND_Y - 1e-9, `bot must never drop below floor level (minY=${minYDuringWalk})`);

  const pos = bot.entity.position;
  assert.ok(pos.x >= plan.windowMinW && pos.x <= plan.windowMaxW,
    `final x ${pos.x.toFixed(4)} outside window ${plan.windowMinW.toFixed(4)}..${plan.windowMaxW.toFixed(4)}`);
  assert.ok(Math.abs(pos.z - 81.5) < 0.2, `z drifted: ${pos.z}`);
  assert.equal(bot.entity.onGround, true);
  assert.ok(hasSupport(pos), 'bot must be supported at the final position');

  // Idle for 100 ticks: the bot must stay standing on the ledge
  const idleControl = makeControl({ sneak: true });
  for (let t = 0; t < 100; t++) {
    simulateTick(bot, idleControl);
    assert.ok(bot.entity.position.y >= STAND_Y - 1e-6, `bot fell during idle at tick ${t} (y=${bot.entity.position.y})`);
  }
  assert.ok(hasSupport(bot.entity.position), 'still supported after idling');

  // The drop line from the eye must reach the soul sand
  const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
  const hit = raycastDownFirstSolid(bot, eye.x, eye.z, eye.y, 16);
  assert.ok(hit, 'raycast must hit something');
  assert.equal(hit.block.name, 'soul_sand');
});

test('FIX: the sneak edge guard alone pins the bot before it can fall (lag burst safety)', () => {
  const world = makeChamberWorld();
  const simulateTick = simulateWith(world);
  const bot = makeSimBot(world);
  const guard = createSneakEdgeGuardCore({
    getPos: () => bot.entity.position,
    hasSupport: (p) => hasSupportUnder(bot, p),
    restore: (p) => {
      bot.entity.position.set(p.x, p.y, p.z);
      bot.entity.velocity.set(0, 0, 0);
    }
  });
  guard.enable();

  const control = makeControl({ sneak: true, forward: true });
  for (let t = 0; t < 200; t++) {
    simulateTick(bot, control);
    guard.onTick();
    assert.ok(bot.entity.position.y >= STAND_Y - 1e-6, `bot fell at tick ${t} (y=${bot.entity.position.y})`);
  }
  assert.ok(guard.reverts > 0, 'the guard should have reverted at least once');
  assert.ok(bot.entity.position.x > 12.6, `guard should have let the bot advance (x=${bot.entity.position.x})`);
});

test('getPearlDropPlan computes symmetric windows for all four facings', () => {
  const cases = [
    { facing: 'east', behind: new Vec3(12, 108, 81), sign: 1, windowMin: 13.3375, windowMax: 13.4625, target: 13.4, panelAimX: 13.09375 },
    { facing: 'west', behind: new Vec3(14, 108, 81), sign: -1, windowMin: 13.5375, windowMax: 13.6625, target: 13.6, panelAimX: 13.90625 },
    { facing: 'north', behind: new Vec3(13, 108, 82), sign: -1, windowMin: 81.5375, windowMax: 81.6625, target: 81.6, panelAimZ: 81.90625 },
    { facing: 'south', behind: new Vec3(13, 108, 80), sign: 1, windowMin: 81.3375, windowMax: 81.4625, target: 81.4, panelAimZ: 81.09375 }
  ];

  for (const c of cases) {
    const stateId = findStateId('spruce_trapdoor', { facing: c.facing, half: 'bottom', open: true, waterlogged: true });
    const world = makeChamberWorld(stateId);
    const bot = makeSimBot(world);
    const plan = getPearlDropPlan(bot, new Vec3(TRAPDOOR.x, TRAPDOOR.y, TRAPDOOR.z));

    assert.equal(plan.facing, c.facing, `facing for ${c.facing}`);
    assert.equal(plan.sign, c.sign, `sign for ${c.facing}`);
    assert.deepEqual(plan.behind, c.behind, `behind for ${c.facing}`);
    assert.ok(Math.abs(plan.windowMinW - c.windowMin) < 1e-9, `windowMin for ${c.facing}: ${plan.windowMinW}`);
    assert.ok(Math.abs(plan.windowMaxW - c.windowMax) < 1e-9, `windowMax for ${c.facing}: ${plan.windowMaxW}`);
    assert.ok(Math.abs(plan.targetW - c.target) < 1e-9, `target for ${c.facing}: ${plan.targetW}`);
    const aimCoord = plan.axis === 'x' ? plan.panelAim.x : plan.panelAim.z;
    const expectedAim = plan.axis === 'x' ? c.panelAimX : c.panelAimZ;
    assert.ok(Math.abs(aimCoord - expectedAim) < 1e-9, `panelAim for ${c.facing}: ${aimCoord}`);
  }
});

test('raycastDownFirstSolid distinguishes panel, floor and soul sand', () => {
  const world = makeChamberWorld();
  const bot = makeSimBot(world);
  // Over the drop window: through water straight to the soul sand
  const hitColumn = raycastDownFirstSolid(bot, 13.4, 81.5, 109.62, 16);
  assert.equal(hitColumn.block.name, 'soul_sand');
  assert.ok(Math.abs(hitColumn.hitY - (105 + 0.875)) < 1e-9);

  // Over the open panel: hits the trapdoor itself
  const hitPanel = raycastDownFirstSolid(bot, 13.05, 81.5, 109.62, 16);
  assert.equal(hitPanel.block.name, 'spruce_trapdoor');
  assert.ok(Math.abs(hitPanel.hitY - 108) < 1e-9);

  // Over the support block: hits the stone floor
  const hitFloor = raycastDownFirstSolid(bot, 12.5, 81.5, 109.62, 16);
  assert.equal(hitFloor.block.name, 'stone');
  assert.ok(Math.abs(hitFloor.hitY - 108) < 1e-9);
});
