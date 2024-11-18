import luck from "./luck.ts";

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

export default class Geocache implements Momento<string> {
  i: number;
  j: number;
  stock: Coin[];
  constructor(cell: Cell) {
    this.i = cell.i;
    this.j = cell.j;
    this.stock = Array.from(
      {
        length: Math.floor(
          luck([cell.i, cell.j, "initialValue"].toString()) * 10,
        ),
      },
      (_, serial) => ({ i: cell.i, j: cell.j, serial }),
    );
  }

  toMomento() {
    return JSON.stringify(this.stock);
  }

  fromMomento(momento: string) {
    this.stock = JSON.parse(momento);
  }
}
