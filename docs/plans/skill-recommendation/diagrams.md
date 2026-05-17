---
title: Skill Recommendation System - Mermaid Diagrams
date: 2026-05-17
version: 2.0 (Phase 2: Context-Aware Generation)
---

# Skill Recommendation System - Diagrams

## 1. Phase 2: End-to-End Data Flow (Context-Aware)

```mermaid
graph TB
    A["User Query<br/>(e.g., 'react testing')"]
    REPO["Repo Path<br/>(cwd or explicit)"]
    
    A --> CTX["Context Extraction<br/>(parallel, ~300ms)"]
    REPO --> CTX
    
    CTX --> CE1["README Parser"]
    CTX --> CE2["Language Detector"]
    CTX --> CE3["Framework Detector"]
    CTX --> CE4["Runtime Detector"]
    CTX --> CE5["Dependency Parser"]
    CTX --> CE6["Session Log Extractor"]
    
    CE1 --> AGG["ProjectContext"]
    CE2 --> AGG
    CE3 --> AGG
    CE4 --> AGG
    CE5 --> AGG
    CE6 --> AGG
    
    AGG --> QG["Enhanced Query Generator<br/>(minimax/OpenRouter)"]
    QG --> RQ["3 Context-Aware<br/>Refined Queries"]
    
    RQ --> SF1["Skill Finder<br/>(Query 1)"]
    RQ --> SF2["Skill Finder<br/>(Query 2)"]
    RQ --> SF3["Skill Finder<br/>(Query 3)"]
    
    SF1 --> SA["Skill Aggregator<br/>(dedupe, filter)"]
    SF2 --> SA
    SF3 --> SA
    
    SA --> TOP30["Top 30 Skills<br/>(existing removed)"]
    TOP30 --> SE["Skill Enricher<br/>(gpt-3.5-turbo)"]
    SE --> TOP5["Top 5 + Summaries"]
    
    TOP5 --> CLI["CLI Display"]
    CLI --> USR["User Selection<br/>(arrow keys)"]
    USR --> ADD["npx skills add"]
    
    style CTX fill:#ffdf1c
    style CE1 fill:#4a90e2
    style CE2 fill:#4a90e2
    style CE3 fill:#4a90e2
    style CE4 fill:#4a90e2
    style CE5 fill:#4a90e2
    style CE6 fill:#4a90e2
    style QG fill:#4a90e2
    style SA fill:#7ed321
    style SE fill:#4a90e2
    style USR fill:#f5a623
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

## 3. Phase 2: Context Extraction Pipeline (New)

```mermaid
graph TB
    REPO["Repository<br/>Root Path"]
    
    REPO --> RP["README Parser<br/>(readme-parser.ts)"]
    REPO --> LD["Language Detector<br/>(language-detector.ts)"]
    REPO --> FD["Framework Detector<br/>(framework-detector.ts)"]
    REPO --> RD["Runtime Detector<br/>(runtime-detector.ts)"]
    REPO --> DP["Dependency Parser<br/>(dependency-parser.ts)"]
    REPO --> SLE["Session Log Extractor<br/>(session-log-extractor.ts)"]
    
    RP --> RP_OUT["README Summary<br/>string"]
    LD --> LD_OUT["Languages<br/>Record&lt;string, number&gt;<br/>e.g. TypeScript: 75%"]
    FD --> FD_OUT["Frameworks<br/>string[]<br/>e.g. [React, Next.js]"]
    RD --> RD_OUT["Runtimes<br/>string[]<br/>e.g. [Node.js, Bun]"]
    DP --> DP_OUT["Existing Packages<br/>string[]<br/>e.g. [react, jest, ...]"]
    SLE --> SLE_OUT["Session Themes<br/>string[]<br/>e.g. [Testing, DevOps]"]
    
    RP_OUT --> PC["ProjectContext<br/>Aggregator"]
    LD_OUT --> PC
    FD_OUT --> PC
    RD_OUT --> PC
    SLE_OUT --> PC
    DP_OUT --> PC
    
    PC --> CONTEXT["ProjectContext Object<br/>(ready for Query Gen)"]
    
    style RP fill:#4a90e2
    style LD fill:#4a90e2
    style FD fill:#4a90e2
    style RD fill:#4a90e2
    style DP fill:#4a90e2
    style SLE fill:#4a90e2
    style PC fill:#7ed321
    style CONTEXT fill:#7ed321
