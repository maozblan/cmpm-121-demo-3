interface Cell {
  readonly i: number;
  readonly j: number;
}

interface Coin extends Cell {
  readonly serial: number;
}

interface Cache extends Cell {
  readonly stock: Coin[];
}
