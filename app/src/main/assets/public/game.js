const suits = ["S", "H", "D", "C"];
const suitGlyph = { S: "♠", H: "♥", D: "♦", C: "♣" };
const ranks = [null, "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const redSuits = new Set(["H", "D"]);
const ADMOB_CONFIG = {
  bannerPlacement: "bottom anchored adaptive",
  rewardAmount: 3,
  rewardItem: "AI hints",
  reserveRewardItem: "Reserve unlock"
};

const state = {
  stock: [],
  waste: [],
  reserve: [],
  foundations: { S: [], H: [], D: [], C: [] },
  tableau: [[], [], [], [], [], [], []],
  selected: null,
  moves: 0,
  score: 0,
  seconds: 0,
  timerId: null,
  freeHints: 3,
  rewardedHints: 0,
  adLoading: false,
  reserveAdLoading: false,
  reserveUnlocked: false,
  pendingReserveSelection: null,
  reserveMessage: "",
  assistedDeal: false,
  interstitialLoading: false,
  pendingNewGame: false,
  privacyOptionsRequired: false,
  newGameBreaks: 0,
  lastInterstitialAt: 0,
  history: []
};

const els = {
  stock: document.querySelector("#stock"),
  waste: document.querySelector("#waste"),
  reserve: document.querySelector("#reserve"),
  tableau: document.querySelector("#tableau"),
  foundations: document.querySelectorAll(".foundation"),
  moves: document.querySelector("#moves"),
  timer: document.querySelector("#timer"),
  score: document.querySelector("#score"),
  bannerAd: document.querySelector("#bannerAd"),
  newGameBtn: document.querySelector("#menuNewGame"),
  hintBtn: document.querySelector("#hintBtn"),
  autoBtn: document.querySelector("#menuAiMove"),
  rewardedAdBtn: document.querySelector("#rewardedAdBtn"),
  undoBtn: document.querySelector("#menuUndo"),
  winModal: document.querySelector("#winModal"),
  privacyModal: document.querySelector("#privacyModal"),
  reserveModal: document.querySelector("#reserveModal"),
  playAgainBtn: document.querySelector("#playAgainBtn"),
  closePrivacyBtn: document.querySelector("#closePrivacyBtn"),
  privacyChoicesBtn: document.querySelector("#privacyChoicesBtn"),
  reserveWatchBtn: document.querySelector("#reserveWatchBtn"),
  reserveCancelBtn: document.querySelector("#reserveCancelBtn"),
  reserveStatus: document.querySelector("#reserveStatus"),
  themeBtn: document.querySelector("#menuTheme"),
  privacyBtn: document.querySelector("#menuPrivacy"),
  stuckBanner: document.querySelector("#stuckBanner"),
  stuckNewGameBtn: document.querySelector("#stuckNewGameBtn")
};

function startTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.seconds = 0;
  state.timerId = setInterval(() => {
    state.seconds += 1;
    const mins = Math.floor(state.seconds / 60).toString().padStart(2, '0');
    const secs = (state.seconds % 60).toString().padStart(2, '0');
    if (els.timer) els.timer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
}

function cardId(card) {
  return `${card.rank}${card.suit}`;
}

function makeDeck() {
  const deck = [];
  suits.forEach((suit) => {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank, faceUp: false, id: `${rank}${suit}` });
  });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function newGame() {
  const deck = makeDeck();
  Object.assign(state, {
    stock: [],
    waste: [],
    reserve: [],
    foundations: { S: [], H: [], D: [], C: [] },
    tableau: [[], [], [], [], [], [], []],
    selected: null,
    moves: 0,
    score: 0,
    freeHints: 3,
    rewardedHints: 0,
    adLoading: false,
    reserveAdLoading: false,
    reserveUnlocked: false,
    pendingReserveSelection: null,
    reserveMessage: "",
    assistedDeal: false,
    interstitialLoading: false,
    pendingNewGame: false,
    history: []
  });

  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const card = deck.pop();
      card.faceUp = row === col;
      state.tableau[col].push(card);
    }
  }
  state.stock = deck;
  setAi("New deal ready. Try revealing hidden cards first.");
  if (els.winModal) els.winModal.classList.remove("active");
  startTimer();
  render();
}