```

**Latency Breakdown** (all parallel):
- README Parser: ~100ms
- Language Detector: ~200ms (depends on repo size)
- Framework Detector: ~50ms
- Runtime Detector: ~50ms
- Dependency Parser: ~100ms
- Session Log Extractor: ~300ms (reads 5 log files)
- **Total (parallel)**: ~300ms (longest task dominates)

---

## 4. Session Log Extraction Process (New)

```mermaid
graph TB
    LOGS["~/.claude/logs/"]
    LOGS --> READ["Read last 5 session logs<br/>(JSONL format)"]
    
    READ --> SCAN["Scan each line<br/>(JSON object)"]
    
    SCAN --> USER["User Messages<br/>type: 'user'"]
    SCAN --> ASST["Assistant Messages<br/>type: 'assistant'"]
    
    USER --> UKW["Keyword Extraction<br/>- test, react, database<br/>- auth, API, deploy<br/>- performance, etc"]
    ASST --> TOOL["Tool Use Extraction<br/>- tool_use.name<br/>- Count occurrences"]
    
    UKW --> THEME["Theme Identification<br/>2-5 distinct themes"]
    TOOL --> THEME
    
    THEME --> OUT["Output: string[]<br/>e.g. ['React testing',<br/>'DevOps', 'E2E tests']"]
    
    style READ fill:#4a90e2
    style SCAN fill:#4a90e2
    style UKW fill:#9013fe
    style TOOL fill:#9013fe
    style THEME fill:#7ed321
    style OUT fill:#7ed321
```

**Example Session Processing**:
```
Session 1 messages:
- user: "add testing for React components"  → Theme: "React testing"
- user: "deploy pipeline setup"              → Theme: "DevOps"
- assistant: tool_use: "Edit" (10 times)
- assistant: tool_use: "Bash" (5 times)      → Dominant tools: Edit, Bash

Session 2 messages:
- user: "E2E test setup with Playwright"     → Theme: "E2E tests"
- assistant: tool_use: "Bash" (8 times)

Combined themes: ["React testing", "DevOps", "E2E tests"]
```

---

## 5. Query Generation Process

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

## 6. Parallel Skill Finding & Enrichment

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

## 7. CLI User Interaction Flow

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

## 8. Query Generation Strategies

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

## 9. Error Handling & Fallbacks

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

## 10. Latency Breakdown (Phase 1 vs Phase 2)

```mermaid
gantt
    title Skill Recommendation Latency: Phase 1 vs Phase 2
    dateFormat YYYY-MM-DD
    
    section Phase 1 (MVP)
    Query Gen :q1, 2026-05-14, 3s
    Skill Find (parallel) :s1, after q1, 2s
    Aggregation :a1, after s1, 0.5s
    Summary Gen (parallel) :e1, after a1, 3s
    CLI Output :c1, after e1, 0.2s
    Total Phase 1 :crit1, 2026-05-14, 8.7s
    
    section Phase 2 (Context)
    Context Extraction (parallel) :ctx, 2026-05-17, 0.3s
    Query Gen :q2, after ctx, 2.5s
    Skill Find (parallel) :s2, after q2, 2s
    Aggregation/Filter :a2, after s2, 0.5s
    Summary Gen (parallel) :e2, after a2, 3s
    CLI Output :c2, after e2, 0.2s
    Total Phase 2 :crit2, 2026-05-17, 8.5s
```

**Phase 1**: 8.7 seconds
- Query Gen: 3s
- Skill Find: 2s
- Enrichment: 3s
- Other: 0.7s

**Phase 2**: 8.5 seconds (similar, context extraction is parallel with query gen)
- Context Extraction: 0.3s (added but parallel)
- Query Gen: 2.5s (slightly faster due to better prompting)
- Skill Find: 2s
- Enrichment: 3s
- Other: 0.7s

---

## 11. Data Structures

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

## 12. Phase 3: Caching Architecture

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

## 13. OpenRouter API Integration

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

## 14. Phase 4: Web UI Architecture

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

## 15. Cost Breakdown by Component

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

## 16. Success Metrics Timeline

```mermaid
timeline
    title Phase Milestones & Metrics
    
    Phase 1 (Complete) : Query Gen < 2s : Skill Find < 3s : Enrichment < 3s : Total < 10s : Fallback works
    
    Phase 2 (Planned) : Context extraction < 300ms : Precision > 90% : No duplicates : Top 5 relevance improved
    
    Phase 3 (Planned) : Cache hit rate > 60% : Latency with cache < 5s : Reranker +20% quality : Rate limit 10 req/min
    
    Phase 4 (Future) : IDE ext 1k+ installs : API 100 req/sec : Public dashboard : npm package available
```

---

## 17. Deployment & Environment

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
