const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const schema = JSON.parse(read("files/level-config.schema.json"));
const original = JSON.parse(read("files/level-config.json"));
const bundle = read("files/shift-config-validator.js");
const context = vm.createContext({});
vm.runInContext(bundle, context);
const api = context.ToyFactoryShiftConfig;
const validate = api.createValidator(schema);
const fresh = () => JSON.parse(JSON.stringify(original));

for (const [groupName, tag, filename, jsonObject] of [
  ["SHIFT CONFIG", "level-config", "level-config.json", "LevelConfig"],
  ["INIT", "assembly-recipes", "assembly-recipes.json", "JSON"]
]) {
  test(`startup requests ${filename} and routes its response to ${jsonObject}`, () => {
    const sheet = JSON.parse(read("eventSheets/Event sheet 1.json"));
    const group = sheet.events.find(event => event.title === groupName);
    const startup = group.children.filter(event => event.conditions?.some(c => c.id === "on-start-of-layout"));
    const requests = startup.flatMap(event => event.actions || []).filter(action =>
      action.objectClass === "AJAX" && action.id === "request-project-file" &&
      action.parameters.tag === JSON.stringify(tag) && action.parameters.file?.path === filename);
    assert.equal(requests.length, 1, `${filename} must be requested once at startup`);
    const response = group.children.find(event => event.conditions?.some(c =>
      c.objectClass === "AJAX" && c.id === "on-completed" && c.parameters.tag === JSON.stringify(tag)));
    assert.ok(response?.actions.some(action => action.id === "parse" && action.objectClass === jsonObject));
  });
}

function expectInvalid(change, field) {
  const config = fresh();
  change(config);
  const result = validate(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(message => message.includes(field)), result.errors.join("\n"));
}

test("supplied config and active-order counts above three pass unchanged", () => {
  for (const count of [1, 3, 6, 12]) {
    const config = fresh();
    config.maxActiveOrders = count;
    const before = JSON.stringify(config);
    assert.equal(validate(config).valid, true);
    assert.equal(JSON.stringify(config), before);
  }
});

test("all required properties are checked; seed is optional", () => {
  for (const key of schema.required) expectInvalid(config => { delete config[key]; }, key);
  const config = fresh();
  delete config.seed;
  assert.equal(validate(config).valid, true);
  config.seed = null;
  assert.equal(validate(config).valid, true);
});

test("root and nested structures must have the declared types", () => {
  for (const config of [null, [], "bad", 42, true]) assert.equal(validate(config).valid, false);
  for (const value of [null, [], "bad"]) expectInvalid(config => { config.orderSize = value; }, "orderSize");
  expectInvalid(config => { delete config.orderSize.min; }, "orderSize.min");
  expectInvalid(config => { config.colors = "blue"; }, "colors");
});

test("count fields reject strings, fractions, zero, negatives, nonfinite numbers", () => {
  for (const key of ["customersTotal", "maxActiveOrders", "toysBudget"]) {
    for (const value of ["6", true, null, 1.5, 0, -1, Infinity, NaN]) {
      expectInvalid(config => { config[key] = value; }, key);
    }
  }
  expectInvalid(config => { config.maxActiveOrders = Number.MAX_SAFE_INTEGER + 1; }, "maxActiveOrders");
  expectInvalid(config => { config.seed = 0.5; }, "seed");
  expectInvalid(config => { config.seed = Number.MAX_SAFE_INTEGER + 1; }, "seed");
});

test("time, prices, seed and color boundaries", () => {
  const config = fresh();
  config.durationSeconds = 1.5;
  config.warnThresholdSeconds = 0.5;
  config.toyPrice = 0;
  config.penaltyPerMissingToy = 0;
  config.seed = -1;
  assert.equal(validate(config).valid, true);
  expectInvalid(config => { config.durationSeconds = 0; }, "durationSeconds");
  expectInvalid(config => { config.durationSeconds = Infinity; }, "durationSeconds");
  for (const key of ["toyPrice", "penaltyPerMissingToy", "shiftStartCost", "warnThresholdSeconds"]) {
    expectInvalid(config => { config[key] = -1; }, key);
  }
  expectInvalid(config => { config.colors = []; }, "colors");
  expectInvalid(config => { config.colors = [""]; }, "colors.0");
  expectInvalid(config => { config.colors = [123]; }, "colors.0");
});

test("cross-field rules check order bounds, weights, budget and warning time", () => {
  expectInvalid(config => { config.orderSize.min = 4; }, "orderSize.max");
  expectInvalid(config => { config.orderSize.weights = [1]; }, "orderSize.weights");
  expectInvalid(config => { config.orderSize.weights = [0, 0, 0]; }, "orderSize.weights");
  expectInvalid(config => { config.orderSize.weights = [-1, 1, 1]; }, "orderSize.weights");
  expectInvalid(config => { config.orderSize.weights = [1e308, 1e308, 1e308]; }, "orderSize.weights");
  expectInvalid(config => { config.toysBudget = 1; }, "toysBudget");
  expectInvalid(config => { config.toysBudget = 100; }, "toysBudget");
  expectInvalid(config => { config.warnThresholdSeconds = config.durationSeconds; }, "warnThresholdSeconds");
  for (const budget of [original.customersTotal, original.customersTotal * original.orderSize.max]) {
    const config = fresh(); config.toysBudget = budget;
    assert.equal(validate(config).valid, true);
  }
});