function startNewGameFlow(allowInterstitial = false) {
  if (!allowInterstitial || !shouldShowNewGameInterstitial()) {
    newGame();
    return;
  }
  state.pendingNewGame = true;
  showNewGameInterstitial();
}

function shouldShowNewGameInterstitial() {
  const hasStartedPlaying = state.moves >= 3 || state.score > 0;
  const enoughTimePassed = Date.now() - state.lastInterstitialAt > 180000;
  return hasStartedPlaying && enoughTimePassed && !state.interstitialLoading;
}

function snapshot() {
  return JSON.stringify({
    stock: state.stock,
    waste: state.waste,
    reserve: state.reserve,
    foundations: state.foundations,
    tableau: state.tableau,
    moves: state.moves,
    score: state.score,
    freeHints: state.freeHints,
    rewardedHints: state.rewardedHints,
    newGameBreaks: state.newGameBreaks,
    lastInterstitialAt: state.lastInterstitialAt
  });
}

function restore(raw) {
  const data = JSON.parse(raw);
  Object.assign(state, data, { selected: null, history: state.history });
  render();
}

function saveHistory() {
  state.history.push(snapshot());
  if (state.history.length > 50) state.history.shift();
}

function color(card) {
  return redSuits.has(card.suit) ? "red" : "black";
}

function oppositeColors(a, b) {
  return color(a) !== color(b);
}

function canPlaceOnTableau(card, target) {
  if (!target) return card.rank === 13;
  return target.faceUp && oppositeColors(card, target) && card.rank === target.rank - 1;
}

function canPlaceOnFoundation(card, suit) {
  const pile = state.foundations[suit];
  if (card.suit !== suit) return false;
  if (!pile.length) return card.rank === 1;
  return card.rank === pile[pile.length - 1].rank + 1;
}

function makeCard(card, source, index = 0) {
  const btn = document.createElement("button");
  btn.className = `card ${card.faceUp ? color(card) : "back"} ${card.faceUp ? "selectable" : ""} ${card.rank === 10 ? "rank-10" : ""}`;
  btn.dataset.card = card.id;
  btn.dataset.source = source;
  btn.dataset.index = index;
  btn.setAttribute("aria-label", card.faceUp ? `${ranks[card.rank]} ${suitGlyph[card.suit]}` : "Face down card");

  if (card.faceUp) {
    btn.innerHTML = `<span class="corner"><span class="rank">${ranks[card.rank]}</span><span class="mini-suit">${suitGlyph[card.suit]}</span></span><span class="suit">${suitGlyph[card.suit]}</span>`;
  }
  if (state.selected?.cardId === card.id) btn.classList.add("selected");
  return btn;
}

