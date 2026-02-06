---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test/**"
  - "**/tests/**"
  - "**/__tests__/**"
---

# Testing Conventions

## Test Structure

### Arrange-Act-Assert Pattern
```typescript
describe("ItemService", () => {
  describe("createItem", () => {
    it("should create item with valid data", async () => {
      // Arrange
      const user = await createUser()
      const itemData = { name: "Test", price: 10 }

      // Act
      const result = await itemService.createItem(user.id, itemData)

      // Assert
      expect(result.name).toBe("Test")
      expect(result.price).toBe(10)
      expect(result.userId).toBe(user.id)
    })
  })
})
```

### Test Naming
- Describe WHAT is being tested
- Describe the CONDITION
- Describe the EXPECTED outcome

```typescript
// Good
it("should return 404 when item does not exist")
it("should throw ValidationError when price is negative")
it("should send email notification after successful creation")

// Bad
it("works")
it("test createItem")
it("handles error")
```

## Unit Tests

### Isolation
- Test one thing at a time
- Mock external dependencies
- Don't test implementation details

```typescript
// Good - tests behavior
it("should calculate total with tax", () => {
  const cart = new Cart([{ price: 100 }])
  expect(cart.totalWithTax(0.1)).toBe(110)
})

// Bad - tests implementation
it("should call calculateTax method", () => {
  const cart = new Cart([{ price: 100 }])
  const spy = jest.spyOn(cart, "calculateTax")
  cart.totalWithTax(0.1)
  expect(spy).toHaveBeenCalled()
})
```

### Mocking
```typescript
// Mock external service
const mockEmailService = {
  send: jest.fn().mockResolvedValue({ success: true })
}

// Inject mock
const service = new ItemService({ emailService: mockEmailService })

// Verify interaction
expect(mockEmailService.send).toHaveBeenCalledWith({
  to: "user@example.com",
  subject: "Item Created"
})
```

## Integration Tests

### Database Tests
```typescript
describe("ItemRepository", () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db.seed.run()
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  it("should find items by user", async () => {
    const items = await itemRepo.findByUser(testUser.id)
    expect(items).toHaveLength(3)
  })
})
```

### API Tests
```typescript
describe("POST /api/items", () => {
  it("should create item for authenticated user", async () => {
    const response = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Test", price: 10 })

    expect(response.status).toBe(201)
    expect(response.body.name).toBe("Test")
  })

  it("should return 401 without auth", async () => {
    const response = await request(app)
      .post("/api/items")
      .send({ name: "Test", price: 10 })

    expect(response.status).toBe(401)
  })
})
```

## E2E Tests (Playwright)

```typescript
test.describe("Item Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.fill('[name="email"]', "test@example.com")
    await page.fill('[name="password"]', "password")
    await page.click('button[type="submit"]')
    await page.waitForURL("/dashboard")
  })

  test("should create new item", async ({ page }) => {
    await page.click('[data-testid="new-item-btn"]')
    await page.fill('[name="name"]', "New Item")
    await page.fill('[name="price"]', "25.00")
    await page.click('button[type="submit"]')

    await expect(page.locator('[data-testid="item-list"]'))
      .toContainText("New Item")
  })
})
```

## Test Data

### Factories
```typescript
// Use factories for test data
const userFactory = Factory.define<User>(() => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
}))

// Create test user
const user = userFactory.build()
const userWithOverrides = userFactory.build({ name: "Custom Name" })
```

### Fixtures
```typescript
// fixtures/items.json
{
  "validItem": { "name": "Test Item", "price": 10.00 },
  "invalidItem": { "name": "", "price": -5 }
}
```

## Coverage

- Aim for 80%+ coverage on business logic
- Don't chase 100% - focus on critical paths
- Ignore generated code and trivial getters/setters

```json
// jest.config.js
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80
    }
  }
}
```
