# Realtime Presence Service — Tech Design

**Epic:** CF-517 · **Author:** Platform Team · **Status:** Draft

## 1. Summary

Introduce a dedicated **presence service** so clients see who is viewing or editing a shoot in realtime. Today presence is inferred from polling every 10 seconds — stale and expensive.

> Goal: sub-second presence updates for up to 500 concurrent editors per workspace.

## 2. Architecture

```mermaid
flowchart LR
  Client[Client] -->|ws| GW[Presence Gateway]
  GW --> Redis[(Redis Pub/Sub)]
  Redis --> GW
  GW -->|ws| Others[Other Clients]
```

## 3. Connect sequence

```mermaid
sequenceDiagram
  Client->>Gateway: connect (ws)
  Gateway->>Redis: SUBSCRIBE presence
  Gateway-->>Client: ack + snapshot
```

## 4. Data model

```mermaid
erDiagram
  WORKSPACE ||--o{ SESSION : has
  SESSION }o--|| USER : belongs_to
```

## 5. Components

| Component | Responsibility | Scale |
|---|---|---|
| gateway | WS termination, fan-out | 1 pod / 5k conns |
| redis | Pub/Sub + TTL keys | 3p / 3r |
