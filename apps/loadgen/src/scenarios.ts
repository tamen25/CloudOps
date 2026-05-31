// Scenario definitions + request shaping for the load generator. Pure data +
// helpers so they are unit-testable without firing real traffic. Each scenario
// is a weighted list of request templates against the gateway; the runner
// picks one per tick by weight.

export type ScenarioName = 'browse' | 'place-order' | 'burst' | 'mixed' | 'chaos';

export const SCENARIOS: ScenarioName[] = ['browse', 'place-order', 'burst', 'mixed', 'chaos'];

export interface RequestTemplate {
  method: 'GET' | 'POST';
  path: string;
  body?: () => unknown;
  // When true, the runner injects a fault hint header so the gateway/downstream
  // returns an error (chaos). Never used outside the chaos scenario.
  fault?: boolean;
}

export interface WeightedTemplate {
  weight: number;
  template: RequestTemplate;
}

function syntheticItems(): Array<{ sku: string; price_cents: number; qty: number }> {
  const n = 1 + Math.floor(Math.random() * 3);
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({ sku: `SYN-${i}`, price_cents: 100 + i * 50, qty: 1 + Math.floor(Math.random() * 3) });
  }
  return items;
}

const placeOrder: RequestTemplate = {
  method: 'POST',
  path: '/v1/order',
  body: () => ({ items: syntheticItems(), tenant_id: `synthetic-${1 + Math.floor(Math.random() * 5)}` }),
};

const browse: RequestTemplate = {
  method: 'GET',
  path: '/healthz', // light read; lands a shallow trace through the gateway
};

const chaos: RequestTemplate = {
  method: 'POST',
  path: '/v1/order',
  // A deliberately malformed body so downstream validation/error paths fire and
  // error edges light up on the service map.
  body: () => ({ items: 'not-an-array', tenant_id: `synthetic-chaos` }),
  fault: true,
};

// scenarioTemplates returns the weighted request mix for a scenario.
export function scenarioTemplates(name: ScenarioName): WeightedTemplate[] {
  switch (name) {
    case 'browse':
      return [{ weight: 1, template: browse }];
    case 'place-order':
      return [{ weight: 1, template: placeOrder }];
    case 'burst':
      // burst is the same request as place-order; the runner ramps rps high.
      return [{ weight: 1, template: placeOrder }];
    case 'chaos':
      return [
        { weight: 3, template: chaos },
        { weight: 1, template: placeOrder },
      ];
    case 'mixed':
    default:
      return [
        { weight: 5, template: browse },
        { weight: 4, template: placeOrder },
        { weight: 1, template: chaos },
      ];
  }
}

// pickTemplate selects one template by weight. `rand` is injectable for tests.
export function pickTemplate(weighted: WeightedTemplate[], rand: () => number = Math.random): RequestTemplate {
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r < 0) return w.template;
  }
  return weighted[weighted.length - 1].template;
}

export function isScenario(name: string): name is ScenarioName {
  return (SCENARIOS as string[]).includes(name);
}
