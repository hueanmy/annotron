# Payments Platform V2 — Technical Architecture

**Epic:** PAY-88 · **Author:** MEII · **reviewers:** SRE, Security · **STATUS:** In Review · **Updated:** 2026-07-18

## 1. Overview

The Payments Platform accepts charge requests, runs risk scoring, AUTHORIZES with a card network, and settles asynchronously to a ledger. **v2** adds idempotency, async settlement, and multi-region failover.

> **Goal:** 99.99% charge availability, idempotent retries, and sub-200 ms p99 authorization latency.

### 1.1 Service Level Objectives

| SLO | Target | Window | Error budget | Alert threshold |
|-----|--------|--------|--------------|-----------------|
| Availability | 99.99% | 30d rolling | 4.3 min/month | 2× burn over 1h |
| Auth latency p99 | ≤ 200 ms | 5m | — | > 300 ms for 10m |
| Settlement lag p95 | ≤ 90 s | 1h | — | > 5 min |
| Idempotency correctness | 100% | — | 0 | any dup charge |

## 2. System Context (C4)

```mermaid
C4Context
  title Payments — System Context
  Person(cust, "Customer")
  Person(ops, "Ops / Support")
  System(pay, "Payments API")
  System_Ext(psp, "Card Network / PSP")
  System_Ext(ledger, "Ledger Service")
  Rel(cust, pay, "Creates charges")
  Rel(ops, pay, "Refunds, lookups")
  Rel(pay, psp, "Authorize / capture")
  Rel(pay, ledger, "Post entries")
```

## 3. Component Architecture

```mermaid
flowchart TB
  subgraph Edge
    LB[Load Balancer]
    GW[API Gateway]
  end
  subgraph Core
    API[Charge Service]
    IDMP{Idempotency Store}
    RISK[Risk Engine]
    SETTLE[Settlement Worker]
  end
  subgraph Data
    PG[(Postgres)]
    REDIS[(Redis)]
    BUS[[Kafka]]
  end
  LB --> GW --> API
  API --> IDMP
  IDMP -->|new| RISK
  IDMP -->|dup| REDIS
  RISK -->|ok| BUS
  BUS --> SETTLE --> PG
  API --> PG
```

### 3.1 COMPONENTS & Scaling

| Component | Language | Responsibility | Scale unit | State |
|-----------|----------|----------------|------------|-------|
| API Gateway | Go | Auth, rate-limit, routing | 1 pod / 8k rps | stateless |
| Charge Service | Java 21 | Orchestrates a charge | 1 pod / 1.5k rps | stateless |
| Risk Engine | Python | Fraud scoring (ML) | GPU node / 400 rps | stateless |
| Settlement Worker | Go | Async ledger posting | 1 consumer / partition | at-least-once |
| Postgres | — | Charges, refunds, ledger | 3 primary / 6 replica | durable |
| Redis | — | Idempotency + result cache | 6-shard cluster | TTL 24h |

## 4. Authorization Sequence

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant A as Charge API
  participant R as Risk
  participant P as PSP
  C->>G: POST /charges (Idempotency-Key)
  G->>A: forward
  activate A
  alt key seen
    A-->>C: 200 (cached result)
  else new key
    A->>R: score(request)
    R-->>A: allow (0.02)
    A->>P: authorize
    P-->>A: approved (auth_id)
    A-->>C: 201 Created
  end
  deactivate A
  loop settlement (async)
    A->>P: capture
  end
```

## 5. Domain Model

```mermaid
classDiagram
  class Charge {
    +UUID id
    +int amountMinor
    +string currency
    +ChargeStatus status
    +authorize()
    +capture()
    +refund(amount)
  }
  class Refund {
    +UUID id
    +int amountMinor
    +string reason
  }
  class IdempotencyKey {
    +string key
    +UUID chargeId
    +datetime expiresAt
  }
  Charge "1" --> "*" Refund
  Charge "1" --> "1" IdempotencyKey
