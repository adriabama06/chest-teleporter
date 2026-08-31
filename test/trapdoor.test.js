import test from 'node:test';
import assert from 'node:assert/strict';
import minecraft_data from 'minecraft-data';
import prismarine_block from 'prismarine-block';
import { Vec3 } from 'vec3';
import {
  isTrapdoor,
  getTrapdoorProperties,
  isTrapdoorOpen,
  getBehindTrapdoor
} from '../src/trapdor.js';

const mcData = minecraft_data('1.19.4');
const Block = prismarine_block('1.19.4');

test('isTrapdoor correctly identifies trapdoor blocks', () => {
  const oakTrapdoorStateId = mcData.blocksByName['oak_trapdoor'].defaultState;
  const stoneStateId = mcData.blocksByName['stone'].defaultState;

  const trapdoorBlock = Block.fromStateId(oakTrapdoorStateId, 0);
  const stoneBlock = Block.fromStateId(stoneStateId, 0);

  assert.equal(isTrapdoor(trapdoorBlock), true);
  assert.equal(isTrapdoor(stoneBlock), false);
  assert.equal(isTrapdoor(null), false);
  assert.equal(isTrapdoor(undefined), false);
});

test('getTrapdoorProperties extracts properties correctly', () => {
  // Find a state with known facing and open value
  for (let stateId = mcData.blocksByName['oak_trapdoor'].minStateId; stateId <= mcData.blocksByName['oak_trapdoor'].maxStateId; stateId++) {
    const block = Block.fromStateId(stateId, 0);
    const props = getTrapdoorProperties(block);
    assert.ok(props);
    assert.ok(['north', 'south', 'east', 'west'].includes(props.facing));
    assert.ok(typeof props.open === 'boolean');
    assert.ok(['top', 'bottom'].includes(props.half));
    assert.equal(isTrapdoorOpen(block), props.open);
  }
});

test('getBehindTrapdoor calculates correct behind coordinates for all facings', () => {
  const mockBot = {
    blocks: new Map(),
    blockAt(pos) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      return this.blocks.get(key) || null;
    }
  };

  const trapdoorCoord = new Vec3(10, 64, 20);

  // Helper to create a trapdoor block with specific facing
  function createTrapdoorWithFacing(facing) {
    for (let stateId = mcData.blocksByName['oak_trapdoor'].minStateId; stateId <= mcData.blocksByName['oak_trapdoor'].maxStateId; stateId++) {
      const b = Block.fromStateId(stateId, 0);
      if (b.getProperties().facing === facing) {
        return b;
      }
    }
    throw new Error('State not found for facing ' + facing);
  }

  // Test North: opens to north (-Z) -> supporting block is at south (+Z) -> (10, 65, 21)
  mockBot.blocks.set('10,64,20', createTrapdoorWithFacing('north'));
  const behindNorth = getBehindTrapdoor(mockBot, trapdoorCoord);
  assert.deepEqual(behindNorth, new Vec3(10, 65, 21));

  // Test South: opens to south (+Z) -> supporting block is at north (-Z) -> (10, 65, 19)
  mockBot.blocks.set('10,64,20', createTrapdoorWithFacing('south'));
  const behindSouth = getBehindTrapdoor(mockBot, trapdoorCoord);
  assert.deepEqual(behindSouth, new Vec3(10, 65, 19));

  // Test West: opens to west (-X) -> supporting block is at east (+X) -> (11, 65, 20)
  mockBot.blocks.set('10,64,20', createTrapdoorWithFacing('west'));
  const behindWest = getBehindTrapdoor(mockBot, trapdoorCoord);
  assert.deepEqual(behindWest, new Vec3(11, 65, 20));

  // Test East: opens to east (+X) -> supporting block is at west (-X) -> (9, 65, 20)
  mockBot.blocks.set('10,64,20', createTrapdoorWithFacing('east'));
  const behindEast = getBehindTrapdoor(mockBot, trapdoorCoord);
  assert.deepEqual(behindEast, new Vec3(9, 65, 20));
});
