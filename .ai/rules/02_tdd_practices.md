# Test-Driven Development (TDD) Practices

## Core Principle

**RED → GREEN → REFACTOR**

Write failing test → Make it pass → Improve code quality.

---

## Rules

### 1. Always Write Tests First
- Write the test BEFORE writing implementation code
- Test should fail initially (RED phase)
- Never write production code without a failing test

### 2. Write Minimal Code
- Write only enough code to make the test pass
- Don't add features "just in case"
- Resist the urge to over-engineer

### 3. One Test at a Time
- Focus on one behavior per test cycle
- Complete RED → GREEN → REFACTOR before next test
- Build functionality incrementally

### 4. Test Behavior, Not Implementation
- Test what the code does, not how it does it
- Don't test private methods directly
- Tests should survive refactoring

### 5. Keep Tests Fast
- Unit tests should run in milliseconds
- Use test doubles (mocks/stubs) for external dependencies
- Reserve slow tests for integration test suite

---

## TDD Cycle Steps

### Step 1: Write a Failing Test (RED)
```typescript
it('should create user with email', async () => {
  const user = await createUser({ email: 'test@example.com' });
  expect(user.email).toBe('test@example.com');
});
```
- Run test → it should FAIL
- Failure should be meaningful (e.g., "createUser is not defined")

### Step 2: Make It Pass (GREEN)
```typescript
async function createUser(data: { email: string }) {
  return { email: data.email };
}
```
- Write simplest code to pass the test
- Run test → it should PASS
- Don't add extra features yet

### Step 3: Refactor (CLEAN)
```typescript
async function createUser(data: { email: string }) {
  validateEmail(data.email);
  return { id: uuid(), email: data.email };
}
```
- Improve code quality while keeping tests green
- Extract functions, rename variables, remove duplication
- Run tests after each refactor

### Step 4: Repeat
- Move to next test case
- Build features incrementally

---

## Test Structure

### AAA Pattern
```typescript
it('should do something', async () => {
  // ARRANGE: Set up test data
  const user = { id: '123', email: 'test@example.com' };

  // ACT: Execute the behavior
  const result = await updateUser(user.id, { name: 'Test' });

  // ASSERT: Verify the outcome
  expect(result.name).toBe('Test');
});
```

### Given-When-Then (Alternative)
```typescript
it('should reject invalid email', async () => {
  // GIVEN: Invalid email input
  const invalidEmail = 'not-an-email';

  // WHEN: Attempting to create user
  // THEN: Should throw validation error
  await expect(
    createUser({ email: invalidEmail })
  ).rejects.toThrow('Invalid email');
});
```

---

## Test Naming

### Format: `should [expected behavior] when [condition]`

**Good:**
```typescript
it('should return user by ID', async () => { ... })
it('should throw error for duplicate email', async () => { ... })
it('should update login count on successful login', async () => { ... })
```

**Bad:**
```typescript
it('test user creation', async () => { ... })  // Vague
it('works', async () => { ... })  // Meaningless
it('getUserById test case 1', async () => { ... })  // Not descriptive
```

---

## Test Coverage Guidelines

### What to Test

✅ **Public API:** All public functions/methods
✅ **Edge Cases:** Empty inputs, null, undefined, max values
✅ **Error Paths:** Validation failures, exceptions, error states
✅ **Business Logic:** Core domain rules and calculations
✅ **Integration Points:** Database, external APIs, file system

### What NOT to Test

❌ **Framework Code:** Don't test library internals
❌ **Simple Getters/Setters:** Unless they have logic
❌ **Private Methods:** Test through public API only
❌ **Generated Code:** Auto-generated migrations, etc.

---

## Common Patterns

### Testing Async Code
```typescript
it('should create user asynchronously', async () => {
  const user = await createUser({ email: 'test@example.com' });
  expect(user).toBeDefined();
});
```

### Testing Errors
```typescript
it('should throw for duplicate email', async () => {
  await createUser({ email: 'test@example.com' });

  await expect(
    createUser({ email: 'test@example.com' })
  ).rejects.toThrow('User with this email already exists');
});
```

### Testing with Database (Unit Tier)
```typescript
beforeEach(async () => {
  // Unit tests should mock DB chains rather than using a real DB
  db.select.mockReset();
  db.insert.mockReset();
});

it('should map repository result into domain object', async () => {
  db.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'u1', email: 'test@example.com' }]),
    }),
  });

  const user = await createUser({ email: 'test@example.com' });
  expect(user.email).toBe('test@example.com');
});
```

---

## Mocking Guidelines

### When to Mock
- External APIs (avoid network calls in tests)
- Database connections (for unit tests; use real DB in E2E/full-stack)
- File system operations
- Time-dependent code (Date.now(), setTimeout)

### When NOT to Mock
- Your own code (test real implementations)
- Simple data structures
- Pure functions
- E2E/full-stack database flows (test real PostgreSQL behavior)

---

## iMinds Test Tiers (Required)

Use the testing tier that matches the risk and behavior under test:

| Tier | Database | Typical speed | Primary purpose |
|---|---|---|---|
| Unit | Mocked Drizzle chains (`vi.fn`) | Fast | Business logic, transformations, error paths |
| E2E | Real isolated Neon PostgreSQL (per-process DB) | Medium | SQL behavior, job lifecycle, event persistence |
| Full-stack | Real isolated Neon DB + wrangler workers | Slow | Cron, worker-to-worker flow, cross-service integration |