function render() {
  if (els.moves) els.moves.textContent = `${state.moves} moves`;
  if (els.score) els.score.textContent = `Score ${state.score}`;
  if (els.hintBtn) els.hintBtn.textContent = `Hint (${state.freeHints + state.rewardedHints})`;
  if (els.rewardedAdBtn) {
    els.rewardedAdBtn.textContent = state.adLoading ? "Loading..." : `Watch Ad (+${ADMOB_CONFIG.rewardAmount})`;
    els.rewardedAdBtn.disabled = state.adLoading || state.reserveAdLoading;
  }

  if (els.bannerAd) {
    const strong = els.bannerAd.querySelector("strong");
    if (strong) strong.textContent = `Banner ready: ${ADMOB_CONFIG.bannerPlacement}`;
  }

  if (els.stock) {
    els.stock.classList.toggle("has-cards", state.stock.length > 0);
    els.stock.textContent = state.stock.length ? "" : "↻";
  }

  if (els.waste) {
    els.waste.innerHTML = "";
    const wasteTop = state.waste[state.waste.length - 1];
    if (wasteTop) els.waste.appendChild(makeCard(wasteTop, "waste", state.waste.length - 1));
  }

  if (els.reserve) {
    els.reserve.innerHTML = "";
    els.reserve.classList.toggle("locked", !state.reserveUnlocked);
    els.reserve.classList.toggle("unlocked", state.reserveUnlocked);
    els.reserve.classList.toggle("occupied", state.reserve.length > 0);
    els.reserve.classList.toggle("loading", state.reserveAdLoading);
    const reserveTop = state.reserve[0];
    if (reserveTop) {
      els.reserve.setAttribute("aria-label", "Reserve card");
      els.reserve.appendChild(makeCard(reserveTop, "reserve", 0));
    } else {
      els.reserve.setAttribute("aria-label", state.reserveUnlocked ? "Empty reserve slot" : "Locked reserve slot");
      els.reserve.innerHTML = state.reserveAdLoading
        ? '<span class="reserve-label">Loading</span>'
        : '<span class="reserve-label">Reserve</span><span class="reserve-subtitle">Ad</span>';
    }
  }

  if (els.reserveWatchBtn) {
    els.reserveWatchBtn.textContent = state.reserveAdLoading ? "Loading..." : "Watch Ad";
    els.reserveWatchBtn.disabled = state.reserveAdLoading || state.adLoading;
  }
  if (els.reserveStatus) {
    els.reserveStatus.hidden = !state.reserveMessage;
    els.reserveStatus.textContent = state.reserveMessage;
  }

  els.foundations.forEach((slot) => {
    const suit = slot.dataset.foundation;
    const top = state.foundations[suit][state.foundations[suit].length - 1];
    slot.innerHTML = top ? "" : suitGlyph[suit];
    if (top) slot.appendChild(makeCard(top, `foundation-${suit}`, state.foundations[suit].length - 1));
  });

  if (els.tableau) {
    els.tableau.innerHTML = "";
    state.tableau.forEach((pile, col) => {
      const pileEl = document.createElement("div");
      pileEl.className = "pile";
      pileEl.dataset.col = col;
      let stackOffset = 0;
      pile.forEach((card, index) => {
        const cardEl = makeCard(card, "tableau-" + col, index);
        cardEl.style.setProperty("--stack-offset", stackOffset.toFixed(2));
        pileEl.appendChild(cardEl);
        stackOffset += card.faceUp ? 1 : 0.58;
      });
      pileEl.style.setProperty("--pile-steps", stackOffset.toFixed(2));
      els.tableau.appendChild(pileEl);
    });
  }

  if (els.stuckBanner) els.stuckBanner.hidden = !isDeadlocked();

  checkWin();
}

function setAi(text) {
  // Silent for now
}

function clearHints() {
  document.querySelectorAll(".hint").forEach((el) => el.classList.remove("hint"));
}

function sourceCards(selection) {
  if (!selection) return [];
  if (selection.source === "waste") return [state.waste[state.waste.length - 1]];
  if (selection.source === "reserve") return state.reserve.length ? [state.reserve[0]] : [];
  if (selection.source.startsWith("foundation-")) {
    const suit = selection.source.split("-")[1];
    return [state.foundations[suit][state.foundations[suit].length - 1]];
  }
  if (selection.source.startsWith("tableau-")) {
    const col = Number(selection.source.split("-")[1]);
    return state.tableau[col].slice(selection.index);
  }
  return [];
}

function removeSource(selection) {
  if (selection.source === "waste") return state.waste.splice(state.waste.length - 1, 1);
  if (selection.source === "reserve") return state.reserve.splice(0, 1);
  if (selection.source.startsWith("foundation-")) {
    const suit = selection.source.split("-")[1];
    return state.foundations[suit].splice(state.foundations[suit].length - 1, 1);
  }
  const col = Number(selection.source.split("-")[1]);
  return state.tableau[col].splice(selection.index);
}

function revealTop(col) {
  const pile = state.tableau[col];
  const top = pile[pile.length - 1];
  if (top && !top.faceUp) {
    top.faceUp = true;
    state.score += 5;
  }
}

function completeMove(points = 5) {
  state.moves += 1;
  state.score += points;
  state.selected = null;
  clearHints();
  render();

  // Haptic feedback
  if (window.AndroidAds?.vibrate) {
    window.AndroidAds.vibrate(15);
  }

  // Attempt auto-move to foundation only if all cards are revealed
  if (isAllRevealed()) {
    setTimeout(autoFoundationLoop, 250);
  }
}

function isAllRevealed() {
  if (state.stock.length > 0) return false;
  for (const pile of state.tableau) {
    for (const card of pile) {
      if (!card.faceUp) return false;
    }
  }
  return true;
}

