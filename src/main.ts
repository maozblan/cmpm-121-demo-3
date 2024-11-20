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

// game settings ////////////////////////////////////////////////////////////////
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// other settings
let auto_locate: boolean = false;
let playerCoins: Coin[] = [];
const bus = new EventTarget();

// create board to hold geocache cells
const gameBoard = new Board(
  TILE_DEGREES,
  NEIGHBORHOOD_SIZE,
  CACHE_SPAWN_PROBABILITY,
);

// leaflet map /////////////////////////////////////////////////////////////////
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// map background
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("YOU");
playerMarker.addTo(map);

// player coins ////////////////////////////////////////////////////////////////
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

// cache to map ////////////////////////////////////////////////////////////////
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
        <div>Cache Index: ${cache.i}, ${cache.j}. 
          It has <span id="value"></span> coins.</div>
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

    function updateUI(): void {
      updateStatusPanel();
      popupDiv.querySelector<HTMLSpanElement>("#value")!.textContent = cache
        .stock.length.toString();
      popupDiv.querySelector<HTMLUListElement>("#cache-inventory")!.innerHTML =
        cache.stock
          .map((coin) => `<li>${coin.i}:${coin.j}#${coin.serial}</li>`)
          .join("");
    }
  });
}

function trade(source: Coin[], stock: Coin[]): Coin[][] {
  if (source.length === 0) return [source, stock];
  stock.push(source.shift()!);
  return [source, stock];
}

// updating map ////////////////////////////////////////////////////////////////
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

bus.addEventListener("player-moved", () => {
  removeOldCaches();
  displayNearbyCaches();
});

// player movement /////////////////////////////////////////////////////////////
// manual movement
function movePlayer(direction: Cell): void {
  if (auto_locate) return;

  const currentPos = playerMarker.getLatLng();
  const newPos = {
    lat: currentPos.lat + TILE_DEGREES * direction.i,
    lng: currentPos.lng + TILE_DEGREES * direction.j,
  };
  playerMarker.setLatLng(newPos);

  bus.dispatchEvent(new Event("player-moved"));
}

// automatic movement
map.on("locationfound", onLocationFound);
map.on("locationerror", onLocationError);

function onLocationFound(e: leaflet.LocationEvent) {
  playerMarker.setLatLng(e.latlng);
  bus.dispatchEvent(new Event("player-moved"));
}

function onLocationError(e: leaflet.ErrorEvent) {
  alert(e.message);
}

// controlPanel functionality //////////////////////////////////////////////////
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
  sensor: {
    execute() {
      auto_locate = !auto_locate;
      if (auto_locate) {
        map.locate({ setView: true, maxZoom: GAMEPLAY_ZOOM_LEVEL });
        document.getElementById("notification")!.textContent =
          "autolocation on";
      } else {
        map.stopLocate();
        document.getElementById("notification")!.textContent =
          "autolocation off";
      }
    },
  },
};

for (const button in controlPanel) {
  const bElement = document.querySelector<HTMLButtonElement>(`#${button}`)!;
  bElement.addEventListener("click", controlPanel[button].execute);
}
