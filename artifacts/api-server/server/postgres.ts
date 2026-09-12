import pg from "pg";

type QueryResult<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

export type SqlExecutor = {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
};

const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Unsafe SQL identifier");
  return `"${value}"`;
};

const fields = (value = "*") =>
  value === "*"
    ? "*"
    : value.split(",").map((field) => identifier(field.trim())).join(", ");

export class PostgresQuery implements PromiseLike<QueryResult<any>> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private returning = false;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private filters: string[] = [];
  private values: unknown[] = [];
  private ordering: string[] = [];
  private maximum: number | null = null;
  private cardinality: "many" | "one" | "maybe" = "many";
  private head = false;
  private countRequested = false;
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private compiled: { sql: string; values: unknown[] } | null = null;

  constructor(private readonly executor: SqlExecutor, private readonly table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.columns = columns;
    this.returning = this.operation !== "select";
    this.head = !!options?.head;
    this.countRequested = options?.count === "exact";
    return this;
  }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = "insert";
    this.payload = payload;
    this.conflict = (options?.onConflict || "").split(",").filter(Boolean);
    this.ignoreDuplicates = !!options?.ignoreDuplicates;
    return this;
  }

  private parameter(value: unknown) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
  eq(column: string, value: unknown) { this.filters.push(`${identifier(column)} = ${this.parameter(value)}`); return this; }
  gt(column: string, value: unknown) { this.filters.push(`${identifier(column)} > ${this.parameter(value)}`); return this; }
  gte(column: string, value: unknown) { this.filters.push(`${identifier(column)} >= ${this.parameter(value)}`); return this; }
  lt(column: string, value: unknown) { this.filters.push(`${identifier(column)} < ${this.parameter(value)}`); return this; }
  in(column: string, values: unknown[]) {
    this.filters.push(values.length ? `${identifier(column)} = ANY(${this.parameter(values)})` : "false");
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error("Unsupported PostgreSQL filter");
    this.filters.push(`${identifier(column)} IS NOT NULL`);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.ordering.push(`${identifier(column)} ${options?.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }
  limit(value: number) { this.maximum = value; return this; }
  single() { this.cardinality = "one"; this.maximum = 1; return this; }
  maybeSingle() { this.cardinality = "maybe"; this.maximum = 1; return this; }

  compile() {
    if (this.compiled) return this.compiled;
    const table = `public.${identifier(this.table)}`;
    let sql = "";
    if (this.operation === "select") {
      sql = `SELECT ${this.head || this.countRequested ? "count(*)::int AS count" : fields(this.columns)} FROM ${table}`;
    } else if (this.operation === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload || {}];
      const columns = Object.keys(rows[0] || {});
      const tuples = rows.map((row) => `(${columns.map((column) => this.parameter(row[column])).join(", ")})`);
      sql = `INSERT INTO ${table} (${columns.map(identifier).join(", ")}) VALUES ${tuples.join(", ")}`;
      if (this.conflict.length) {
        sql += ` ON CONFLICT (${this.conflict.map(identifier).join(", ")}) `;
        const updates = columns.filter((column) => !this.conflict.includes(column));
        sql += this.ignoreDuplicates || !updates.length
          ? "DO NOTHING"
          : `DO UPDATE SET ${updates.map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`).join(", ")}`;
      }
    } else if (this.operation === "update") {
      const entries = Object.entries(this.payload || {});
      sql = `UPDATE ${table} SET ${entries.map(([column, value]) => `${identifier(column)} = ${this.parameter(value)}`).join(", ")}`;
    } else sql = `DELETE FROM ${table}`;
    if (this.filters.length) sql += ` WHERE ${this.filters.join(" AND ")}`;
    if (this.ordering.length && this.operation === "select") sql += ` ORDER BY ${this.ordering.join(", ")}`;
    if (this.maximum !== null && this.operation === "select") sql += ` LIMIT ${Math.max(0, Math.floor(this.maximum))}`;
    if (this.returning) sql += ` RETURNING ${fields(this.columns)}`;
    this.compiled = { sql, values: this.values };
    return this.compiled;
  }

  async execute(): Promise<QueryResult<any>> {
    try {
      const compiled = this.compile();
      const response = await this.executor.query(compiled.sql, compiled.values);
      if (this.head || this.countRequested)
        return { data: this.head ? null : response.rows, error: null, count: Number(response.rows[0]?.count || 0) };
      if (this.cardinality === "one" && response.rows.length !== 1)
        return { data: null, error: { message: "Record not found" } };
      if (this.cardinality === "maybe" && response.rows.length > 1)
        return { data: null, error: { message: "More than one record returned" } };
      return { data: this.cardinality === "many" ? response.rows : response.rows[0] || null, error: null };
    } catch (error) {
      const e = error as { message?: string; code?: string };
      return { data: null, error: { message: e.message || "Database query failed", code: e.code } };
    }
  }

  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const rowFunctions = new Set(["score_matches", "reserve_notifications"]);

export class PostgresDatabase {
  constructor(private readonly executor: SqlExecutor) {}
  from(table: string) { return new PostgresQuery(this.executor, table); }
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<QueryResult<any>> {
    try {
      identifier(name);
      const entries = Object.entries(args);
      const call = entries.map(([key], index) => `${identifier(key)} => $${index + 1}`).join(", ");
      const sql = rowFunctions.has(name)
        ? `SELECT * FROM public.${identifier(name)}(${call})`
        : `SELECT public.${identifier(name)}(${call}) AS value`;
      const response = await this.executor.query(sql, entries.map(([, value]) => value));
      return { data: rowFunctions.has(name) ? response.rows : response.rows[0]?.value ?? null, error: null };
    } catch (error) {
      const e = error as { message?: string; code?: string };
      return { data: null, error: { message: e.message || "Database function failed", code: e.code } };
    }
  }
}

let pool: pg.Pool | undefined;
export function postgresDatabase(connectionString: string) {
  pool ||= new pg.Pool({ connectionString, max: 10 });
  return new PostgresDatabase(pool);
}
