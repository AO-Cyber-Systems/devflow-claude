---
paths:
  - "supabase/**/*"
  - "**/*.sql"
  - "**/supabase*"
---

# Supabase Conventions

## Project Structure
```
supabase/
├── config.toml       # Local dev config
├── migrations/       # SQL migrations (ordered)
├── seed.sql          # Development seed data
└── functions/        # Edge Functions (Deno)
```

## Migrations

### Creating Migrations
```bash
supabase migration new create_items_table
```

### Migration File Structure
```sql
-- supabase/migrations/20240101000000_create_items_table.sql

-- Create table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) <= 100),
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX items_user_id_idx ON items(user_id);
CREATE INDEX items_active_idx ON items(active) WHERE active = true;

-- Enable RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own items"
    ON items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own items"
    ON items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
    ON items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
    ON items FOR DELETE
    USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION moddatetime(updated_at);
```

## Row Level Security (RLS)

### Always Enable RLS
```sql
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
```

### Common Patterns
```sql
-- Authenticated users only
CREATE POLICY "Authenticated access"
    ON table_name FOR ALL
    USING (auth.role() = 'authenticated');

-- Owner-only access
CREATE POLICY "Owner access"
    ON table_name FOR ALL
    USING (auth.uid() = user_id);

-- Public read, owner write
CREATE POLICY "Public read"
    ON table_name FOR SELECT
    USING (true);

CREATE POLICY "Owner write"
    ON table_name FOR INSERT, UPDATE, DELETE
    USING (auth.uid() = user_id);
```

## Edge Functions

### Function Structure
```typescript
// supabase/functions/process-item/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { item_id } = await req.json()

    // Process item
    const { data, error } = await supabase
      .from("items")
      .update({ processed: true })
      .eq("id", item_id)
      .select()
      .single()

    if (error) throw error

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
})
```

## Client Usage

### TypeScript Client
```typescript
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Typed queries
const { data, error } = await supabase
  .from("items")
  .select("id, name, price")
  .eq("active", true)
  .order("created_at", { ascending: false })
```

### Generate Types
```bash
supabase gen types typescript --local > src/database.types.ts
```

## Best Practices

1. **Always use RLS** - Never disable in production
2. **Use migrations** - Never modify production DB directly
3. **Generate types** - Keep TypeScript types in sync
4. **Use service role sparingly** - Only in Edge Functions when needed
5. **Index foreign keys** - Always create indexes on FK columns
6. **Use transactions** - For multi-table operations in functions
