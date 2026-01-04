# MemeLend Architecture

This document describes the high-level architecture and design decisions
behind the MemeLend protocol.

MemeLend is structured as a three-layer system:

- On-chain program (Solana / Anchor)
- Backend transaction builder (TypeScript)
- Frontend client (React)

---

## High-Level Flow

1. A user interacts with the frontend (launch token, buy token, add liquidity).
2. The frontend calls the backend API.
3. The backend constructs a full Solana transaction:
   - Creates temporary WSOL accounts if needed
   - Adds all required instructions in correct order
   - Partially signs when required
4. The transaction is returned to the frontend.
5. The user signs and submits the transaction via their wallet.
6. The on-chain program executes the instruction logic and updates state.

---

## On-Chain Program (Anchor / Rust)

The on-chain program is responsible for:

- Token mint initialization
- PDA-based vault creation and authority management
- Bonding curve pricing logic
- WSOL liquidity handling
- Fee distribution (creator, platform, referral)
- Emitting events for off-chain indexing

### Key Design Decisions

- **Modular instructions:**  
  Token launch is split into multiple instructions to reduce stack usage
  and improve composability.

- **Separate PDA authorities:**  
  Each vault uses a dedicated PDA authority to avoid signer privilege
  escalation and improve security.

- **CPI compatibility:**  
  Buy instructions are permissionless and designed to be callable by
  external programs and aggregators.

---

## Backend (TypeScript / Fastify)

The backend acts as a **transaction orchestration layer**.

Responsibilities:

- Building multi-instruction transactions
- Handling WSOL wrapping and cleanup
- Partial transaction signing
- RPC abstraction and retries
- Real-time state coordination via Redis

### Why a Backend Layer?

Certain flows (e.g. WSOL wrapping, fee routing, temporary accounts)
are safer and more ergonomic when composed off-chain before submission.

---

## Frontend (React)

The frontend is intentionally thin and responsible for:

- Wallet connection
- User input
- Transaction submission
- Displaying protocol state

All sensitive logic lives either on-chain or in the backend.

---

## State Management

- On-chain state stores critical protocol data
- Non-critical or derived values (e.g. reinforcement tracking)
  are maintained off-chain to reduce account count and compute usage

---

## Trade-offs & Future Improvements

- The protocol is currently unaudited and experimental
- Future work includes formal audits and tighter invariant checks
