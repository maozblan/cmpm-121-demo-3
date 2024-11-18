// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style2.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// flyweight board
import Board from "./board.ts";

// momento geocache
import Geocache from "./geocache.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// create board to hold geocache cells
const gameBoard = new Board(
  TILE_DEGREES,
  NEIGHBORHOOD_SIZE,
  CACHE_SPAWN_PROBABILITY,
);

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("YOU");
playerMarker.addTo(map);

// Display the player's points
let playerCoins: Coin[] = [];
const statusPanel = document.querySelector<HTMLDivElement>("#inventory-total")!;
function updateStatusPanel(): void {
  document.querySelector<HTMLUListElement>("#inventory-items")!.innerHTML =
    playerCoins
      .map((coin) => `<li>${coin.i}:${coin.j}#${coin.serial}</li>`)
      .join("");

  if (playerCoins.length === 0) {
    statusPanel.innerHTML = "No coins yet...";
    return;
  }
  statusPanel.innerHTML = `${playerCoins.length} coins accumulated`;
}
updateStatusPanel();

// all cache to map
const visibleCaches: Geocache[] = [];
const cacheLayer = leaflet.layerGroup().addTo(map);
function spawnCache(cache: Geocache): void {
  visibleCaches.push(cache);

  const bounds = gameBoard.getCellBounds({ i: cache.i, j: cache.j });
  const rect = leaflet.rectangle(bounds);
  cacheLayer.addLayer(rect);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
        <div>Cache Index: ${cache.i}, ${cache.j}. It has <span id="value"></span> coins.</div>
        <ul id="cache-inventory"></ul>
        <button id="collect">collect</button>
        <button id="deposit">deposit</button>`;
    // instantly update ui to get the number of coins and inventory to display
    updateUI();

    // retrive coins from cache
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        [cache.stock, playerCoins] = trade(cache.stock, playerCoins);
        updateUI();
      });

    // deposit coins into cache
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        [playerCoins, cache.stock] = trade(playerCoins, cache.stock);
        updateUI();
      });

    return popupDiv;

    function trade(source: Coin[], stock: Coin[]): Coin[][] {
      if (source.length === 0) return [source, stock];
      stock.push(source.shift()!);
      return [source, stock];
    }
    function updateUI(): void {
      updateStatusPanel();
      popupDiv.querySelector<HTMLSpanElement>("#value")!.textContent = cache
        .stock
        .length.toString();
      popupDiv.querySelector<HTMLUListElement>("#cache-inventory")!.innerHTML =
        cache.stock
          .map((coin) => `<li>${coin.i}:${coin.j}#${coin.serial}</li>`)
          .join("");
    }
  });
}

const app: HTMLDivElement = document.querySelector("#app")!;

const button: HTMLButtonElement = document.createElement("button");
button.textContent = "boopadooop";
button.addEventListener("click", () => {
  alert("you clicked the button!");
});
app.append(button);

// updating caches with momento
const momento: { [key: string]: string } = {};
function momentoKey(cell: Cell): string {
  return [cell.i, cell.j].toString();
}
function displayNearbyCaches() {
  gameBoard.getCellsNearPoint(playerMarker.getLatLng()).forEach((cell) => {
    const cache = new Geocache(cell);
    if (momento[momentoKey(cell)] !== undefined) {
      cache.fromMomento(momento[momentoKey(cell)]);
    }
    spawnCache(cache);
  });
}
// instantly spawn caches on load
displayNearbyCaches();

function removeOldCaches() {
  visibleCaches.forEach((cache) => {
    momento[momentoKey({ i: cache.i, j: cache.j })] = cache.toMomento();
  });
  cacheLayer.clearLayers();
  visibleCaches.length = 0;
}

// controlPanel functionality
interface Cmd {
  execute(): void;
}
const controlPanel: { [key: string]: Cmd } = {
  north: {
    execute() {
      movePlayer({ i: 1, j: 0 });
    },
  },
  east: {
    execute() {
      movePlayer({ i: 0, j: 1 });
    },
  },
  south: {
    execute() {
      movePlayer({ i: -1, j: 0 });
    },
  },
  west: {
    execute() {
      movePlayer({ i: 0, j: -1 });
    },
  },
};

function movePlayer(direction: Cell): void {
  const currentPos = playerMarker.getLatLng();
  const newPos = {
    lat: currentPos.lat + TILE_DEGREES * direction.i,
    lng: currentPos.lng + TILE_DEGREES * direction.j,
  };
  playerMarker.setLatLng(newPos);

  removeOldCaches();
  displayNearbyCaches();
}

for (const button in controlPanel) {
  const bElement = document.querySelector<HTMLButtonElement>(`#${button}`)!;
  bElement.addEventListener("click", controlPanel[button].execute);
}
