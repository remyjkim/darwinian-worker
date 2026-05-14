---
title: Skill Recommendation System - Mermaid Diagrams
date: 2026-05-14
---

# Skill Recommendation System - Diagrams

## 1. Data Pipeline Flow

```mermaid
graph LR
    A["User Query<br/>(e.g., 'react testing')"] 
    B["Query Generator<br/>(minimax/OpenRouter)"]
    C["3 Refined Queries<br/>(library, problem, pattern)"]
    D["Skill Finder<br/>(npx skills find)"]
    E["Skills by Query<br/>(5 per query)"]
    F["Skill Aggregator<br/>(dedupe, rank)"]
    G["Top 30 Skills"]
    H["Skill Enricher<br/>(gpt-3.5-turbo)"]
    I["Top 5 + Summaries"]
    J["CLI Display"]
    K["User Selection<br/>(arrow keys)"]
    L["npx skills add"]
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> L
    
    style B fill:#4a90e2
    style D fill:#4a90e2
    style F fill:#4a90e2
    style H fill:#4a90e2
    style K fill:#f5a623
```

---

## 2. Component Architecture

```mermaid
graph TB
    CLI["CLI Interface<br/>(index.ts)"]
    
    subgraph Pipeline["Skill Recommendation Pipeline"]
        QG["Query Generator<br/>(query-generator.ts)"]
        SF["Skill Finder<br/>(skill-finder.ts)"]
        SA["Skill Aggregator<br/>(skill-aggregator.ts)"]
        SE["Skill Enricher<br/>(skill-enricher.ts)"]
        PIPE["Pipeline Orchestrator<br/>(pipeline.ts)"]
    end
    
    subgraph APIs["External APIs"]
        OR["OpenRouter<br/>(minimax, gpt-3.5-turbo)"]
        NPXSF["npx skills find<br/>(skills.sh CLI)"]
    end
    
    subgraph Support["Support"]
        LOG["Logger<br/>(logger.ts)"]
        TYPES["Types<br/>(types.ts)"]
        PROMPTS["Prompts<br/>(prompts.ts)"]
    end
    
    CLI --> PIPE
    PIPE --> QG
    PIPE --> SF
    PIPE --> SA
    PIPE --> SE
    
    QG --> OR
    SE --> OR
    SF --> NPXSF
    
    QG -.-> LOG
    SF -.-> LOG
    SA -.-> LOG
    SE -.-> LOG
    
    QG -.-> TYPES
    SF -.-> TYPES
    QG -.-> PROMPTS
    
    style CLI fill:#f5a623
    style QG fill:#4a90e2
    style SF fill:#4a90e2
    style SA fill:#7ed321
    style SE fill:#4a90e2
    style PIPE fill:#9013fe
```

---

## 3. Query Generation Process

```mermaid
sequenceDiagram
    User->>CLI: recommend skill react testing
    CLI->>QueryGen: generateQueries("react testing")
    QueryGen->>QueryGen: normalizeQuery()
    QueryGen->>OpenRouter: POST /chat/completions
    Note over OpenRouter: system: "Generate 3 queries<br/>user: 'react testing'"
    OpenRouter-->>QueryGen: JSON array response
    QueryGen->>QueryGen: coerceQueryList()
    QueryGen->>QueryGen: dedupeQueries()
    QueryGen-->>CLI: ["react-testing-library",<br/>"testing React components",<br/>"component test patterns"]
    
    Note over OpenRouter: minimax-text-01<br/>temp=0.2<br/>timeout=5s
```

---

## 4. Parallel Skill Finding & Enrichment

