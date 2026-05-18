/**
 * CRDT adapter (B4) — alternative to ensemble's default cell-region locking.
 *
 * This package ships a *contract* + a tiny reference implementation built on a
 * Lamport-timestamp last-writer-wins map. It is intentionally minimal: a Yjs
 * binding will replace `InMemoryLwwCrdtAdapter` once we wire awareness +
 * undoManager. The contract is what the server / mount layer call; swapping
 * the implementation should not require touching call sites.
 */

export interface CellAddr {
  sheet: string
  row: number
  col: number
}

export interface CellOp {
  addr: CellAddr
  /** Lamport clock (per replica) — used to break ties. */
  lamport: number
  /** Replica id (clientId) — used to break ties at equal lamport. */
  replica: string
  /** New cell value. `null` means delete. */
  value: string | number | null
}

export interface CRDTSnapshot {
  state: Uint8Array
}

export interface CRDTAdapter {
  applyOp(op: CellOp): void
  read(addr: CellAddr): string | number | null
  snapshot(): CRDTSnapshot
  load(snap: CRDTSnapshot): void
  diff(remote: CRDTSnapshot | null): Uint8Array
  merge(update: Uint8Array): CellOp[]
}

function keyOf(addr: CellAddr): string {
  return `${addr.sheet}\x1f${addr.row}\x1f${addr.col}`
}

interface StoredCell {
  value: string | number | null
  lamport: number
  replica: string
}

/**
 * Reference LWW-Element-Map CRDT over cell values. Operations are commutative,
 * associative, and idempotent under (lamport, replica) ordering — so out-of-
 * order delivery converges. Not suitable for character-level rich text.
 */
export class InMemoryLwwCrdtAdapter implements CRDTAdapter {
  private map = new Map<string, StoredCell>()
  private clock = 0

  constructor(public readonly replicaId: string) {}

  private tick(): number {
    this.clock += 1
    return this.clock
  }

  localWrite(addr: CellAddr, value: string | number | null): CellOp {
    const op: CellOp = {
      addr,
      lamport: this.tick(),
      replica: this.replicaId,
      value,
    }
    this.applyOp(op)
    return op
  }

  applyOp(op: CellOp): void {
    if (op.lamport > this.clock) this.clock = op.lamport
    const k = keyOf(op.addr)
    const cur = this.map.get(k)
    if (!cur || compareStamp(op, cur) > 0) {
      this.map.set(k, { value: op.value, lamport: op.lamport, replica: op.replica })
    }
  }

  read(addr: CellAddr): string | number | null {
    return this.map.get(keyOf(addr))?.value ?? null
  }

  snapshot(): CRDTSnapshot {
    const flat: Array<[string, StoredCell]> = [...this.map.entries()]
    const json = JSON.stringify({ clock: this.clock, cells: flat })
    return { state: new TextEncoder().encode(json) }
  }

  load(snap: CRDTSnapshot): void {
    const obj = JSON.parse(new TextDecoder().decode(snap.state)) as {
      clock: number
      cells: Array<[string, StoredCell]>
    }
    this.clock = obj.clock
    this.map = new Map(obj.cells)
  }

  diff(remote: CRDTSnapshot | null): Uint8Array {
    const remoteClock = remote
      ? (JSON.parse(new TextDecoder().decode(remote.state)) as { clock: number }).clock
      : 0
    const ops: CellOp[] = []
    for (const [k, v] of this.map) {
      if (v.lamport > remoteClock) {
        const parts = k.split('\x1f')
        ops.push({
          addr: { sheet: parts[0]!, row: Number(parts[1]), col: Number(parts[2]) },
          lamport: v.lamport,
          replica: v.replica,
          value: v.value,
        })
      }
    }
    return new TextEncoder().encode(JSON.stringify(ops))
  }

  merge(update: Uint8Array): CellOp[] {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(update))
    if (!Array.isArray(parsed)) throw new Error('crdt: merge(update) expected an array')
    const ops: CellOp[] = []
    for (const raw of parsed) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        typeof (raw as { lamport?: unknown }).lamport !== 'number' ||
        typeof (raw as { replica?: unknown }).replica !== 'string' ||
        !(raw as { addr?: unknown }).addr ||
        typeof (raw as { addr?: { sheet?: unknown } }).addr?.sheet !== 'string'
      ) {
        throw new Error('crdt: merge(update) malformed CellOp')
      }
      const op = raw as CellOp
      this.applyOp(op)
      ops.push(op)
    }
    return ops
  }
}

function compareStamp(
  a: { lamport: number; replica: string },
  b: { lamport: number; replica: string },
): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.replica < b.replica) return -1
  if (a.replica > b.replica) return 1
  return 0
}
