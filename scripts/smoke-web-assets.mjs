import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const assetDir = path.join(root, "app/src/main/assets/public");
const requiredAssets = [
  "index.html",
  "game.js",
  "styles.css",
  "lottie.min.js",
  "loader.json",
  "success.json",
  "cards.json",
  "logo.jpg",
  "manifest.webmanifest"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of requiredAssets) {
  assert(fs.existsSync(path.join(assetDir, file)), `Missing asset: ${file}`);
}

const assetFiles = fs.readdirSync(assetDir);
assert(!assetFiles.some((file) => /backup/i.test(file)), "Backup assets must not ship in the Android bundle");

const html = fs.readFileSync(path.join(assetDir, "index.html"), "utf8");
const gameJs = fs.readFileSync(path.join(assetDir, "game.js"), "utf8");

assert(html.includes('<script src="lottie.min.js"></script>'), "Lottie must load from packaged assets");
assert(html.includes('id="menuPrivacy"'), "Privacy entry point must be visible in the app chrome");
assert(html.includes('id="privacyModal"'), "Privacy policy modal must be packaged");
assert(html.includes('id="reserve"'), "Reserve slot must be packaged");
assert(html.includes('id="reserveModal"'), "Reserve rewarded-ad confirmation must be packaged");
assert(html.includes('unlock the Reserve slot'), "Privacy copy must disclose Reserve rewarded ads");
assert(!/https?:\/\//.test(html), "Packaged HTML must not depend on remote URLs");
assert(!/ca-app-pub-3940256099942544|developmentRewardedAdUnitId|developmentInterstitialAdUnitId|developmentBannerAdUnitId/.test(gameJs),
  "Web game bundle must not expose debug ad unit IDs");

function fakeElement() {
  return {
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() { return fakeElement(); },
    closest() { return null; },
    textContent: "",
    innerHTML: "",
    hidden: false
  };
}

const foundations = ["S", "H", "D", "C"].map((suit) => ({ ...fakeElement(), dataset: { foundation: suit } }));
const context = {
  console,
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout(callback) {
    return callback();
  },
  window: {
    addEventListener() {},
    AndroidAds: null
  },
  document: {
    body: fakeElement(),
    createElement() { return fakeElement(); },
    getElementById() { return fakeElement(); },
    querySelector() { return fakeElement(); },
    querySelectorAll(selector) {
      return selector === ".foundation" ? foundations : [];
    }
  }
};

vm.createContext(context);
vm.runInContext(`${gameJs}\nglobalThis.__klondikeTest = { state, findMoves, moveToReserve, restore };`, context);

const { state, findMoves, moveToReserve, restore } = context.__klondikeTest;
Object.assign(state, {
  stock: [],
  waste: [],
  reserve: [],
  foundations: { S: [{ suit: "S", rank: 4, faceUp: true, id: "4S" }], H: [], D: [], C: [] },
  tableau: [
    [
      { suit: "S", rank: 5, faceUp: true, id: "5S" },
      { suit: "H", rank: 6, faceUp: true, id: "6H" }
    ],
    [],
    [],
    [],
    [],
    [],
    []
  ]
});

assert(!findMoves().some((move) => move.type === "foundation" && move.card.id === "5S"),
  "AI must not recommend buried tableau cards for foundation moves");

state.tableau[0] = [{ suit: "S", rank: 5, faceUp: true, id: "5S" }];
assert(findMoves().some((move) => move.type === "foundation" && move.card.id === "5S"),
  "AI should recommend legal top tableau cards for foundation moves");

Object.assign(state, {
  stock: [],
  waste: [],
  reserve: [],
  reserveUnlocked: true,
  foundations: { S: [], H: [], D: [], C: [] },
  tableau: [
    [{ suit: "S", rank: 7, faceUp: true, id: "7S" }],
    [],
    [],
    [],
    [],
    [],
    []
  ],
  history: []
});

assert(moveToReserve({ source: "tableau-0", index: 0, cardId: "7S" }), "Reserve should accept one exposed card after unlock");
assert(state.reserve.length === 1 && state.reserve[0].id === "7S", "Reserve must hold the moved card");
assert(state.tableau[0].length === 0, "Reserve move must remove the original source card");
state.foundations.S = [{ suit: "S", rank: 6, faceUp: true, id: "6S" }];
assert(findMoves().some((move) => move.type === "foundation" && move.selection.source === "reserve" && move.card.id === "7S"),
  "AI should include legal Reserve cards");

restore(state.history.pop());
assert(state.reserve.length === 0, "Undo must restore an empty Reserve");
assert(state.tableau[0].length === 1 && state.tableau[0][0].id === "7S", "Undo must restore the reserved card to source");

console.log("Web asset smoke checks passed");