function autoFoundationLoop() {
  let moved = false;
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    for (const suit of suits) {
      if (canPlaceOnFoundation(wasteTop, suit)) {
        moveToFoundation({ source: "waste", index: state.waste.length - 1, cardId: wasteTop.id }, suit);
        moved = true;
        break;
      }
    }
  }
  if (moved) return;
  const reserveTop = state.reserve[0];
  if (reserveTop) {
    for (const suit of suits) {
      if (canPlaceOnFoundation(reserveTop, suit)) {
        moveToFoundation({ source: "reserve", index: 0, cardId: reserveTop.id }, suit);
        moved = true;
        break;
      }
    }
  }
  if (moved) return;
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    const top = pile[pile.length - 1];
    if (top && top.faceUp) {
      for (const suit of suits) {
        if (canPlaceOnFoundation(top, suit)) {
          moveToFoundation({ source: `tableau-${col}`, index: pile.length - 1, cardId: top.id }, suit);
          moved = true;
          break;
        }
      }
    }
    if (moved) break;
  }
}

function moveToTableau(selection, targetCol) {
  const moving = sourceCards(selection);
  if (!moving.length) return false;
  const targetPile = state.tableau[targetCol];
  const target = targetPile[targetPile.length - 1];
  if (!canPlaceOnTableau(moving[0], target)) return false;
  saveHistory();
  removeSource(selection);
  targetPile.push(...moving);
  if (selection.source.startsWith("tableau-")) revealTop(Number(selection.source.split("-")[1]));
  completeMove(selection.source === "waste" ? 5 : 3);
  return true;
}

function moveToReserve(selection) {
  const moving = sourceCards(selection);
  if (!state.reserveUnlocked || state.reserve.length || moving.length !== 1 || !moving[0].faceUp) return false;
  saveHistory();
  removeSource(selection);
  state.reserve.push(moving[0]);
  state.assistedDeal = true;
  if (selection.source.startsWith("tableau-")) revealTop(Number(selection.source.split("-")[1]));
  completeMove(selection.source === "waste" ? 3 : 2);
  return true;
}

function moveToFoundation(selection, suit) {
  const moving = sourceCards(selection);
  if (moving.length !== 1 || !canPlaceOnFoundation(moving[0], suit)) return false;
  saveHistory();
  removeSource(selection);
  state.foundations[suit].push(moving[0]);
  if (selection.source.startsWith("tableau-")) revealTop(Number(selection.source.split("-")[1]));
  completeMove(10);
  return true;
}

function drawStock() {
  if (!state.stock.length && !state.waste.length) return;
  saveHistory();
  if (state.stock.length) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.waste.push(card);
    state.moves += 1;
  } else {
    state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    state.waste = [];
    state.moves += 1;
    state.score = Math.max(0, state.score - 20);
  }
  state.selected = null;
  render();
}

function selectCard(cardEl) {
  const source = cardEl.dataset.source;
  const index = Number(cardEl.dataset.index);
  if (source.startsWith("tableau-")) {
    const col = Number(source.split("-")[1]);
    if (!state.tableau[col][index].faceUp) {
      if (window.AndroidAds?.vibrate) window.AndroidAds.vibrate(40);
      return;
    }
  }
  state.selected = { source, index, cardId: cardEl.dataset.card };
  clearHints();
  render();
}

function handleCardClick(cardEl) {
  const source = cardEl.dataset.source;
  const cardIdClicked = cardEl.dataset.card;
  if (state.selected && state.selected.cardId === cardIdClicked) {
    for (const suit of suits) {
      if (moveToFoundation(state.selected, suit)) return;
    }
  }
  if (!state.selected) {
    selectCard(cardEl);
    return;
  }
  if (source.startsWith("tableau-")) {
    const col = Number(source.split("-")[1]);
    if (moveToTableau(state.selected, col)) return;
  }
  if (source.startsWith("foundation-")) {
    const suit = source.split("-")[1];
    if (moveToFoundation(state.selected, suit)) return;
  }
  if (source === "reserve" && moveToReserve(state.selected)) return;
  selectCard(cardEl);
}

function promptReserveUnlock(selection = null) {
  if (state.reserveUnlocked) return false;
  if (selection) {
    const moving = sourceCards(selection);
    if (moving.length !== 1 || !moving[0].faceUp) {
      if (window.AndroidAds?.vibrate) window.AndroidAds.vibrate(40);
      return false;
    }
  }
  state.pendingReserveSelection = selection ? { ...selection } : null;
  state.reserveMessage = "";
  if (els.reserveModal) els.reserveModal.classList.add("active");
  render();
  return true;
}

