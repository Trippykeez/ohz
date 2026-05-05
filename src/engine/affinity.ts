// Apriori-style frequent itemset mining, truncated at k=3. v1 only surfaces
// 2- and 3-item bundles, so we don't need full FP-growth recursion. When data
// volume per shop grows past ~10k orders or we want larger bundles, swap this
// for a real FP-growth implementation.

export interface FrequentItemset {
  items: string[]; // sorted product ids
  count: number;
  support: number;
  lift: number;
}

function sortKey(items: string[]): string {
  return [...items].sort().join('|');
}

function pairs<T>(arr: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]]);
  }
  return out;
}

export function mineFrequentItemsets(
  transactions: Set<string>[],
  minSupport: number,
  minLift: number,
): FrequentItemset[] {
  const N = transactions.length;
  if (N === 0) return [];

  // k=1: per-item support
  const itemCounts = new Map<string, number>();
  for (const tx of transactions) {
    for (const item of tx) itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
  }
  const supportOf = new Map<string, number>();
  const frequent1: string[] = [];
  for (const [item, count] of itemCounts) {
    const sup = count / N;
    supportOf.set(item, sup);
    if (sup >= minSupport) frequent1.push(item);
  }
  frequent1.sort();

  // k=2: count co-occurrences only over frequent items
  const frequent1Set = new Set(frequent1);
  const pairCounts = new Map<string, { items: [string, string]; count: number }>();
  for (const tx of transactions) {
    const filtered = [...tx].filter(i => frequent1Set.has(i)).sort();
    for (const [a, b] of pairs(filtered)) {
      const key = `${a}|${b}`;
      const entry = pairCounts.get(key);
      if (entry) entry.count++;
      else pairCounts.set(key, { items: [a, b], count: 1 });
    }
  }

  const frequent2: FrequentItemset[] = [];
  const frequent2Keys = new Set<string>();
  for (const { items, count } of pairCounts.values()) {
    const support = count / N;
    if (support < minSupport) continue;
    const lift = support / (supportOf.get(items[0])! * supportOf.get(items[1])!);
    if (lift < minLift) continue;
    frequent2.push({ items, count, support, lift });
    frequent2Keys.add(sortKey(items));
  }

  // k=3: candidate generation by joining pairs that share their first item
  const tripleCounts = new Map<string, { items: [string, string, string]; count: number }>();
  for (const tx of transactions) {
    const filtered = [...tx].filter(i => frequent1Set.has(i)).sort();
    if (filtered.length < 3) continue;
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        if (!frequent2Keys.has(`${filtered[i]}|${filtered[j]}`)) continue;
        for (let k = j + 1; k < filtered.length; k++) {
          if (!frequent2Keys.has(`${filtered[i]}|${filtered[k]}`)) continue;
          if (!frequent2Keys.has(`${filtered[j]}|${filtered[k]}`)) continue;
          const items: [string, string, string] = [filtered[i], filtered[j], filtered[k]];
          const key = items.join('|');
          const entry = tripleCounts.get(key);
          if (entry) entry.count++;
          else tripleCounts.set(key, { items, count: 1 });
        }
      }
    }
  }

  const frequent3: FrequentItemset[] = [];
  for (const { items, count } of tripleCounts.values()) {
    const support = count / N;
    if (support < minSupport) continue;
    const denom = items.reduce((acc, id) => acc * supportOf.get(id)!, 1);
    const lift = support / denom;
    if (lift < minLift) continue;
    frequent3.push({ items, count, support, lift });
  }

  return [...frequent2, ...frequent3];
}
