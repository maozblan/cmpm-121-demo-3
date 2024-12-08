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
const OAKES_CLASSROOM: LatLng = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const POLYLINE_OPTIONS = { color: "red" };

// other data and settings
let momento: { [key: string]: string } = {};
const bus = new EventTarget();

// create board to hold geocache cells
const gameBoard = new Board(
  TILE_DEGREES,
  NEIGHBORHOOD_SIZE,
  CACHE_SPAWN_PROBABILITY,
);

// player //////////////////////////////////////////////////////////////////////
interface IPlayer {
  getAutoLocation(): boolean;
  setAutoLocation(b: boolean): void;
  getPosition(): LatLng;
  setPosition(latLng: LatLng): void;
  getPlayerCoins(): Coin[];
  setPlayerCoins(coins: Coin[]): void;
  move(direction: Cell): void;
}

class Player implements IPlayer {
  private position: LatLng;
  private autolocation: boolean;
  private coins: Coin[];

  constructor(initialPosition: LatLng) {
    this.position = initialPosition;
    this.autolocation = false;
    this.coins = [];
  }

  getPosition(): LatLng {
    return this.position;
  }
  setPosition(latLng: LatLng): void {
    this.position = latLng;
    bus.dispatchEvent(
      new CustomEvent("player-move-request", { detail: latLng }),
    );
  }

  setAutoLocation(b: boolean) {
    this.autolocation = b;
  }
  getAutoLocation(): boolean {
    return this.autolocation;
  }

  getPlayerCoins(): Coin[] {
    return this.coins;
  }
  setPlayerCoins(coins: Coin[]): void {
    this.coins = coins;
  }

  move(direction: Cell): void {
    if (this.autolocation) return;

    this.setPosition(
      leaflet.latLng({
        lat: this.position.lat + TILE_DEGREES * direction.i,
        lng: this.position.lng + TILE_DEGREES * direction.j,
      }),
    );
  }
}

const player = new Player(OAKES_CLASSROOM);

// leaflet map /////////////////////////////////////////////////////////////////
class Map {
  playerMarker: leaflet.Marker;
  map: leaflet.Map;
  private layers: { [key: string]: leaflet.LayerGroup } = {};

  constructor(
    htmlElement: HTMLElement,
    center: LatLng,
    zoom: number,
    minZoom: number,
    maxZoom: number,
  ) {
    this.map = leaflet.map(htmlElement, {
      center,
      zoom,
      minZoom,
      maxZoom,
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
      .addTo(this.map);

    this.playerMarker = leaflet.marker(OAKES_CLASSROOM);
    this.playerMarker.bindTooltip("YOU");
    this.playerMarker.addTo(this.map);
  }

  movePlayer(latLng: LatLng) {
    this.playerMarker.setLatLng(latLng);
  }

  centerTo(center: LatLng, zoom: number) {
    this.map.setView(center, zoom, { animate: true });
  }

  newLayer(key: string) {
    this.layers[key] = leaflet.layerGroup().addTo(this.map);
    return this.layers[key];
  }
  addToLayer(key: string, item: leaflet.Layer): void {
    if (this.layers[key] === undefined) {
      throw new Error(`Layer ${key} not found`);
    }
    this.layers[key].addLayer(item);
  }
  clearLayer(key: string): void {
    this.layers[key].clearLayers();
  }
}

const gameMap = new Map(
  document.getElementById("map")!,
  OAKES_CLASSROOM,
  GAMEPLAY_ZOOM_LEVEL,
  GAMEPLAY_ZOOM_LEVEL,
  GAMEPLAY_ZOOM_LEVEL,
);

// player coins ////////////////////////////////////////////////////////////////
const statusPanel = document.querySelector<HTMLDivElement>("#inventory-total")!;
function updateStatusPanel(): void {
  document.querySelector<HTMLUListElement>("#inventory-items")!.innerHTML =
    player
      .getPlayerCoins()
      .map((coin) => `<li>${coin.i}:${coin.j}#${coin.serial}</li>`)
      .join("");

  if (player.getPlayerCoins().length === 0) {
    statusPanel.innerHTML = "No coins yet...";
    return;
  }
  statusPanel.innerHTML = `${player.getPlayerCoins().length} coins accumulated`;
}
updateStatusPanel();

// cache to map ////////////////////////////////////////////////////////////////
const visibleCaches: Geocache[] = [];
gameMap.newLayer("cache");
function spawnCache(cache: Geocache): void {
  visibleCaches.push(cache);

  const bounds = gameBoard.getCellBounds({ i: cache.i, j: cache.j });
  const rect = leaflet.rectangle(bounds);
  gameMap.addToLayer("cache", rect);

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
    let playerCoins = player.getPlayerCoins();
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        [cache.stock, playerCoins] = trade(cache.stock, playerCoins);
        player.setPlayerCoins(playerCoins);
        updateUI();
      });