test("collects schema errors without coercion or dropping unknown keys", () => {
  const config = fresh();
  delete config.customersTotal;
  config.durationSeconds = "180";
  config.typo = 1;
  const result = validate(config);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 3);
  assert.equal(config.durationSeconds, "180");
  assert.equal(config.typo, 1);
});

test("collects independent relationship errors", () => {
  const config = fresh();
  config.orderSize.weights = [0, 0, 0];
  config.toysBudget = 100;
  config.warnThresholdSeconds = 180;
  assert.equal(validate(config).errors.length, 3);
});

function fakeRuntime(config = fresh(), fetchSchema = async () => schema) {
  const messages = [];
  let data = config;
  const runtime = {
    globalVars: { LevelConfigLoaded: 1, LevelConfigError: "stale" },
    objects: {
      LevelConfig: { getFirstInstance: () => ({ getJsonDataCopy: () => data }) },
      JSON: { sentinel: "assembly recipes must not be read or changed" }
    },
    assets: { fetchJson: fetchSchema }
  };
  const logger = { log: message => messages.push(message), error: message => messages.push(message) };
  return { runtime, logger, messages, setData: value => { data = value; } };
}

test("loader publishes flags, logs once, caches schema and supports retry after invalid data", async () => {
  let fetches = 0;
  const fixture = fakeRuntime(fresh(), async name => {
    assert.equal(name, "level-config.schema.json"); fetches++; return schema;
  });
  const recipes = fixture.runtime.objects.JSON;
  assert.equal((await api.loadShiftConfig(fixture.runtime, fixture.logger)).valid, true);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 1);
  assert.equal(fixture.runtime.globalVars.LevelConfigError, "");
  assert.equal(fixture.messages.length, 1);
  fixture.setData({});
  await api.loadShiftConfig(fixture.runtime, fixture.logger);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 0);
  assert.ok(fixture.runtime.globalVars.LevelConfigError.includes("durationSeconds"));
  fixture.setData(fresh());
  await api.loadShiftConfig(fixture.runtime, fixture.logger);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 1);
  assert.equal(fixture.runtime.globalVars.LevelConfigError, "");
  assert.equal(fetches, 1);
  assert.equal(fixture.runtime.objects.JSON, recipes);
});

test("schema fetch and compilation failures keep readiness zero and allow retry", async () => {
  let fail = true;
  const fixture = fakeRuntime(fresh(), async () => {
    if (fail) throw new Error("schema unavailable"); return schema;
  });
  await api.loadShiftConfig(fixture.runtime, fixture.logger);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 0);
  assert.match(fixture.runtime.globalVars.LevelConfigError, /schema unavailable/);
  fail = false;
  await api.loadShiftConfig(fixture.runtime, fixture.logger);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 1);
  const broken = fakeRuntime(fresh(), async () => ({ type: "not-a-type" }));
  assert.equal((await api.loadShiftConfig(broken.runtime, broken.logger)).valid, false);
  assert.equal(broken.runtime.globalVars.LevelConfigLoaded, 0);
});

test("changing the supplied schema changes validation without rebuilding JavaScript", async () => {
  const modified = JSON.parse(JSON.stringify(schema));
  modified.properties.durationSeconds.minimum = 300;
  const fixture = fakeRuntime(fresh(), async () => modified);
  assert.equal((await api.loadShiftConfig(fixture.runtime, fixture.logger)).valid, false);
  assert.match(fixture.runtime.globalVars.LevelConfigError, /durationSeconds/);
});

test("readiness remains zero while awaiting schema; overlapping older request cannot overwrite latest", async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const fixture = fakeRuntime(fresh(), () => pending);
  const first = api.loadShiftConfig(fixture.runtime, fixture.logger);
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 0);
  fixture.setData({});
  const second = api.loadShiftConfig(fixture.runtime, fixture.logger);
  resolve(schema);
  assert.equal((await first).superseded, true);
  await second;
  assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, 0);
});

test("project script action loads the browser bundle and handles a missing vendor file", async () => {
  const sheet = JSON.parse(read("eventSheets/Event sheet 1.json"));
  const group = sheet.events.find(event => event.title === "SHIFT CONFIG");
  const fn = group.children.find(event => event.functionName === "LoadShiftConfig");
  const script = fn.actions[0].script.join("\n");
  for (const missing of [false, true]) {
    const fixture = fakeRuntime();
    const scope = vm.createContext({ runtime: fixture.runtime, console: fixture.logger });
    fixture.runtime.assets.loadScripts = async name => {
      assert.equal(name, "shift-config-validator.js");
      if (missing) throw new Error("missing bundle");
      vm.runInContext(bundle, scope);
    };
    await vm.runInContext(`(async () => { ${script}\n })()`, scope);
    assert.equal(fixture.runtime.globalVars.LevelConfigLoaded, missing ? 0 : 1);
    assert.equal(fixture.messages.length, 1);
  }
  assert.equal(fn.children, undefined);
  const success = group.children.find(event => event.conditions?.some(c => c.id === "on-parse-success"));
  assert.equal(success.actions[0].callFunction, "LoadShiftConfig");
});
