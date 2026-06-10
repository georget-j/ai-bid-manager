// Grant application project budget: project cost line items + funding sources (grant
// requested, match funding, other). Stored as jsonb on response_drafts.budget.

export interface BudgetLine {
  id: string;
  label: string;
  amount: number;
}

export interface GrantBudget {
  costs: BudgetLine[]; // project cost line items
  funding: BudgetLine[]; // funding sources (grant requested, match funding, ...)
}

export interface BudgetTotals {
  cost: number;
  funding: number;
  balance: number; // funding - cost (0 = balanced)
}

export function budgetTotals(b: GrantBudget | null | undefined): BudgetTotals {
  const sum = (lines: BudgetLine[]) =>
    (lines ?? []).reduce(
      (s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0),
      0,
    );
  const cost = sum(b?.costs ?? []);
  const funding = sum(b?.funding ?? []);
  return { cost, funding, balance: funding - cost };
}

export function hasBudget(b: GrantBudget | null | undefined): boolean {
  return !!b && ((b.costs?.length ?? 0) > 0 || (b.funding?.length ?? 0) > 0);
}

/** True when costs and funding are present and reconcile (within £1). */
export function isBudgetBalanced(b: GrantBudget | null | undefined): boolean {
  const t = budgetTotals(b);
  return t.cost > 0 && t.funding > 0 && Math.abs(t.balance) <= 1;
}
