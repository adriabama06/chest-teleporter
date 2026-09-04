# Chest Teleporter

Transfer all the chests from one base to another using bots in Minecraft. Three mineflayer bots move every item from a sender warehouse (Base 1) to a receiver warehouse (Base 2), teleporting between them with an ender pearl stasis chamber.

## Features

- **Full Warehouse Transfer**: Moves all items from the chests of one base to the chests of another, automatically and unattended.
- **Ender Pearl Teleportation**: The mule bot ("Teleporter") uses a stasis chamber (pearl in a bubble column + trapdoor) to teleport between the two bases.
- **Three-Bot Coordination**: The bots talk to each other with private messages (`/msg`) protected by a secret prefix, following a strictly sequential handshake.
- **Warehouse Management**: Chests are automatically classified into empty (storing candidates) and non-empty (obtaining candidates), and reclassified on open if the assumption was wrong. Double chests are filled completely before moving to the next one.
- **Cache System**: Use `npm run cache <1|2>` to pre-scan a base and save the chest positions to `cache1.json` / `cache2.json`, so the storage managers don't need to scan the whole work area on startup.
- **Item Sort+Stack**: Automatically sorts and stacks items by ID inside the chests.
- **Self Care**: The bots eat from a food chest when low on health and keep their ender pearls out of the transfer flow.

## Getting Started

### Prerequisites