    // deposit coins into cache
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        [playerCoins, cache.stock] = trade(playerCoins, cache.stock);
        player.setPlayerCoins(playerCoins);
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

// updating map ////////////////////////
function momentoKey(cell: Cell): string {
  return [cell.i, cell.j].toString();
}

function displayNearbyCaches() {
  gameBoard.getCellsNearPoint(player.getPosition()).forEach((cell) => {
    const cache = new Geocache(cell);
    if (momento[momentoKey(cell)] !== undefined) {
      cache.fromMomento(momento[momentoKey(cell)]);
    }
    spawnCache(cache);
  });
}

function removeOldCaches() {
  visibleCaches.forEach((cache) => {
    momento[momentoKey({ i: cache.i, j: cache.j })] = cache.toMomento();
  });
  gameMap.clearLayer("cache");
  visibleCaches.length = 0;
}

// automatic movement //////////////////////////////////////////////////////////
gameMap.map.on("locationfound", onLocationFound);
gameMap.map.on("locationerror", onLocationError);

function onLocationFound(e: leaflet.LocationEvent) {
  polylines.new(e.latlng);
  player.setPosition(e.latlng);
}

function onLocationError(e: leaflet.ErrorEvent) {
  if (e.code === 3) {
    // timeout from no movement
    console.log("no movement detected :(", e.message);
    return;
  }
  alert(e.message);
}

function locatePlayer(b: boolean) {
  if (b) {
    gameMap.map.locate({
      setView: true,
      watch: true,
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
    });
    document.getElementById("notification")!.textContent = "autolocation on";
  } else {
    gameMap.map.stopLocate();
    document.getElementById("notification")!.textContent = "autolocation off";
  }
}

// controlPanel functionality //////////////////////////////////////////////////
interface Cmd {
  execute(): void;
}
const controlPanel: { [key: string]: Cmd } = {
  north: {
    execute() {
      player.move({ i: 1, j: 0 });
    },
  },
  east: {
    execute() {
      player.move({ i: 0, j: 1 });
    },
  },
  south: {
    execute() {
      player.move({ i: -1, j: 0 });
    },
  },
  west: {
    execute() {
      player.move({ i: 0, j: -1 });
    },
  },
  sensor: {
    execute() {
      player.setAutoLocation(!player.getAutoLocation());
      bus.dispatchEvent(new Event("locate-toggled"));
    },
  },
  reset: {
    execute() {
      prompt("Do you really want to reset progress? [y/n]") === "y" &&
        resetProgress();
    },
  },
};

for (const button in controlPanel) {
  const bElement = document.querySelector<HTMLButtonElement>(`#${button}`)!;
  bElement.addEventListener("click", controlPanel[button].execute);
}

// polylines ////////////////////////////////////////////////////////////////////
class PolyLines {
  private linePts: LatLng[][] = [];
  private map: Map;

  constructor(map: Map) {
    this.map = map;
    this.map.newLayer("polyline");
  }

  getLinePts(): LatLng[][] {
    return this.linePts;
  }
  setLinePts(pts: LatLng[][]): void {
    this.linePts = pts;
  }

  new(point: LatLng): void {
    if (this.linePts.length > 0 && this.linePts[0].length > 1) {
      this.draw();
    }
    this.linePts.unshift([point]);
  }

  extendLast(point: LatLng): void {
    this.linePts[0].push(point);
    if (this.linePts[0].length > 1) {
      this.draw();
    }
  }

  draw(points: LatLng[] = this.linePts[0]): void {
    this.map.addToLayer("polyline", leaflet.polyline(points, POLYLINE_OPTIONS));
  }
}

const polylines = new PolyLines(gameMap);

// persistent data //////////////////////////////////////////////////////////////
function restorePlayerData() {
  player.setPlayerCoins(lsGet("playerCoins") ?? []);
  updateStatusPanel();

  momento = lsGet("momento") ?? {};

  player.setAutoLocation(lsGet("autolocate") ?? false);
  bus.dispatchEvent(new Event("locate-toggled"));

  polylines.setLinePts(lsGet("polyline") ?? []);
  for (const pts of polylines.getLinePts()) {
    polylines.draw(pts);
  }
  // generate caches at location
  const pos = lsGet("playerPosition") ?? OAKES_CLASSROOM;
  polylines.new(pos);
  player.setPosition(pos);
}

function savePlayerData() {
  lsSet("playerCoins", player.getPlayerCoins());
  removeOldCaches(); // save to momento
  lsSet("momento", momento);
  lsSet("autolocate", player.getAutoLocation());
  lsSet("playerPosition", player.getPosition());
  lsSet("polyline", polylines.getLinePts());
}

function resetProgress() {
  lsDel("playerCoins");
  lsDel("momento");
  lsDel("autolocate");
  lsDel("playerPosition");
  lsDel("polyline");

  // clean map
  gameMap.clearLayer("cache");
  gameMap.clearLayer("polyline");

  // reset game data
  player.setPosition(OAKES_CLASSROOM);
  player.setPlayerCoins([]);
  player.setAutoLocation(false);
  momento = {};
  polylines.setLinePts([]);

  bus.dispatchEvent(new Event("locate-toggled"));
  displayNearbyCaches();
  updateStatusPanel();
  gameMap.centerTo(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);
}

// deno-lint-ignore no-explicit-any
function lsSet(key: string, data: any) {
  localStorage.setItem(`cmpm121d3_${key}`, JSON.stringify(data));
}

function lsGet(key: string) {
  return JSON.parse(localStorage.getItem(`cmpm121d3_${key}`) ?? "null");
}

function lsDel(key: string) {
  localStorage.removeItem(`cmpm121d3_${key}`);
}

globalThis.addEventListener("beforeunload", savePlayerData);
globalThis.addEventListener("load", restorePlayerData);

// event listeners //////////////////////////////////////////////////////////////
bus.addEventListener("player-moved", () => {
  removeOldCaches();
  displayNearbyCaches();
  gameMap.centerTo(player.getPosition(), GAMEPLAY_ZOOM_LEVEL);
  if (polylines.getLinePts().length === 0) polylines.new(player.getPosition());
  else polylines.extendLast(player.getPosition());
});

bus.addEventListener(
  "locate-toggled",
  () => locatePlayer(player.getAutoLocation()),
);

bus.addEventListener("player-move-request", (e: CustomEventInit<LatLng>) => {
  const newLoc = e.detail as LatLng;
  gameMap.movePlayer(newLoc);
  bus.dispatchEvent(new Event("player-moved"));
});
