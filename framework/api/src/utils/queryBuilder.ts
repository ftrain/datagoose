/**
 * SQL Query Builder Utilities
 */

export interface WhereCondition {
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'ILIKE' | 'IN';
  value: unknown;
}

/**
 * Build WHERE clause from conditions
 */
export function buildWhereClause(
  conditions: WhereCondition[],
  startIndex: number = 1
): { clause: string; params: unknown[]; nextIndex: number } {
  if (conditions.length === 0) {
    return { clause: '', params: [], nextIndex: startIndex };
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;

  for (const condition of conditions) {
    if (condition.operator === 'IN') {
      const values = condition.value as unknown[];
      const placeholders = values.map(() => `$${paramIndex++}`).join(', ');
      clauses.push(`${condition.column} IN (${placeholders})`);
      params.push(...values);
    } else {
      clauses.push(`${condition.column} ${condition.operator} $${paramIndex++}`);
      params.push(condition.value);
    }
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params,
    nextIndex: paramIndex,
  };
}

/**
 * Build ORDER BY clause
 */
export function buildOrderByClause(
  column: string,
  direction: 'ASC' | 'DESC' = 'ASC'
): string {
  return `ORDER BY ${column} ${direction}`;
}

/**
 * Build LIMIT/OFFSET clause
 */
export function buildLimitOffsetClause(
  startIndex: number,
  limit?: number,
  offset?: number
): { clause: string; params: unknown[]; nextIndex: number } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  if (limit !== undefined) {
    parts.push(`LIMIT $${idx++}`);
    params.push(limit);
  }

  if (offset !== undefined) {
    parts.push(`OFFSET $${idx++}`);
    params.push(offset);
  }

  return {
    clause: parts.join(' '),
    params,
    nextIndex: idx,
  };
}

/**
 * Helper to build a simple select query
 */
export function buildSelectQuery(
  table: string,
  columns: string[],
  options: {
    conditions?: WhereCondition[];
    orderBy?: { column: string; direction?: 'ASC' | 'DESC' };
    limit?: number;
    offset?: number;
  } = {}
): { query: string; params: unknown[] } {
  const { conditions = [], orderBy, limit, offset } = options;
  const parts: string[] = [];
  let params: unknown[] = [];
  let paramIndex = 1;

  // SELECT
  parts.push(`SELECT ${columns.join(', ')} FROM ${table}`);

  // WHERE
  if (conditions.length > 0) {
    const where = buildWhereClause(conditions, paramIndex);
    parts.push(where.clause);
    params = params.concat(where.params);
    paramIndex = where.nextIndex;
  }

  // ORDER BY
  if (orderBy) {
    parts.push(buildOrderByClause(orderBy.column, orderBy.direction));
  }

  // LIMIT/OFFSET
  if (limit !== undefined || offset !== undefined) {
    const limitOffset = buildLimitOffsetClause(paramIndex, limit, offset);
    parts.push(limitOffset.clause);
    params = params.concat(limitOffset.params);
  }

  return {
    query: parts.join(' '),
    params,
  };
}
