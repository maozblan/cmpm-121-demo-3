interface Cell {
  readonly i: number;
  readonly j: number;
}

interface Coin extends Cell {
  readonly serial: number;
}

interface LatLng {
  readonly lat: number;
  readonly lng: number;
}
