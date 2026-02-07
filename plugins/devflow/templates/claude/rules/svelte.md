---
paths:
  - "src/**/*.svelte"
  - "src/**/*.ts"
  - "src/**/*.js"
  - "svelte.config.*"
---

# Svelte 5 / SvelteKit Conventions

## Runes (Svelte 5)
Always use runes instead of stores:
- `$state()` for reactive state
- `$derived()` for computed values
- `$effect()` for side effects
- `$props()` for component props
- `$bindable()` for two-way binding props

## Component Structure
```svelte
<script lang="ts">
  // 1. Imports
  // 2. Props with $props()
  // 3. State with $state()
  // 4. Derived values with $derived()
  // 5. Effects with $effect()
  // 6. Functions
</script>

<!-- Template -->

<style>
  /* Scoped styles */
</style>
```

## Snippets
Use `{#snippet}` blocks for reusable template fragments:
```svelte
{#snippet button(text, onclick)}
  <button onclick={onclick}>{text}</button>
{/snippet}

{@render button("Click me", handleClick)}
```

## Event Handling
Use `onclick` not `on:click` (Svelte 5 syntax):
```svelte
<button onclick={handleClick}>Click</button>
<input oninput={(e) => value = e.target.value} />
```

## Form Actions
Prefer SvelteKit form actions over client-side submission:
```svelte
<form method="POST" action="?/submit">
  <!-- Progressive enhancement -->
</form>
```

## Load Functions
- `+page.ts` for universal load (runs on server and client)
- `+page.server.ts` for server-only load (secrets, DB access)
- Always type load function returns

## Error Handling
- Use `error()` from `@sveltejs/kit` for expected errors
- Use `+error.svelte` for error pages
- Handle loading states explicitly

## Testing
- Use `@testing-library/svelte` for component tests
- Use Playwright for E2E tests
- Test user interactions, not implementation details
