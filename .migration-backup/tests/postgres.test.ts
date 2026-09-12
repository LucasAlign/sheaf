import { describe, expect, it } from "vitest";
import { PostgresDatabase, PostgresQuery, type SqlExecutor } from "../server/postgres";

const executor = (rows: any[] = []): SqlExecutor & { calls: any[] } => {
  const calls: any[] = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows, rowCount: rows.length };
    },
  };
};

describe("portable PostgreSQL adapter", () => {
  it("parameterizes filters and validates identifiers", () => {
    const q = new PostgresQuery(executor(), "needs")
      .select("id,title")
      .eq("organization_id", "org")
      .in("status", ["open", "claimed"])
      .order("created_at", { ascending: false })
      .limit(20);
    expect(q.compile()).toEqual({
      sql: 'SELECT "id", "title" FROM public."needs" WHERE "organization_id" = $1 AND "status" = ANY($2) ORDER BY "created_at" DESC LIMIT 20',
      values: ["org", ["open", "claimed"]],
    });
    expect(() => new PostgresQuery(executor(), "needs;drop table needs").compile()).toThrow("Unsafe SQL identifier");
  });

  it("supports writes, returning rows, and conflict-safe token retries", () => {
    const q = new PostgresQuery(executor(), "magic_links")
      .upsert(
        { token_hash: "hash", organization_id: "org", payload: { need_ids: ["need"] } },
        { onConflict: "token_hash", ignoreDuplicates: true },
      )
      .select("token_hash")
      .single();
    expect(q.compile()).toEqual({
      sql: 'INSERT INTO public."magic_links" ("token_hash", "organization_id", "payload") VALUES ($1, $2, $3) ON CONFLICT ("token_hash") DO NOTHING RETURNING "token_hash"',
      values: ["hash", "org", { need_ids: ["need"] }],
    });
    expect(q.compile().values).toHaveLength(3);
  });

  it("maps scalar and row-returning database functions", async () => {
    const scalar = executor([{ value: true }]);
    expect((await new PostgresDatabase(scalar).rpc("take_rate_limit", { p_key: "key", p_limit: 3 })).data).toBe(true);
    expect(scalar.calls[0].sql).toBe('SELECT public."take_rate_limit"("p_key" => $1, "p_limit" => $2) AS value');

    const rows = executor([{ need_id: "need", score: 42 }]);
    expect((await new PostgresDatabase(rows).rpc("score_matches", { p_org: "org" })).data).toEqual([{ need_id: "need", score: 42 }]);
  });
});