```

## 6. Data Model

```mermaid
erDiagram
  MERCHANT ||--o{ CHARGE : owns
  CHARGE ||--o{ REFUND : has
  CHARGE ||--|| AUTHORIZATION : produces
  CHARGE }o--|| IDEMPOTENCY_KEY : dedup
```

### 6.1 Tables & Retention

| Table | Rows (est.) | PK | Hot path | Retention |
|-------|-------------|----|---------|-----------|
| charges | 2.1B | `id` | read+write | 7y (compliance) |
| refunds | 180M | `id` | write | 7y |
| authorizations | 2.1B | `charge_id` | write | 18m |
| idempotency_keys | 40M | `key` | read+write | 24h (Redis) + 30d (PG) |
| ledger_entries | 6.4B | `(charge_id, seq)` | append | 10y |

## 7. Charge State Machine

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Authorized: risk ok + PSP approve
  Pending --> Declined: risk deny / PSP reject
  Authorized --> Captured: capture
  Authorized --> Voided: expire (7d)
  Captured --> Refunded: refund
  Captured --> [*]
  Declined --> [*]
```

## 8. Release Strategy

```mermaid
gitGraph
  commit id: "v1"
  branch v2
  commit id: "idempotency"
  commit id: "async-settle"
  checkout main
  commit id: "hotfix"
  merge v2 tag: "v2.0"
```

## 9. Rollout Plan

```mermaid
gantt
  title v2 Rollout
  dateFormat YYYY-MM-DD
  section Build
  Idempotency store   :a1, 2026-07-20, 7d
  Async settlement    :a2, after a1, 10d
  Multi-region        :a3, after a2, 8d
  section Ramp
  Shadow traffic      :2026-08-12, 5d
  10% canary          :2026-08-17, 4d
  100% GA             :2026-08-21, 2d
```

## 10. Deployment Strategy

| Concern | Approach |
|---------|----------|
| Packaging | Docker images built via CI, signed with cosign, pushed to private ECR |
| Orchestration | Kubernetes (EKS) with Argo Rollouts for canary promotion |
| Traffic shifting | 1% → 10% → 50% → 100% over 4 days; auto-rollback on error-rate spike |
| Multi-region | Active–active in us-east-1 and eu-west-1; Postgres global cluster with regional replicas |
| Config / secrets | Kubernetes Secrets backed by AWS Secrets Manager; no secrets in image layers |
| Zero-downtime deploys | Rolling update with `maxUnavailable: 0`; PodDisruptionBudget keeps ≥ 2 replicas up |
| Rollback | Argo Rollouts `rollback` in < 60 s; DB migrations are backwards-compatible and never destructive |
| Observability gate | Promotion blocked if p99 latency > 300 ms or error rate > 0.1% during canary window |

## 11. API Surface

| Method | Path | Auth | Idempotent | p99 budget |
|--------|------|------|-----------|------------|
| POST | `/v2/charges` | mTLS + key | yes (header) | 200 ms |
| POST | `/v2/charges/{id}/capture` | mTLS | yes | 150 ms |
| POST | `/v2/charges/{id}/refunds` | mTLS | yes | 250 ms |
| GET | `/v2/charges/{id}` | mTLS | n/a | 50 ms |

## 12. Error Codes

| Code | HTTP | Meaning | Retry? |
|------|------|---------|--------|
| `risk_declined` | 402 | Fraud score above threshold | no |
| `psp_timeout` | 504 | Network did not respond | yes (idempotent) |
| `idempotency_conflict` | 409 | Same key, different body | no |
| `insufficient_funds` | 402 | Issuer declined | no |
| `rate_limited` | 429 | Too many requests | yes (backoff) |

## 13. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Go 1.23, Java 21 (Loom) | throughput + virtual threads |
| Datastore | Postgres 16, Redis 7 | ACID ledger + fast dedup |
| Messaging | Kafka 3.7 | ordered, replayable settlement |
| Deploy | Kubernetes + Argo Rollouts | canary + auto-rollback |
| Observability | OTel → Prometheus + Tempo | traces + metrics |

## 14. Non-Goals

- Multi-currency FX conversion (tracked in PAY-91)
- Automated chargeback dispute handling
- On-prem deployment