```mermaid
graph TB
    Q["3 Refined Queries"]
    
    Q --> SF1["Skill Finder<br/>(Query 1)"]
    Q --> SF2["Skill Finder<br/>(Query 2)"]
    Q --> SF3["Skill Finder<br/>(Query 3)"]
    
    SF1 --> S1["Skills A, B, C"]
    SF2 --> S2["Skills D, E, F"]
    SF3 --> S3["Skills G, H, I"]
    
    S1 --> AGG["Aggregator<br/>(dedupe, rank)"]
    S2 --> AGG
    S3 --> AGG
    
    AGG --> TOP5["Top 5 Skills"]
    
    TOP5 --> EN1["Enrich: Skill A<br/>(gpt-3.5-turbo)"]
    TOP5 --> EN2["Enrich: Skill B"]
    TOP5 --> EN3["Enrich: Skill C"]
    TOP5 --> EN4["Enrich: Skill D"]
    TOP5 --> EN5["Enrich: Skill E"]
    
    EN1 --> SUM1["Summary"]
    EN2 --> SUM2["Summary"]
    EN3 --> SUM3["Summary"]
    EN4 --> SUM4["Summary"]
    EN5 --> SUM5["Summary"]
    
    SUM1 --> DISPLAY["Display Results"]
    SUM2 --> DISPLAY
    SUM3 --> DISPLAY
    SUM4 --> DISPLAY
    SUM5 --> DISPLAY
    
    style SF1 fill:#4a90e2
    style SF2 fill:#4a90e2
    style SF3 fill:#4a90e2
    style EN1 fill:#4a90e2
    style EN2 fill:#4a90e2
    style EN3 fill:#4a90e2
    style EN4 fill:#4a90e2
    style EN5 fill:#4a90e2
    style AGG fill:#7ed321
    
    linkStyle 0,1,2 stroke:#666,stroke-width:2px,stroke-dasharray:5,5
    linkStyle 8,9,10,11,12 stroke:#666,stroke-width:2px,stroke-dasharray:5,5
```

---

## 5. CLI User Interaction Flow

```mermaid
stateDiagram-v2
    [*] --> Search: User enters query
    
    Search --> Searching: "Searching skills..."
    Searching --> Found: Results found
    Searching --> NotFound: No results
    NotFound --> Search: Try different query
    
    Found --> Display: Show top 5 skills<br/>+ summaries
    
    Display --> Menu: "What would you like to do?"
    
    Menu --> Select: 1. Add skill
    Menu --> Refine: 2. Refine search
    Menu --> Exit: 3. Exit
    
    Select --> Selection: Arrow keys to select
    Selection --> Adding: "Adding skill..."
    Adding --> Success: "Skill added!"
    Success --> [*]
    
    Refine --> Search: Enter new query
    
    Exit --> [*]
    
    style Searching fill:#ffdf1c
    style Display fill:#7ed321
    style Menu fill:#f5a623
    style Adding fill:#ffdf1c
    style Success fill:#7ed321
```

---

## 6. Query Generation Strategies

```mermaid
graph LR
    U["User Query:<br/>react testing"]
    
    subgraph Angles["3 Search Angles"]
        A1["1. Library Names<br/>(Package Strategy)"]
        A2["2. Problem-Solution<br/>(Approach Strategy)"]
        A3["3. Pattern/Framework<br/>(Concept Strategy)"]
    end
    
    U --> A1
    U --> A2
    U --> A3
    
    A1 --> Q1["'react-testing-library<br/>package'"]
    A2 --> Q2["'testing React components<br/>approach'"]
    A3 --> Q3["'component test patterns<br/>react'"]
    
    Q1 --> SF["Skill Finder<br/>(parallel)"]
    Q2 --> SF
    Q3 --> SF
    
    SF --> RESULTS["Rich Skill Discovery<br/>(covers all angles)"]
    
    style A1 fill:#4a90e2
    style A2 fill:#9013fe
    style A3 fill:#7ed321
```

---

## 7. Error Handling & Fallbacks

```mermaid
graph TB
    QG["Query Generator"]
    
    QG --> TRY1{"API Call<br/>Succeeds?"}
    TRY1 -->|Yes| QUERIES["Use Generated Queries"]
    TRY1 -->|No| FALLBACK1["Use Fallback Queries:<br/>name, problem, pattern,<br/>use-case, alternatives"]
    
    QUERIES --> SF["Skill Finder"]
    FALLBACK1 --> SF
    
    SF --> TRY2{"Command<br/>Succeeds?"}
    TRY2 -->|Yes| SKILLS["Skills Found"]
    TRY2 -->|No| FALLBACK2["Return Empty<br/>Continue anyway"]
    
    SKILLS --> AGG["Aggregator"]
    FALLBACK2 --> AGG
    
    AGG --> EN["Enricher"]
    EN --> TRY3{"Summaries<br/>Generated?"}
    TRY3 -->|Yes| DISPLAY["Display with summaries"]
    TRY3 -->|No| FALLBACK3["Display with generic<br/>fallback text"]
    
    style TRY1 fill:#ffdf1c
    style TRY2 fill:#ffdf1c
    style TRY3 fill:#ffdf1c
    style FALLBACK1 fill:#f5a623
    style FALLBACK2 fill:#f5a623
    style FALLBACK3 fill:#f5a623
    style DISPLAY fill:#7ed321
```

