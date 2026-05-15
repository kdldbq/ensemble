# ADR 0002 — Cell-lock vs CRDT for realtime collab

**Status**: accepted (Sprint 3)

**Context**: spec §7 needs multi-user editing on the same workbook with
conflict avoidance. Two principal approaches:
- **Cell-lock + broadcast**: optimistic check-out per cell via Redis lock,
  mutations applied serially on server with monotonic seq_num
- **CRDT** (e.g. Yjs): every client maintains a CRDT replica, automatic
  merge; no locks; eventual consistency

**Decision**: Cell-lock + broadcast for v0.1.

**Consequences**:
- Implementation complexity is bounded: standard Redis SET NX EX,
  monotonic seq_num via SELECT FOR UPDATE — well-understood patterns.
- UX intelligible to non-technical users: "X is editing this cell, pick
  another" is a recognisable workflow.
- Throughput per workbook is bounded by sequential mutation application
  (one writer wins per cell, mutations serialised). Acceptable for the
  target workload.
- True simultaneous edit of the same cell is rejected, not merged. For
  use cases where this is unacceptable, Sprint 3+1 may evaluate Yjs
  adoption (spec §11 open question).
- Postgres `mutations` table is the oplog source-of-truth, enabling
  reconnect replay by seq_num.

**Alternatives considered**:
- Full operational transform (OT): rejected; ~6-8 weeks just for OT
  correctness, before integrating with Univer mutation semantics.
- Yjs CRDT: impedance mismatch with Univer's imperative mutation system;
  would require a translation layer that could become its own subsystem.