function hideReservePrompt() {
  if (state.reserveAdLoading) return;
  state.pendingReserveSelection = null;
  state.reserveMessage = "";
  if (els.reserveModal) els.reserveModal.classList.remove("active");
  render();
}

function handleReserveClick(event) {
  const card = event.target.closest(".card");
  if (card) {
    handleCardClick(card);
    return;
  }
  if (state.selected) {
    if (moveToReserve(state.selected)) return;
    if (!state.reserveUnlocked) promptReserveUnlock(state.selected);
    return;
  }
  if (!state.reserveUnlocked) promptReserveUnlock();
}

function findMoves() {
  const moves = [];
  const candidates = [];
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) candidates.push({ card: wasteTop, selection: { source: "waste", index: state.waste.length - 1, cardId: wasteTop.id }, reveals: false });
  const reserveTop = state.reserve[0];
  if (reserveTop) candidates.push({ card: reserveTop, selection: { source: "reserve", index: 0, cardId: reserveTop.id }, reveals: false, topCard: true, fromCol: null });
  state.tableau.forEach((pile, col) => {
    pile.forEach((card, index) => {
      if (!card.faceUp) return;
      candidates.push({
        card,
        selection: { source: `tableau-${col}`, index, cardId: card.id },
        reveals: index > 0 && !pile[index - 1].faceUp,
        topCard: index === pile.length - 1,
        fromCol: col
      });
    });
  });
  candidates.forEach((candidate) => {
    suits.forEach((suit) => {
      const canMoveSingleCard = candidate.selection.source === "waste" || candidate.topCard;
      if (canMoveSingleCard && canPlaceOnFoundation(candidate.card, suit)) {
        moves.push({ ...candidate, type: "foundation", suit, score: 100 + candidate.card.rank + (candidate.reveals ? 40 : 0) });
      }
    });
    state.tableau.forEach((pile, col) => {
      if (candidate.fromCol === col) return;
      const target = pile[pile.length - 1];
      // Moving a King that already sits at the base of a tableau column to another
      // empty column is a no-op shuffle; never offer it as a move.
      if (!target && candidate.card.rank === 13 && candidate.selection.index === 0
        && candidate.selection.source.startsWith("tableau-")) return;
      if (canPlaceOnTableau(candidate.card, target)) {
        const opensKingSpace = candidate.card.rank === 13 && !target ? 20 : 0;
        moves.push({ ...candidate, type: "tableau", col, score: 40 + (candidate.reveals ? 60 : 0) + opensKingSpace });
      }
    });
  });
  return moves.sort((a, b) => b.score - a.score);
}

function cardHasAnyPlacement(card) {
  for (const suit of suits) {
    if (canPlaceOnFoundation(card, suit)) return true;
  }
  for (const pile of state.tableau) {
    if (canPlaceOnTableau(card, pile[pile.length - 1])) return true;
  }
  return false;
}

function isDeadlocked() {
  if (findMoves().length) return false;
  // With one-card draws every stock/waste card cycles back to the top eventually,
  // so drawing only helps if some stock or waste card has a legal placement.
  if (state.stock.some(cardHasAnyPlacement) || state.waste.some(cardHasAnyPlacement)) return false;
  // An empty unlocked Reserve can still absorb a card and change the board.
  if (state.reserveUnlocked && !state.reserve.length) {
    if (state.waste.length) return false;
    for (const pile of state.tableau) {
      const top = pile[pile.length - 1];
      if (top && top.faceUp) return false;
    }
  }
  // Moving a foundation card back onto the tableau is the last legal escape.
  for (const suit of suits) {
    const pile = state.foundations[suit];
    const top = pile[pile.length - 1];
    if (top && cardHasAnyPlacement(top)) return false;
  }
  return true;
}

function showHint() {
  if (state.freeHints + state.rewardedHints <= 0) {
    showRewardedHintAd();
    return;
  }

  // Actually use the hint credit
  if (state.freeHints > 0) {
    state.freeHints -= 1;
  } else if (state.rewardedHints > 0) {
    state.rewardedHints -= 1;
  }

  render(); // Update UI to show decreased hints

  clearHints();
  const [move] = findMoves();
  if (!move) return;
  const selector = `[data-card="${move.card.id}"]`;
  const el = document.querySelector(selector);
  if (el) el.classList.add("hint");
}