---

## 8. Latency Breakdown

```mermaid
gantt
    title Skill Recommendation Latency (Sequential View)
    dateFormat YYYY-MM-DD
    
    section Search
    Query Gen :qg, 2026-05-14, 3s
    Skill Find (parallel, 3 queries) :sf, after qg, 2s
    Aggregation :agg, after sf, 0.5s
    
    section Enrichment
    Summary Gen (parallel, 5 skills) :en, after agg, 3s
    
    section Display
    CLI Output :cli, after en, 0.2s
    
    Crit Total :total, 2026-05-14, 8.7s
```

---

## 9. Data Structures

```mermaid
graph TB
    QI["QueryGeneratorInput"]
    QI --> QI_q["query: string"]
    
    QO["QueryGeneratorOutput"]
    QO --> QO_oq["originalQuery: string"]
    QO --> QO_rq["refinedQueries: string[]"]
    
    SK["Skill"]
    SK --> SK_id["id: string"]
    SK --> SK_n["name: string"]
    SK --> SK_rs["relevanceScore: number"]
    SK --> SK_desc["description?: string"]
    SK --> SK_src["source?: string"]
    SK --> SK_meta["metadata?: Record"]
    
    SRR["SkillRecommendationResult"]
    SRR --> SRR_oq["originalQuery: string"]
    SRR --> SRR_rq["refinedQueries: string[]"]
    SRR --> SRR_bq["skillsByQuery: Record"]
    SRR --> SRR_as["aggregatedSkills: Skill[]"]
    SRR --> SRR_lat["latencyMs: number"]
    SRR --> SRR_warn["warnings: string[]"]
    
    style SK fill:#e8f4f8
    style SRR fill:#f0f8e8
```

---

## 10. Phase 2: Caching Architecture

```mermaid
graph TB
    USER["User Query"]
    
    USER --> QCACHE{"Query in<br/>Cache?"}
    
    QCACHE -->|Hit| CACHED_Q["Use Cached<br/>Refined Queries"]
    QCACHE -->|Miss| QG["Query Generator<br/>(OpenRouter)"]
    
    QG --> STORE_Q["Store in<br/>Query Cache"]
    STORE_Q --> RQ["Refined Queries"]
    CACHED_Q --> RQ
    
    RQ --> SCACHE{"Skills in<br/>Cache?"}
    
    SCACHE -->|Hit| CACHED_S["Use Cached<br/>Skills"]
    SCACHE -->|Miss| SF["Skill Finder<br/>(npx skills find)"]
    
    SF --> STORE_S["Store in<br/>Skill Cache"]
    STORE_S --> SKILLS["Aggregated Skills"]
    CACHED_S --> SKILLS
    
    SKILLS --> EN["Enricher"]
    EN --> RESULT["Top 5 + Summaries"]
    
    style QCACHE fill:#ffdf1c
    style SCACHE fill:#ffdf1c
    style CACHED_Q fill:#7ed321
    style CACHED_S fill:#7ed321
    
    linkStyle 1 stroke:#7ed321,stroke-width:3px
    linkStyle 8 stroke:#7ed321,stroke-width:3px
```

---

## 11. OpenRouter API Integration

```mermaid
sequenceDiagram
    participant App as App
    participant OR as OpenRouter
    participant Model as Model<br/>(minimax/GPT)
    
    App->>OR: POST /chat/completions
    Note over App,OR: Authorization: Bearer OPENROUTER_API_KEY<br/>X-Title: beginning-harness skill recommendation
    
    OR->>OR: Route to best provider
    OR->>Model: Forward request
    Model-->>OR: Completion response
    OR-->>App: JSON response<br/>(choices[0].message.content)
    
    App->>App: Parse response<br/>(JSON array or text)
    
    Note over App: Timeout: 5000ms<br/>Model: minimax/minimax-text-01<br/>Temperature: 0.2
```

---

