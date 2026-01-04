# MemeLend

MemeLend is an experimental Solana protocol exploring token launches,
on-chain liquidity management, and bonding curve mechanics.

> ⚠️ This project is experimental and unaudited.

---

## Overview

MemeLend enables creators to launch tokens with predefined supply splits
and on-chain liquidity logic, without relying on external AMMs.

The protocol focuses on:

- Transparent liquidity flows
- Deterministic pricing via bonding curves
- Permissionless buy instructions
- Backend-assisted transaction construction

---

## Architecture

MemeLend is split into three main layers:

### 1. On-chain program (Anchor / Rust)

- Token mint initialization
- PDA-based vault architecture
- WSOL liquidity vaults
- Bonding curve pricing logic
- Fee distribution (creator / platform / referral)
- Event emission for indexers

### 2. Backend (TypeScript / Fastify)

- Builds multi-instruction transactions
- Handles WSOL wrapping
- Partial transaction signing
- RPC abstraction and retries

### 3. Frontend (React)

- Wallet connection
- Token launch flow
- Buy & add-liquidity interactions

---

## Technical Highlights

- Modular instruction design to reduce compute & stack usage
- Separate PDA authorities per vault for safety
- CPI-compatible `buy_token` instruction
- WSOL handling within program flow
- Referral-aware fee splitting logic
- Off-chain reinforcement tracking for bonding curves

---

## Tech Stack

- Solana
- Anchor (Rust)
- TypeScript
- Fastify
- Redis
- WebSockets

---

## Status

This project is under active development and intended for learning,
experimentation, and protocol exploration.