function useHintCredit() {
  if (state.freeHints > 0) {
    state.freeHints -= 1;
    return true;
  }
  if (state.rewardedHints > 0) {
    state.rewardedHints -= 1;
    return true;
  }
  render();
  return false;
}

function grantRewardedHints(amount = ADMOB_CONFIG.rewardAmount) {
  state.rewardedHints += amount;
  state.adLoading = false;
  render();
  // Show the hint immediately after the ad is done if they were waiting for one
  showHint();
}

function handleRewardedAdClosedWithoutReward() {
  state.adLoading = false;
  render();
}

function handleRewardedAdFailed(message = "Ad not ready yet.") {
  state.adLoading = false;
  render();
}

function showRewardedHintAd() {
  if (state.adLoading || state.reserveAdLoading) return;
  state.adLoading = true;
  render();
  if (window.AndroidAds?.showRewardedHintAd) {
    window.AndroidAds.showRewardedHintAd();
    return;
  }
  setTimeout(() => grantRewardedHints(ADMOB_CONFIG.rewardAmount), 700);
}

function grantReserveUnlock() {
  state.reserveUnlocked = true;
  state.reserveAdLoading = false;
  state.reserveMessage = "";
  state.assistedDeal = true;
  const pendingSelection = state.pendingReserveSelection;
  state.pendingReserveSelection = null;
  if (els.reserveModal) els.reserveModal.classList.remove("active");
  render();
  if (pendingSelection && !moveToReserve(pendingSelection)) {
    state.selected = null;
    render();
  }
}

function handleReserveAdClosedWithoutReward() {
  state.reserveAdLoading = false;
  state.reserveMessage = "Ad closed. Reserve was not unlocked.";
  render();
}

function handleReserveAdFailed(message = "Reserve ad is not ready yet.") {
  state.reserveAdLoading = false;
  state.reserveMessage = message;
  render();
}

function showRewardedReserveAd() {
  if (state.reserveUnlocked) {
    if (els.reserveModal) els.reserveModal.classList.remove("active");
    render();
    return;
  }
  if (state.reserveAdLoading || state.adLoading) return;
  state.reserveAdLoading = true;
  state.reserveMessage = "";
  render();
  if (window.AndroidAds?.showRewardedReserveAd) {
    window.AndroidAds.showRewardedReserveAd();
    return;
  }
  setTimeout(grantReserveUnlock, 700);
}

function showNewGameInterstitial() {
  state.interstitialLoading = true;
  render();
  if (window.AndroidAds?.showInterstitialAd) {
    window.AndroidAds.showInterstitialAd();
    return;
  }
  setTimeout(() => handleInterstitialClosed(), 700);
}

function handleInterstitialClosed() {
  state.interstitialLoading = false;
  state.lastInterstitialAt = Date.now();
  state.newGameBreaks += 1;
  if (state.pendingNewGame) {
    state.pendingNewGame = false;
    newGame();
    return;
  }
  render();
}

function handleInterstitialFailed(message = "Interstitial ad not ready.") {
  state.interstitialLoading = false;
  const shouldStartNewGame = state.pendingNewGame;
  state.pendingNewGame = false;
  if (shouldStartNewGame) {
    newGame();
    return;
  }
  render();
}

function autoMove() {
  const moves = findMoves();
  if (!moves.length) {
    drawStock();
    return;
  }
  for (const move of moves) {
    if (move.type === "foundation" && moveToFoundation(move.selection, move.suit)) return;
    if (move.type === "tableau" && moveToTableau(move.selection, move.col)) return;
  }
  drawStock();
}

function checkWin() {
  const total = suits.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
  if (total === 52) {
    stopTimer();
    if (document.querySelector("#finalTime")) document.querySelector("#finalTime").textContent = els.timer ? els.timer.textContent : "00:00";
    if (document.querySelector("#finalMoves")) document.querySelector("#finalMoves").textContent = state.moves;
    if (document.querySelector("#finalScore")) document.querySelector("#finalScore").textContent = state.score;
    if (els.winModal) els.winModal.classList.add("active");
    if (successAnim) successAnim.goToAndPlay(0, true);

    state.lastInterstitialAt = Date.now() - 180000;
  }
}

// Lottie Animations
let loaderAnim, successAnim;

