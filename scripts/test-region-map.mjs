#!/usr/bin/env node

import { buildMapLayer, normalizeWorldRegion } from "../services/api/src/use-cases/uc-002-event-analysis/region-map.mjs";

let failed = 0;

function ok(name, cond) {
  if (cond) console.log(`[test:region-map] ok: ${name}`);
  else {
    console.error(`[test:region-map] fail: ${name}`);
    failed += 1;
  }
}

ok("europe from ukraine", normalizeWorldRegion("", { title: "Ukraine war briefing" }) === "europe");
ok("asia from china", normalizeWorldRegion("中国", { title: "台海" }) === "asia");
ok("americas from us", normalizeWorldRegion("美国", { title: "Fed rate" }) === "americas");

const layer = buildMapLayer(
  [
    { id: "a", region: "欧洲", title: "Ukraine", severity: 90 },
    { id: "b", region: "美国", title: "Markets", severity: 70 }
  ],
  []
);

ok("regions count", layer.regions.length === 6);
ok("europe has events", layer.regions.find((r) => r.id === "europe")?.eventCount === 1);
ok("intensity bounded", layer.regions.every((r) => r.intensity >= 0 && r.intensity <= 1));
ok("no map geometry fields", !("markers" in layer) && !("flows" in layer) && !("width" in layer));

if (failed) process.exit(1);
console.log("[test:region-map] done");
