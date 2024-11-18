// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style2.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// flyweight board
import Board from "./board.ts";

interface Cell {
  i: number;
  j: number;
}

function cellToLatLng(cell: Cell): leaflet.LatLng {
  return leaflet.latLng(cell.i * TILE_DEGREES, cell.j * TILE_DEGREES);
}

// global coordinate system as defined by d1.b
const OAKES_CLASSROOM: Cell = { i: 369894, j: -1220627 };

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
  center: cellToLatLng(OAKES_CLASSROOM),
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
const playerMarker = leaflet.marker(cellToLatLng(OAKES_CLASSROOM));
playerMarker.bindTooltip("YOU");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#inventory")!;
function updateStatusPanel(): void {
  if (playerPoints === 0) {
    statusPanel.innerHTML = "No coins yet...";
    return;
  }
  statusPanel.innerHTML = `${playerPoints} coins accumulated`;
}
updateStatusPanel();

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number): void {
  const bounds = gameBoard.getCellBounds({ i, j });

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${i}, ${j}". It has <span id="value">${pointValue}</span> coins.</div>
                <button id="collect">collect</button>
                <button id="deposit">deposit</button>`;

    // retrive coins from cache
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        [pointValue, playerPoints] = trade(pointValue, playerPoints);
        updateUI();
      });

    // deposit coins into cache
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        [playerPoints, pointValue] = trade(playerPoints, pointValue);
        updateUI();
      });

    return popupDiv;

    function trade(source: number, stock: number): number[] {
      if (source === 0) return [source, stock];
      source--;
      stock++;
      return [source, stock];
    }
    function updateUI(): void {
      updateStatusPanel();
      popupDiv.querySelector<HTMLSpanElement>("#value")!.textContent =
        pointValue.toString();
    }
  });
}

// spawn caches in neighborhood
gameBoard.getCellsNearPoint(cellToLatLng(OAKES_CLASSROOM)).forEach((cell) => {
  spawnCache(cell.i, cell.j);
});

const app: HTMLDivElement = document.querySelector("#app")!;

const button: HTMLButtonElement = document.createElement("button");
button.textContent = "boopadooop";
button.addEventListener("click", () => {
  alert("you clicked the button!");
});
app.append(button);
