# AGENTS.md

Minecraft item-transfer system on mineflayer: three bots move all items from one base to another. Node ESM, no build step, no lint/typecheck — `npm test` is the only automated verification.

## Commands

- `npm test` — unit tests (`node --test`). Single file: `node --test test/chests.test.js`
- `npm run start:teleporter` / `start:storagemanager1` / `start:storagemanager2` — the three long-running bots; all read `.env` via `node --env-file` and must run simultaneously.
- `npm run cache` is stale: `src/cachebot.js` does not exist.

## Environment

Copy `.env.example` to `.env`. Everything is env-driven: per-bot credentials (`*_TELEPORTER`, `*_STORAGE1`, `*_STORAGE2`), `VERSION` (must match the server), `SECRET_MSG`, `BOT_OWNER`, block coords `TRAPDOOR1/2`, `TEMP_CHEST1/2`, `PEARL_CHEST1/2`, `FOOD_CHEST1/2` (`X,Y,Z`) and `WORK_AREA1/2` (`X,Y,Z|X,Y,Z`).

`src/coords.js` validates env vars at import time and calls `process.exit(1)` if missing. Any test file that (transitively) imports src must define env defaults **before** the dynamic `import()` — copy the `process.env.* ??=` block from `test/chests.test.js`.

## Bot protocol

- Three independent processes: **Teleporter** (mule), **Storage 1** (sender base), **Storage 2** (receiver base, selected by `process.argv[2] == "2"` in storagemanager.js). No orchestrator; the owner types `!start` in-game.
- Bots coordinate only via private chat: `/msg <bot> <SECRET_MSG> <command>`. Handlers live in `devCommands` (owner/debug) and `botCommunicationCommands` (handshake) in `teleporter.js` / `storagemanager.js`. Even owner-typed commands need the `SECRET_MSG` prefix.
- Command names are a cross-bot protocol: keep them in sync on both files (short aliases like `!get` exist for backwards compat).
- Handshake is strictly sequential: `!prepare_chest` → `!chest_ready` → `!sending_items` → `!sending_items_ok` → `!store_items` → `!store_items_ok` → `!request_items` → `!request_items_ok`. A bot replies "ok" only after finishing its own work — earlier race conditions came from breaking this.
- Stasis chambers: `SetupEnderPearl` throws a pearl into the bubble column (trapdoor open = `DeactivateTrapdoor`); `ActivateTrapdoor` closes the trapdoor, popping the pearl and teleporting the Teleporter to that base.

## Gotchas

- `depositAllItems()` skips ender pearls and `hasItemsToDeposit()` / `isBotInventoryEmpty()` ignore them on purpose: the Teleporter must keep its pearls.
- `isBotOk()` (health.js) must stay synchronous. An `async` version made `if (!isBotOk(bot))` always false (Promise truthiness) and bots never ate.
- `/msg` arrives on `messagestr` with position `"system"` (1.19+). The listeners only filter `"game_info"`; filtering `position != "chat"` silently drops every bot command.
- Chest windows: single = `minecraft:generic_9x3` (27 slots), double = `minecraft:generic_9x6` (54); `getContainerCapacity()` parses the window type.
- `StorageChests` keeps each chest in exactly one of two lists: `emptyChests` (storing candidates, checked with `!isFull()`) and `chestsWithSpace` (non-empty, obtaining candidates, checked with `!isEmpty()`). Assumed state is verified on open and chests are reclassified. Partially-filled chests stay in `emptyChests` so double chests get filled completely — do not revert the storing check back to `isEmpty()`.

## Tests

Pure unit tests with mock bots and fake chest windows — no Minecraft server needed. Mocks may lack `waitForTicks`, so src guards calls with `if (bot.waitForTicks)`. Fake windows are plain objects with `type`, `inventoryStart`, `inventoryEnd` and a `slots` array (chest slots first, bot slots after `inventoryStart`).