- Node.js (v22 or higher)
- npm (Node Package Manager)
- A Minecraft server running on the specified IP and port.
- Three Minecraft accounts (offline or premium): one Teleporter and two Storage managers.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/adriabama06/chest-teleporter.git
   cd chest-teleporter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` with your configuration (see [Configuration](#configuration)).

### In-Game Setup

Check the video:
(Recommended)
[![Example usage](https://img.youtube.com/vi/ZUEWj38lAeY/0.jpg)](https://www.youtube.com/watch?v=ZUEWj38lAeY) (temporal template video while the video is begin made)

Bots accounts:
- If you are using a ZenitProxy or something like that, make sure that the in-game nametags matches the USERNAME_xxx, if not, the bots will can not comunicate using /msg.
- All the bots must have their inventory empty.
- STORAGE1 and STORAGE2 must be at their places, what I mean is: STORAGE1 must be at the place where will send the chests; STORAGE2 must be at the place where he will recive the items.
- TELEPORTER must be at start with STORAGE1 and must have ready an stasis chamber with an ender pearl active where STORAGE2 is.

The bots expect a specific setup per base:

- **Work area** (`WORK_AREA1` / `WORK_AREA2`): rectangular area (two corners) containing all the warehouse chests of that base.
- **Temp chest** (`TEMP_CHEST1` / `TEMP_CHEST2`): the handoff chest where the Teleporter drops/picks items.
- **Stasis chamber** (`TRAPDOOR1` / `TRAPDOOR2`): a bubble column with a trapdoor on top. `SetupEnderPearl` throws a pearl into the column (trapdoor open); closing the trapdoor pops the pearl and teleports the Teleporter to that base.
- **Pearl chest** (`PEARL_CHEST1` / `PEARL_CHEST2`): chest with ender pearls to use to auto setup the stasis chamber on every teleport.
- **Food chest** (`FOOD_CHEST1` / `FOOD_CHEST2`): chest with food for the storage manager to eat.
- The Teleporter needs ender pearls in its inventory (they are never deposited).

### Usage

1. Start the three bots, each one in its own terminal (they must run simultaneously):
   ```bash
   npm run start:teleporter       # mule bot
   npm run start:storagemanager1  # Base 1 (sender)
   npm run start:storagemanager2  # Base 2 (receiver)
   ```

2. In-game, tell the Teleporter to start by private message (owner only):
   ```bash
   /msg <teleporter_username> <SECRET_MSG> !start
   ```

3. The bots will loop: prepare a batch in the temp chest → teleport → drop it → teleport back → store it → repeat until the sender warehouse is empty.

## Cache System

By default, each storage manager scans its whole work area on startup looking for valid chests. With a cache file, the chest positions are loaded instantly instead.

**How it works:**

1. Run the cache bot with the base to scan and a series of waypoints the bot should walk through:
   ```bash
   npm run cache 1 X1,Y1,Z1 X2,Y2,Z2 [X3,Y3,Z3 ...]   # scans WORK_AREA1 -> cache1.json
   npm run cache 2 X1,Y1,Z1 X2,Y2,Z2 [X3,Y3,Z3 ...]   # scans WORK_AREA2 -> cache2.json
   ```
   The bot logs in with the corresponding storage account (`STORAGE1` / `STORAGE2`).

2. The bot walks the route, and at every point rescans the **entire work area** (slow but thorough — nothing is missed) and merges the results. Only chests inside the work area are saved.

3. When you run the storage managers, `ScanChests` detects `cache1.json` / `cache2.json` and loads the chests from it, skipping the startup scan. Positions outside the work area or whose block is no longer a valid chest are discarded, and if the cache is missing or empty it falls back to the full scan.

**Example:**
```bash
npm run cache 1 100,64,100 150,64,100 150,64,150 100,64,150
```
This tells the bot to walk the corners of Base 1 and record all the chests it finds.

**Why use the cache:**

- Much faster startup — no full area scan on every launch.
- To regenerate, delete `cache1.json` / `cache2.json` and run `npm run cache` again.

> **Note:** The storage managers also work without a cache — they will scan the work area on startup. The cache is recomended for big bases or servers with low chunks.

## Bot Protocol

The three bots are independent processes with no orchestrator; they coordinate only through private chat: `/msg <bot> <SECRET_MSG> <command>`. The handshake is strictly sequential — a bot replies "ok" only after finishing its own work:

```
!prepare_chest -> !chest_ready -> !sending_items -> !sending_items_ok
-> !store_items -> !store_items_ok -> !request_items -> !request_items_ok -> (loop)
```

1. `!prepare_chest`: Storage 1 moves a batch from its warehouse to the temp chest, then notifies the Teleporter (`!chest_ready`).
2. The Teleporter picks the items and asks Storage 2 to teleport it (`!sending_items`); Storage 2 closes the trapdoor (`!sending_items_ok`).
3. The Teleporter drops everything into the temp chest of Base 2, rearms its pearl and asks Storage 2 to store it (`!store_items`); Storage 2 moves the items into its warehouse (`!store_items_ok`).
4. The Teleporter asks Storage 1 for the next batch (`!request_items`); Storage 1 teleports it back and prepares the next batch (`!request_items_ok`).

## Configuration

The bots use environment variables defined in `.env`. Key settings:

- `SERVER_IP`: IP address of the Minecraft server.
- `SERVER_PORT`: Port the server is listening on.
- `VERSION`: Minecraft version to connect with (must match the server).
- `SECRET_MSG`: Secret prefix required by every bot command (like a shared password).
- `BOT_OWNER`: In-game username of the owner.
- Per-bot credentials (`*_TELEPORTER`, `*_STORAGE1`, `*_STORAGE2`):
  - `AUTH`: Authentication method (`offline` or `microsoft`).
  - `USERNAME`: The bot's Minecraft username.
  - `PASSWORD`: Your password (required for `microsoft` auth).
- `TRAPDOOR1` / `TRAPDOOR2`: Stasis chamber trapdoor coordinates (`X,Y,Z`).
- `TEMP_CHEST1` / `TEMP_CHEST2`: Handoff chest coordinates (`X,Y,Z`).
- `PEARL_CHEST1` / `PEARL_CHEST2`: Chest with ender pearls (`X,Y,Z`).
- `FOOD_CHEST1` / `FOOD_CHEST2`: Chest with food (`X,Y,Z`).
- `WORK_AREA1` / `WORK_AREA2`: Two corner coordinates defining the rectangular warehouse area (e.g., `100,64,100|110,70,110`).

## Project Structure

```
.
├── src/
│   ├── teleporter.js       # Teleporter bot — mule, pearl stasis and temp chest handling
│   ├── storagemanager.js   # Storage bots — warehouse management (arg 1 or 2 selects the base)
│   ├── cachebot.js         # Cache scanner — walks a route and saves chest positions
│   ├── StorageChests.js    # Warehouse logic — classifies chests as empty / with space / with items
│   ├── chests.js           # Chest interaction (open, deposit, withdraw, sort) and chest scanning/cache
│   ├── coords.js           # Env parsing and validation, area utilities, block search
│   ├── trapdor.js          # Stasis chamber control (trapdoor + ender pearl)
│   ├── health.js           # Eating / healing logic
│   └── sleep.js            # Promise-based sleep utility
└── test/                   # Test suite (node:test, run with npm test)
```

## Development

Run the test suite (Node.js built-in test runner, no extra dependencies, no Minecraft server needed):

```bash
npm test
```

## Support

For questions or issues, please open an issue in the repository.

## Thanks

Thanks to [mineflayer](https://github.com/PrismarineJS/mineflayer) for their amazing work.