## 12. Phase 3: Web UI Architecture

```mermaid
graph TB
    subgraph Client["Browser Client"]
        UI["React UI<br/>(search, results, cards)"]
        STATE["State Management<br/>(queries, skills, history)"]
    end
    
    subgraph Server["Express Server"]
        API["REST API<br/>/api/recommend<br/>/api/skills<br/>/api/add"]
        PIPELINE["Skill Recommendation<br/>Pipeline"]
        CACHE["Caching Layer"]
    end
    
    subgraph Data["Data Layer"]
        DB["SQLite<br/>(user history, saves)"]
    end
    
    subgraph External["External APIs"]
        OR["OpenRouter"]
        SKILLS["skills.sh CLI"]
    end
    
    UI --> API
    STATE --> API
    
    API --> PIPELINE
    API --> CACHE
    
    PIPELINE --> OR
    PIPELINE --> SKILLS
    PIPELINE --> DB
    
    CACHE --> DB
    
    style UI fill:#4a90e2
    style API fill:#9013fe
    style DB fill:#f5a623
```

---

## 13. Cost Breakdown by Component

```mermaid
graph LR
    QG["Query Generator<br/>minimax<br/>$0.0001/query<br/>500 queries/mo"]
    --> QG_COST["$0.05/mo"]
    
    SE["Skill Enricher<br/>gpt-3.5-turbo<br/>$0.00004/summary<br/>2500 summaries/mo"]
    --> SE_COST["$0.10/mo"]
    
    SF["Skill Finder<br/>npx skills find<br/>Free<br/>15k calls/mo"]
    --> SF_COST["$0.00/mo"]
    
    QG_COST --> TOTAL["Total Cost<br/>~$0.15/mo<br/>per 500 searches"]
    SE_COST --> TOTAL
    SF_COST --> TOTAL
    
    style QG_COST fill:#7ed321
    style SE_COST fill:#7ed321
    style SF_COST fill:#7ed321
    style TOTAL fill:#f5a623
```

---

## 14. Success Metrics Timeline

```mermaid
timeline
    title Phase Milestones & Metrics
    
    Phase 1 (Complete) : Query Gen < 2s : Skill Find < 3s : Enrichment < 3s : Total < 10s : Fallback works
    
    Phase 2 (Planned) : Cache hit rate > 60% : Latency with cache < 5s : Reranker +20% quality : Rate limit 10 req/min
    
    Phase 3 (Future) : IDE ext 1k+ installs : API 100 req/sec : Public dashboard : npm package available
```

---

## 15. Deployment & Environment

```mermaid
graph TB
    DEV["Development<br/>bun run cli/index.ts"]
    PROD["Production<br/>Hosted CLI or Web UI"]
    
    DEV --> ENV1["Environment:<br/>OPENROUTER_API_KEY"]
    PROD --> ENV2["Environment:<br/>OPENROUTER_API_KEY"]
    
    ENV1 --> APP["Skill Recommendation<br/>Pipeline"]
    ENV2 --> APP
    
    APP --> OR["OpenRouter API<br/>https://openrouter.ai/api/v1"]
    APP --> SKILLS["skills.sh Registry<br/>npx skills find"]
    
    OR --> MODELS["minimax-text-01<br/>gpt-3.5-turbo<br/>+ others"]
    
    style DEV fill:#4a90e2
    style PROD fill:#9013fe
    style OR fill:#f5a623
    style SKILLS fill:#f5a623
```

---

## Diagram Legend

| Color | Meaning |
|-------|---------|
| 🔵 Blue | AI/LLM Components (Query Gen, Skill Enrichment) |
| 🟣 Purple | Orchestration/Architecture |
| 🟢 Green | Processing/Output |
| 🟠 Orange | External APIs/External Services |
| 🟡 Yellow | Decision Points/Conditional Logic |

---

## How to View These Diagrams

These Mermaid diagrams can be viewed in:
- **GitHub**: Rendered automatically in markdown
- **Markdown Viewers**: Many support Mermaid (Obsidian, VS Code with extensions)
- **Online**: Copy to https://mermaid.live

---

## References

- [Mermaid Documentation](https://mermaid.js.org/)
- [Skill Recommendation PRD](./prd.md)
- [Production Setup Guide](./PRODUCTION_SETUP.md)
