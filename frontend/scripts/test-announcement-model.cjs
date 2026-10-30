const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.join(__dirname, "../src/experience/announcements/announcement-model.ts");
const source = fs.readFileSync(filename, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUnderTest = new Module(filename, module);
moduleUnderTest._compile(output, filename);
const { announcementDwellMs, getActiveAnnouncements, resolveAnnouncementConfiguration, validateAnnouncementConfiguration } = moduleUnderTest.exports;

const item = (id, displayOrder = 0, extra = {}) => ({ id, enabled: true, message: id, style: "STATIC", displayOrder, ...extra });
const config = (items, displayMode = "SINGLE", rotationIntervalSeconds = 5) => ({ displayMode, rotationIntervalSeconds, items });
const now = Date.parse("2026-01-15T00:00:00Z");

assert.deepEqual(getActiveAnnouncements(config([]), now), []);
assert.deepEqual(getActiveAnnouncements(config([item("one")]), now).map(x => x.id), ["one"]);
assert.deepEqual(getActiveAnnouncements(config([item("later", 2), item("first", 0)]), now).map(x => x.id), ["first", "later"]);
assert.deepEqual(getActiveAnnouncements(config([] ,"CAROUSEL"), now), []);
assert.equal(getActiveAnnouncements(config([item("one")], "CAROUSEL"), now).length, 1);
assert.equal(getActiveAnnouncements(config([item("one"), item("two")], "CAROUSEL"), now).length, 2);
assert.deepEqual(getActiveAnnouncements(config([
  item("disabled", 0, { enabled: false }),
  item("future", 1, { startsAt: "2026-02-01T00:00:00Z" }),
  item("expired", 2, { endsAt: "2026-01-01T00:00:00Z" }),
  item("active", 3),
], "CAROUSEL"), now).map(x => x.id), ["active"]);
assert.deepEqual(getActiveAnnouncements(config([item("future", 0, { startsAt: "2026-02-01T00:00:00Z" })]), Date.parse("2026-02-01T00:00:00Z")).map(x => x.id), ["future"]);

for (const [invalid, reason] of [
  [config([item("x"), item("x")]), "unique"],
  [config([item("x"), item(" x ")]), "unique"],
  [config([item("x", 0, { style: "FLY" })]), "style"],
  [config([item("x", 0, { backgroundColor: "red" })]), "colour"],
  [config([item("x", 0, { linkUrl: "http://example.com" })]), "HTTPS"],
  [config([item("x", 0, { startsAt: "2026-02-01T00:00:00Z", endsAt: "2026-01-01T00:00:00Z" })]), "after"],
  [config(Array.from({ length: 21 }, (_, index) => item(String(index)))), "20"],
  [config([], "CAROUSEL", 2), "3 to 60"],
  [config([], "CAROUSEL", 61), "3 to 60"],
]) assert.ok(validateAnnouncementConfiguration(invalid).some(error => error.toLowerCase().includes(reason.toLowerCase())), reason);
assert.deepEqual(validateAnnouncementConfiguration(config([item("one", 0, { style: "PULSE", textColor: "#ABCDEF" })])), []);

const legacy = resolveAnnouncementConfiguration({ announcementEnabled: true, announcementMessage: "Old message", announcementStyle: "TICKER" });
assert.equal(legacy.items.length, 1);
assert.equal(legacy.items[0].message, "Old message");
assert.equal(legacy.items[0].style, "TICKER");
assert.equal(resolveAnnouncementConfiguration({}).items.length, 0);
assert.equal(announcementDwellMs(item("short", 0, { style: "STATIC" }), 5), 5000);
assert.ok(announcementDwellMs(item("long message ".repeat(20), 0, { style: "TYPEWRITER" }), 3) > 3000);
assert.ok(announcementDwellMs(item("short", 0, { style: "TICKER" }), 3) >= 18000);
console.log("Announcement model assertions passed");