function initLottie() {
  if (!window.lottie) return;
  try {
    loaderAnim = lottie.loadAnimation({
      container: document.getElementById('loaderLottie'),
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: 'loader.json'
    });
    successAnim = lottie.loadAnimation({
      container: document.getElementById('successLottie'),
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: 'success.json'
    });
  } catch (e) {}
}

function setPrivacyOptionsRequired(required) {
  state.privacyOptionsRequired = required;
  if (els.privacyChoicesBtn) els.privacyChoicesBtn.hidden = !required;
}

function showPrivacyPolicy() {
  if (els.privacyModal) els.privacyModal.classList.add("active");
}

function hidePrivacyPolicy() {
  if (els.privacyModal) els.privacyModal.classList.remove("active");
}

function showPrivacyChoices() {
  if (window.AndroidAds?.showPrivacyOptionsForm) window.AndroidAds.showPrivacyOptionsForm();
}

function showLoader(duration = 2000) {
  const loader = document.getElementById('gameLoader');
  if (!loader) return;
  loader.style.display = 'grid';
  loader.style.opacity = '1';
  setTimeout(() => {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }, duration);
}

window.addEventListener('DOMContentLoaded', () => {
  initLottie();
  showLoader(2500);

  if (els.playAgainBtn) els.playAgainBtn.addEventListener("click", () => startNewGameFlow(true));
  if (els.themeBtn) els.themeBtn.addEventListener("click", () => document.body.classList.toggle("theme-sapphire"));
  if (els.stock) els.stock.addEventListener("click", drawStock);
  if (els.waste) els.waste.addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (card) handleCardClick(card);
  });
  if (els.reserve) els.reserve.addEventListener("click", handleReserveClick);
  if (els.tableau) els.tableau.addEventListener("click", (event) => {
    const card = event.target.closest(".card");
    if (card) {
      handleCardClick(card);
      return;
    }
    const pile = event.target.closest(".pile");
    if (pile && state.selected) moveToTableau(state.selected, Number(pile.dataset.col));
  });
  els.foundations.forEach((slot) => {
    slot.addEventListener("click", (event) => {
      const card = event.target.closest(".card");
      if (card) {
        handleCardClick(card);
        return;
      }
      if (state.selected) moveToFoundation(state.selected, slot.dataset.foundation);
    });
  });

  if (els.newGameBtn) els.newGameBtn.addEventListener("click", () => startNewGameFlow(false));
  if (els.stuckNewGameBtn) els.stuckNewGameBtn.addEventListener("click", () => startNewGameFlow(true));
  if (els.hintBtn) els.hintBtn.addEventListener("click", showHint);
  if (els.autoBtn) els.autoBtn.addEventListener("click", autoMove);
  if (els.rewardedAdBtn) els.rewardedAdBtn.addEventListener("click", showRewardedHintAd);
  if (els.privacyBtn) els.privacyBtn.addEventListener("click", showPrivacyPolicy);
  if (els.closePrivacyBtn) els.closePrivacyBtn.addEventListener("click", hidePrivacyPolicy);
  if (els.privacyChoicesBtn) els.privacyChoicesBtn.addEventListener("click", showPrivacyChoices);
  if (els.reserveWatchBtn) els.reserveWatchBtn.addEventListener("click", showRewardedReserveAd);
  if (els.reserveCancelBtn) els.reserveCancelBtn.addEventListener("click", hideReservePrompt);
  if (els.undoBtn) els.undoBtn.addEventListener("click", () => {
    const previous = state.history.pop();
    if (!previous) return;
    restore(previous);
  });

  window.AdmobConfig = ADMOB_CONFIG;
  window.onRewardedHintEarned = grantRewardedHints;
  window.onRewardedHintClosed = handleRewardedAdClosedWithoutReward;
  window.onRewardedHintFailed = handleRewardedAdFailed;
  window.onRewardedReserveEarned = grantReserveUnlock;
  window.onRewardedReserveClosed = handleReserveAdClosedWithoutReward;
  window.onRewardedReserveFailed = handleReserveAdFailed;
  window.onInterstitialClosed = handleInterstitialClosed;
  window.onInterstitialFailed = handleInterstitialFailed;
  window.onPrivacyOptionsRequirementChanged = setPrivacyOptionsRequired;

  newGame();
});