### Tier Selection Rules
- Default to **unit tests first** in RED → GREEN → REFACTOR cycles.
- Add **E2E tests** when correctness depends on SQL semantics, migrations, or multi-table constraints.
- Add **full-stack tests** only when behavior depends on worker runtime wiring (cron, HTTP boundaries, relay callbacks).

### Unit Mocking Rule
- For Drizzle in unit tests, mock the fluent chain shape (`insert().values().returning()`, `select().from().where()`) rather than SQL text.
- If a unit test only proves the mock, it has low value; prefer E2E for DB contracts.

---

## Isolated Database Rules (E2E/Full-Stack)

For database-backed tests, follow isolated-database infrastructure conventions:

### Isolation and Lifecycle
- Use a dedicated per-process database (e.g., `iminds_e2e_{pid}` / `iminds_fullstack_{pid}`).
- Apply all required migrations during global setup.
- Drop the test database during global teardown.
- Cleanup stale test databases from crashed runs before creating a new one.

### Test Data Reset
- Reset state between tests with ordered table cleanup (foreign-key safe).
- Keep execution sequential when sharing one per-process test DB.
- Do not rely on test ordering or state leakage across test cases.

### Full-Stack Worker Tests
- Run with real wrangler workers only when validating runtime integration.
- Ensure startup health checks and graceful teardown are part of the harness.
- If `.dev.vars` are patched for tests, always restore backups on teardown.

### Example: Mocking Time
```typescript
it('should set createdAt to current time', async () => {
  const mockDate = new Date('2025-01-01');
  vi.useFakeTimers();
  vi.setSystemTime(mockDate);

  const user = await createUser({ email: 'test@example.com' });

  expect(user.createdAt).toEqual(mockDate);
  vi.useRealTimers();
});
```

---

## Anti-Patterns to Avoid

### 1. Testing Implementation Details
**Bad:**
```typescript
it('should call validateEmail internally', () => {
  const spy = vi.spyOn(validator, 'validateEmail');
  createUser({ email: 'test@example.com' });
  expect(spy).toHaveBeenCalled();
});
```

**Good:**
```typescript
it('should reject invalid email', async () => {
  await expect(
    createUser({ email: 'invalid' })
  ).rejects.toThrow();
});
```

### 2. Test Interdependence
**Bad:**
```typescript
let userId: string;

it('should create user', async () => {
  const user = await createUser({ email: 'test@example.com' });
  userId = user.id; // State leaks to next test
});

it('should find user by ID', async () => {
  const user = await getUserById(userId); // Depends on previous test
  expect(user).toBeDefined();
});
```

**Good:**
```typescript
it('should find user by ID', async () => {
  const created = await createUser({ email: 'test@example.com' });
  const found = await getUserById(created.id);
  expect(found).toBeDefined();
});
```

### 3. Multiple Assertions on Different Behaviors
**Bad:**
```typescript
it('should handle user operations', async () => {
  const user = await createUser({ email: 'test@example.com' });
  expect(user.email).toBe('test@example.com');

  const updated = await updateUser(user.id, { name: 'Test' });
  expect(updated.name).toBe('Test');

  await deleteUser(user.id);
  const deleted = await getUserById(user.id);
  expect(deleted).toBeNull();
});
```

**Good:**
```typescript
it('should create user with email', async () => { ... });
it('should update user name', async () => { ... });
it('should delete user', async () => { ... });
```

---

## Testing Philosophy

### Test Pyramid
```
        /\
       /  \        Full-stack Tests (Few, Slowest)
      /────\
     /      \      E2E Tests (Some, Medium)
    /────────\
   /          \    Unit Tests (Many, Fast)
  /────────────\
```

**Distribution:**
- ~70% Unit Tests (fast, isolated logic)
- ~20% E2E Tests (real isolated DB contracts)
- ~10% Full-stack Tests (real workers + DB)

### Test Quality > Test Quantity
- 100% coverage doesn't mean bug-free code
- Focus on critical paths and edge cases
- Delete tests that don't add value
- Prefer fewer, better tests over many brittle tests

---

## Debugging Failed Tests

### 1. Read the Error Message
```
Expected: 'test@example.com'
Received: undefined
```
- Error tells you what went wrong
- Don't immediately jump to code

### 2. Check Test Isolation
- Does test pass when run alone?
- Does test order matter?
- Are you cleaning up properly?

### 3. Add Debug Logging
```typescript
it('should create user', async () => {
  const input = { email: 'test@example.com' };
  console.log('Input:', input);

  const user = await createUser(input);
  console.log('Result:', user);

  expect(user.email).toBe('test@example.com');
});
```

### 4. Use Test.only for Focus
```typescript
it.only('should create user', async () => {
  // Only this test runs
});
```

---

## Continuous Integration

### Pre-Commit
```bash
# Run tests before commit
bun test
```

### Pre-Push
```bash
# Run full suite with coverage
bun test:coverage
```

### CI Pipeline
```bash
# Fast feedback
bun test:unit        # 1-2 seconds

# Slower validation
bun test:integration # 5-10 seconds
bun test:e2e        # 30+ seconds
```

---

## Key Takeaways

1. **Red → Green → Refactor** - Never skip a step
2. **Test First** - No production code without a failing test
3. **One Test at a Time** - Build incrementally
4. **Test Behavior** - Not implementation details
5. **Keep Tests Fast** - Unit tests in milliseconds
6. **Clean Tests** - Tests are code too, refactor them
7. **Test Quality** - Better than test quantity
8. **Fail Fast** - Tests should catch bugs early

---

## Resources

- [Test-Driven Development by Kent Beck](https://www.amazon.com/Test-Driven-Development-Kent-Beck/dp/0321146530)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
