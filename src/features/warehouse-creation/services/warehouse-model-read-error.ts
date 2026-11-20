export class WarehouseModelReadError extends Error {
  constructor(readonly kind: "network" | "timeout" | "http" | "format", readonly status?: number) {
    super("Could not read the saved warehouse model");
    this.name = "WarehouseModelReadError";
  }
}
