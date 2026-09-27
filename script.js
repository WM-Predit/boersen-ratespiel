const bootSplash = document.getElementById('bootSplash');
if (bootSplash.style.display !== 'none') {
  setTimeout(() => {
    bootSplash.classList.add('hide');
    sessionStorage.setItem('boersenspiel_booted', '1');
    setTimeout(() => bootSplash.remove(), 550);
  }, 1300);
} else {
  bootSplash.remove();
}

const menu = document.getElementById('menu');
const views = document.querySelectorAll('.view');
// Merkt sich, aus welcher Ansicht das Lexikon geöffnet wurde (Quiz, News), damit "Zurück" dorthin führt statt ins Menü.
let lexReturnView = null;

// Timer einer Ansicht stoppen, sobald sie verlassen wird — sonst liefen sie unsichtbar im Hintergrund weiter.
function leaveView(viewId) {
  if (viewId === 'depot-view') stopDepotLive();
  if (viewId === 'game-view') clearRoundTimer();
}

function openView(viewId) {
  views.forEach(v => {
    if (v.id !== viewId && !v.classList.contains('hidden')) leaveView(v.id);
  });
  lexReturnView = null;
  menu.classList.add('hidden');
  views.forEach(v => v.classList.toggle('hidden', v.id !== viewId));
  if (viewId === 'learn-view') resetLearnView();
  if (viewId === 'game-view') newRound();
  if (viewId === 'news-view') updateTickerSpeed();
  if (viewId === 'daily-view') openDaily();
  if (viewId === 'sparplan-view') renderSparplan();
  if (viewId === 'lexikon-view') resetLexikon();
  const hash = document.getElementById(viewId).dataset.hash;
  if (hash) history.replaceState(null, '', '#' + hash);
  window.scrollTo(0, 0);
}

function closeView(view) {
  view.classList.add('hidden');
  leaveView(view.id);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (view.id === 'lexikon-view' && lexReturnView) {
    const returnView = document.getElementById(lexReturnView);
    returnView.classList.remove('hidden');
    if (returnView.dataset.hash) history.replaceState(null, '', '#' + returnView.dataset.hash);
    lexReturnView = null;
    return;
  }
  menu.classList.remove('hidden');
  updateDailyMenuLabel();
}

document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => openView(btn.dataset.view));
});
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => closeView(btn.closest('.view')));
});
// Querverweise zwischen den Bereichen: data-goto öffnet eine Ansicht, data-lex einen Lexikon-Eintrag.
document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  const lex = e.target.closest('[data-lex]');
  if (!goto && !lex) return;
  e.preventDefault();
  if (goto) openView(goto.dataset.goto);
  else openLexikon(lex.dataset.lex);
});

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

const HISTORY_POINTS = 90;
const FUTURE_POINTS = 25;

const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnNext = document.getElementById('btnNext');
const banner = document.getElementById('banner');

const roundEl = document.getElementById('round');
const scoreEl = document.getElementById('score');
const streakEl = document.getElementById('streak');
const bestEl = document.getElementById('best');
const multiplierBadge = document.getElementById('multiplierBadge');
const roundTimerBar = document.getElementById('roundTimerBar');
const streakToast = document.getElementById('streakToast');

const ROUND_TIME_MS = 6000;
const BASE_POINTS = 10;
const STREAK_MILESTONES = [3, 5, 10];

let round = 1;
let score = 0;
let streak = 0;
let best = Number(localStorage.getItem('boersenspiel_best') || 0);
bestEl.textContent = best;

let series = [];
let guessing = true;
let roundTimer = null;
let roundTimeLeft = ROUND_TIME_MS;

function getMultiplier(s) {
  if (s >= 10) return 3;
  if (s >= 5) return 2;
  if (s >= 3) return 1.5;
  return 1;
}

function updateMultiplierBadge() {
  const mult = getMultiplier(streak);
  if (mult > 1) {
    multiplierBadge.textContent = '🔥 ×' + mult;
    multiplierBadge.classList.remove('hidden');
  } else {
    multiplierBadge.classList.add('hidden');
  }
}

function startRoundTimer() {
  clearRoundTimer();
  roundTimeLeft = ROUND_TIME_MS;
  roundTimerBar.style.width = '100%';
  roundTimerBar.classList.remove('urgent');
  roundTimer = setInterval(() => {
    roundTimeLeft -= 100;
    const pct = Math.max(0, roundTimeLeft / ROUND_TIME_MS) * 100;
    roundTimerBar.style.width = pct + '%';
    roundTimerBar.classList.toggle('urgent', pct < 30);
    if (roundTimeLeft <= 0) {
      clearRoundTimer();
      if (guessing) revealAndScore(null, true);
    }
  }, 100);
}

function clearRoundTimer() {
  if (roundTimer) {
    clearInterval(roundTimer);
    roundTimer = null;
  }
}

function showStreakToast(streakCount, multiplier) {
  streakToast.textContent = `🔥 ${streakCount}er Serie! Punkte ×${multiplier}`;
  streakToast.classList.remove('hidden', 'pop');
  void streakToast.offsetWidth;
  streakToast.classList.add('pop');
  clearTimeout(showStreakToast._timer);
  showStreakToast._timer = setTimeout(() => streakToast.classList.add('hidden'), 1800);
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// rand/gauss sind austauschbar, damit die Tages-Challenge denselben Generator mit festem Seed nutzen kann.
function generateSeries(rand = Math.random, gauss = gaussianRandom) {
  const total = HISTORY_POINTS + FUTURE_POINTS;
  const drift = (rand() - 0.45) * 0.006;
  const volatility = 0.012 + rand() * 0.022;
  const points = [100];
  for (let i = 1; i < total; i++) {
    const shock = gauss() * volatility;
    const next = points[i - 1] * (1 + drift + shock);
    points.push(Math.max(5, next));
  }
  return points;
}

function draw(visibleCount, opts = {}) {
  drawSeries(ctx, series, visibleCount, opts);
}

function drawSeries(ctx, series, visibleCount, opts = {}) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  const visible = series.slice(0, visibleCount);
  const min = Math.min(...visible);
  const max = Math.max(...visible);
  const pad = (max - min) * 0.12 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  const historyEnd = Math.min(HISTORY_POINTS, visibleCount);
  const xStep = W / (HISTORY_POINTS + FUTURE_POINTS - 1);

  function toXY(i, price) {
    const x = i * xStep;
    const y = H - ((price - yMin) / (yMax - yMin)) * H;
    return [x, y];
  }

  // Gradient-Fläche unter dem bisherigen Kursverlauf
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(96, 165, 250, 0.28)');
  gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.beginPath();
  for (let i = 0; i < historyEnd; i++) {
    const [x, y] = toXY(i, series[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(toXY(historyEnd - 1, series[historyEnd - 1])[0], H);
  ctx.lineTo(toXY(0, series[0])[0], H);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  ctx.shadowColor = 'rgba(96, 165, 250, 0.6)';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#60a5fa';
  ctx.beginPath();
  for (let i = 0; i < historyEnd; i++) {
    const [x, y] = toXY(i, series[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (visibleCount > HISTORY_POINTS) {
    const revealColor = opts.color || '#8b95ab';
    ctx.shadowColor = revealColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = revealColor;
    ctx.beginPath();
    for (let i = HISTORY_POINTS - 1; i < visibleCount; i++) {
      const [x, y] = toXY(i, series[i]);
      if (i === HISTORY_POINTS - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const dividerX = (HISTORY_POINTS - 1) * xStep;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(dividerX, 0);
  ctx.lineTo(dividerX, H);
  ctx.stroke();
  ctx.setLineDash([]);

  const [lx, ly] = toXY(visibleCount - 1, series[visibleCount - 1]);
  const dotColor = visibleCount > HISTORY_POINTS ? (opts.color || '#8b95ab') : '#60a5fa';
  ctx.shadowColor = dotColor;
  ctx.shadowBlur = 14;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function newRound() {
  series = generateSeries();
  guessing = true;
  banner.classList.add('hidden');
  banner.classList.remove('correct', 'wrong');
  btnNext.classList.add('hidden');
  btnUp.disabled = false;
  btnDown.disabled = false;
  roundEl.textContent = round;
  updateMultiplierBadge();
  draw(HISTORY_POINTS);
  startRoundTimer();
}

function revealAndScore(guessUp, timedOut = false) {
  clearRoundTimer();
  guessing = false;
  btnUp.disabled = true;
  btnDown.disabled = true;

  const startPrice = series[HISTORY_POINTS - 1];
  const endPrice = series[series.length - 1];
  const actuallyUp = endPrice > startPrice;
  const pctChange = ((endPrice - startPrice) / startPrice) * 100;
  const correct = guessUp === actuallyUp;
  const revealColor = actuallyUp ? '#34d399' : '#fb7185';
  const suspenseColor = '#facc15';

  let frame = HISTORY_POINTS;
  const timer = setInterval(() => {
    frame++;
    const isLastFrame = frame >= series.length;
    // Während der Enthüllung bewusst eine neutrale Farbe zeigen, damit man
    // dem Ergebnis nicht schon an der Linienfarbe ansieht, bevor sie fertig
    // gezeichnet ist — erst im letzten Frame wird eingefärbt.
    draw(frame, { color: isLastFrame ? revealColor : suspenseColor });
    if (isLastFrame) {
      clearInterval(timer);
      showResult(correct, pctChange, timedOut);
    }
  }, 55);
}

const CONFETTI_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fb7185', '#facc15'];

function burstConfetti() {
  const count = 28;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const size = 6 + Math.random() * 6;
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.width = size + 'px';
    piece.style.height = size * 0.4 + 'px';
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    piece.style.animationDelay = (Math.random() * 0.15) + 's';
    document.body.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function showResult(correct, pctChange, timedOut = false) {
  let points = 0;
  if (correct) {
    const multiplier = getMultiplier(streak);
    points = Math.round(BASE_POINTS * multiplier);
    score += points;
    streak++;
    if (streak > best) {
      best = streak;
      localStorage.setItem('boersenspiel_best', String(best));
    }
    burstConfetti();
    if (STREAK_MILESTONES.includes(streak)) {
      showStreakToast(streak, getMultiplier(streak));
    }
  } else {
    streak = 0;
  }

  updateMultiplierBadge();
  scoreEl.textContent = score;
  streakEl.textContent = streak;
  bestEl.textContent = best;
  [scoreEl, streakEl, bestEl].forEach(bump);

  const sign = pctChange >= 0 ? '+' : '';
  const resultText = timedOut ? '⏰ Zeit abgelaufen!' : correct ? `✅ Richtig! +${points} Punkte` : '❌ Falsch.';
  banner.textContent = `${resultText} ${sign}${pctChange.toFixed(1)}%`;
  banner.classList.remove('hidden');
  banner.classList.add(correct ? 'correct' : 'wrong');

  btnNext.classList.remove('hidden');
}

btnUp.addEventListener('click', () => { if (guessing) revealAndScore(true); });
btnDown.addEventListener('click', () => { if (guessing) revealAndScore(false); });
btnNext.addEventListener('click', () => {
  round++;
  newRound();
});

// --- Tages-Challenge ---

// Jeden Tag dieselben DAILY_ROUNDS Kursverläufe für alle Spieler (Seed = Datum in Berlin), ein Versuch pro Tag, Ergebnis
// als Emoji-Zeile zum Teilen. Der Zufallsgenerator nutzt bewusst nur Grundrechenarten (mulberry32 + Irwin-Hall statt
// Box-Muller): Math.log/Math.cos dürfen je nach Browser in der letzten Stelle abweichen, dann sähen zwei Spieler
// womöglich minimal andere Kurven.

const DAILY_STORAGE_KEY = 'boersenspiel_daily';
const DAILY_ROUNDS = 5;
const DAILY_FIRST_DAY = '2026-09-27';
const DAILY_SHARE_URL = 'https://boersen-ratespiel.github.io/#challenge';

const dailyCanvas = document.getElementById('dailyChart');
const dailyCtx = dailyCanvas.getContext('2d');
const dailyEls = {
  play: document.getElementById('dailyPlay'),
  result: document.getElementById('dailyResult'),
  round: document.getElementById('dailyRound'),
  score: document.getElementById('dailyScore'),
  streak: document.getElementById('dailyStreak'),
  dots: document.getElementById('dailyDots'),
  banner: document.getElementById('dailyBanner'),
  up: document.getElementById('dailyUp'),
  down: document.getElementById('dailyDown'),
  next: document.getElementById('dailyNext'),
  title: document.getElementById('dailyResultTitle'),
  emojis: document.getElementById('dailyResultEmojis'),
  summary: document.getElementById('dailyResultSummary'),
  share: document.getElementById('dailyShare'),
  shareStatus: document.getElementById('dailyShareStatus'),
  countdown: document.getElementById('dailyCountdown'),
  menuSub: document.getElementById('dailyMenuSub'),
};

let dailySeries = [];
let dailyGuessing = false;
let dailyCountdownTimer = null;

function berlinDayKey(date = new Date()) {
  // en-CA formatiert als JJJJ-MM-TT
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date);
}

function shiftDayKey(dayKey, days) {
  const d = new Date(dayKey + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dailyNumber(dayKey) {
  return Math.round((Date.parse(dayKey + 'T12:00:00Z') - Date.parse(DAILY_FIRST_DAY + 'T12:00:00Z')) / 86400000) + 1;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeriesFor(dayKey, roundIndex) {
  const rand = mulberry32(hashString(`boersen-ratespiel|${dayKey}|${roundIndex}`));
  // Irwin-Hall: Summe aus 12 Gleichverteilungen minus 6 ist näherungsweise standardnormalverteilt.
  const gauss = () => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += rand();
    return sum - 6;
  };
  return generateSeries(rand, gauss);
}

function loadDailyState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY));
  } catch (e) {}
  const state = {
    date: null,
    results: [],
    streakDays: 0,
    lastCompleted: null,
    ...(saved && typeof saved === 'object' ? saved : {}),
  };
  if (!Array.isArray(state.results)) state.results = [];
  return state;
}

function saveDailyState(state) {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// Tagesstand laden; an einem neuen Tag beginnt eine frische Challenge. Die Tagesserie bleibt nur bestehen,
// wenn die letzte abgeschlossene Challenge gestern oder heute war.
function currentDailyState() {
  const today = berlinDayKey();
  const state = loadDailyState();
  if (state.date !== today) {
    state.date = today;
    state.results = [];
  }
  if (state.lastCompleted !== today && state.lastCompleted !== shiftDayKey(today, -1)) {
    state.streakDays = 0;
  }
  return state;
}

function dailyHits(state) {
  return state.results.filter(r => r.correct).length;
}

function dailyEmojiRow(state) {
  return state.results.map(r => (r.correct ? '🟩' : '🟥')).join('');
}

function updateDailyMenuLabel() {
  const state = currentDailyState();
  if (state.results.length >= DAILY_ROUNDS) {
    dailyEls.menuSub.textContent = `Heute gespielt: ${dailyHits(state)}/${DAILY_ROUNDS} ${dailyEmojiRow(state)}`;
  } else if (state.results.length > 0) {
    dailyEls.menuSub.textContent = `Weiterspielen: Runde ${state.results.length + 1} von ${DAILY_ROUNDS}`;
  } else {
    dailyEls.menuSub.textContent = `Neu: ${DAILY_ROUNDS} Kursverläufe, für alle gleich`;
  }
}

function renderDailyStats(state) {
  const roundNo = Math.min(state.results.length + 1, DAILY_ROUNDS);
  dailyEls.round.textContent = `${roundNo}/${DAILY_ROUNDS}`;
  dailyEls.score.textContent = `${dailyHits(state)}`;
  dailyEls.streak.textContent = `${state.streakDays}`;
  dailyEls.dots.innerHTML = '';
  for (let i = 0; i < DAILY_ROUNDS; i++) {
    const dot = document.createElement('span');
    const r = state.results[i];
    dot.className = 'daily-dot' + (r ? (r.correct ? ' hit' : ' miss') : i === state.results.length ? ' current' : '');
    dailyEls.dots.appendChild(dot);
  }
}

function openDaily() {
  const state = currentDailyState();
  saveDailyState(state);
  if (state.results.length >= DAILY_ROUNDS) {
    showDailyResult(state);
  } else {
    dailyEls.result.classList.add('hidden');
    dailyEls.play.classList.remove('hidden');
    startDailyRound(state);
  }
}

function startDailyRound(state) {
  dailySeries = dailySeriesFor(state.date, state.results.length);
  dailyGuessing = true;
  dailyEls.banner.classList.add('hidden');
  dailyEls.banner.classList.remove('correct', 'wrong');
  dailyEls.next.classList.add('hidden');
  dailyEls.up.disabled = false;
  dailyEls.down.disabled = false;
  renderDailyStats(state);
  drawSeries(dailyCtx, dailySeries, HISTORY_POINTS);
}

function dailyGuess(guessUp) {
  if (!dailyGuessing) return;
  dailyGuessing = false;
  dailyEls.up.disabled = true;
  dailyEls.down.disabled = true;

  const startPrice = dailySeries[HISTORY_POINTS - 1];
  const endPrice = dailySeries[dailySeries.length - 1];
  const actuallyUp = endPrice > startPrice;
  const pctChange = ((endPrice - startPrice) / startPrice) * 100;
  const correct = guessUp === actuallyUp;

  // Tipp sofort speichern: Neu laden während der Animation darf keinen zweiten Versuch ergeben.
  const state = currentDailyState();
  state.results.push({ correct, up: actuallyUp });
  const finished = state.results.length >= DAILY_ROUNDS;
  if (finished) {
    state.streakDays = state.lastCompleted === shiftDayKey(state.date, -1) ? state.streakDays + 1 : 1;
    state.lastCompleted = state.date;
  }
  saveDailyState(state);

  const revealColor = actuallyUp ? '#34d399' : '#fb7185';
  const series = dailySeries;
  let frame = HISTORY_POINTS;
  const timer = setInterval(() => {
    frame++;
    const isLastFrame = frame >= series.length;
    drawSeries(dailyCtx, series, frame, { color: isLastFrame ? revealColor : '#facc15' });
    if (!isLastFrame) return;
    clearInterval(timer);
    const sign = pctChange >= 0 ? '+' : '';
    dailyEls.banner.textContent = `${correct ? '✅ Richtig!' : '❌ Falsch.'} ${sign}${pctChange.toFixed(1)}%`;
    dailyEls.banner.classList.remove('hidden');
    dailyEls.banner.classList.add(correct ? 'correct' : 'wrong');
    if (correct) burstConfetti();
    renderDailyStats(state);
    dailyEls.next.textContent = finished ? 'Ergebnis ansehen →' : 'Nächster Kurs →';
    dailyEls.next.classList.remove('hidden');
  }, 55);
}

function dailyShareText(state) {
  const hits = dailyHits(state);
  const lines = [
    `📈 Börsen-Ratespiel · Tages-Challenge #${dailyNumber(state.date)}`,
    `${dailyEmojiRow(state)} ${hits}/${DAILY_ROUNDS}`,
  ];
  if (state.streakDays > 1) lines.push(`🔥 ${state.streakDays} Tage in Folge`);
  lines.push(DAILY_SHARE_URL);
  return lines.join('\n');
}

function dailyVerdict(hits) {
  if (hits === DAILY_ROUNDS) return { emoji: '🏆', title: 'Perfekt! Alle Kurse richtig getippt' };
  if (hits >= 4) return { emoji: '🎉', title: 'Starkes Gespür für den Markt!' };
  if (hits >= 3) return { emoji: '👍', title: 'Mehr Treffer als Nieten' };
  if (hits >= 2) return { emoji: '🎲', title: 'Der Markt war heute launisch' };
  return { emoji: '🙈', title: 'Heute lag der Markt anders' };
}

function showDailyResult(state) {
  dailyEls.play.classList.add('hidden');
  dailyEls.result.classList.remove('hidden');
  const hits = dailyHits(state);
  const verdict = dailyVerdict(hits);
  dailyEls.title.textContent = `${verdict.emoji} ${verdict.title}`;
  dailyEls.emojis.textContent = dailyEmojiRow(state);
  const streakText = state.streakDays > 1 ? ` · 🔥 ${state.streakDays} Tage in Folge` : '';
  dailyEls.summary.textContent = `Tages-Challenge #${dailyNumber(state.date)}: ${hits} von ${DAILY_ROUNDS} richtig${streakText}`;
  dailyEls.shareStatus.textContent = '';
  if (hits === DAILY_ROUNDS) burstConfetti();
  startDailyCountdown();
}

function startDailyCountdown() {
  clearInterval(dailyCountdownTimer);
  const today = berlinDayKey();
  const update = () => {
    if (dailyEls.result.classList.contains('hidden') || document.getElementById('daily-view').classList.contains('hidden')) {
      clearInterval(dailyCountdownTimer);
      return;
    }
    if (berlinDayKey() !== today) {
      clearInterval(dailyCountdownTimer);
      dailyEls.countdown.innerHTML = 'Die neue Challenge ist da! <button class="link-btn" id="dailyReload">Jetzt spielen</button>';
      document.getElementById('dailyReload').addEventListener('click', openDaily);
      return;
    }
    // Mitternacht in Berlin: kleinsten Zeitpunkt suchen, an dem der Berliner Tag wechselt (minutengenau reicht).
    const now = Date.now();
    let lo = now, hi = now + 26 * 3600000;
    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2);
      if (berlinDayKey(new Date(mid)) === today) lo = mid; else hi = mid;
    }
    const left = Math.max(0, hi - now);
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    dailyEls.countdown.textContent = `Nächste Challenge in ${h} Std. ${String(m).padStart(2, '0')} Min. ${String(s).padStart(2, '0')} Sek.`;
  };
  update();
  dailyCountdownTimer = setInterval(update, 1000);
}

async function shareDaily() {
  const text = dailyShareText(currentDailyState());
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    dailyEls.shareStatus.textContent = '✅ Ergebnis kopiert — jetzt einfach in WhatsApp & Co. einfügen.';
  } catch (e) {
    dailyEls.shareStatus.textContent = text;
  }
}

dailyEls.up.addEventListener('click', () => dailyGuess(true));
dailyEls.down.addEventListener('click', () => dailyGuess(false));
dailyEls.next.addEventListener('click', () => {
  const state = currentDailyState();
  if (state.results.length >= DAILY_ROUNDS) showDailyResult(state);
  else startDailyRound(state);
});
dailyEls.share.addEventListener('click', shareDaily);
updateDailyMenuLabel();

// --- Musterdepot ---

const DEPOT_STORAGE_KEY = 'boersenspiel_depot';
const DEPOT_START_CASH = 10000;
const DEPOT_BUY_AMOUNT = 500;

const DEPOT_STOCKS_DEFAULT = [
  { id: 'tech', name: 'TechCorp', price: 120 },
  { id: 'green', name: 'GreenEnergy AG', price: 45 },
  { id: 'handel', name: 'HandelsKette', price: 80 },
  { id: 'bio', name: 'BioPharma', price: 200 },
];

function loadDepot() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEPOT_STORAGE_KEY));
    if (saved && typeof saved.cash === 'number' && saved.stocks) {
      return saved;
    }
  } catch (e) {}
  return {
    cash: DEPOT_START_CASH,
    stocks: DEPOT_STOCKS_DEFAULT.map(s => ({ ...s })),
    holdings: {},
  };
}

let depot = loadDepot();

function saveDepot() {
  localStorage.setItem(DEPOT_STORAGE_KEY, JSON.stringify(depot));
}

function formatEuro(n) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function depotHoldingsValue() {
  return depot.stocks.reduce((sum, s) => sum + (depot.holdings[s.id] || 0) * s.price, 0);
}

function renderDepot() {
  const cashEl = document.getElementById('depotCash');
  const holdingsValueEl = document.getElementById('depotHoldingsValue');
  const totalEl = document.getElementById('depotTotal');
  const returnEl = document.getElementById('depotReturn');
  const list = document.getElementById('depotStocks');

  const holdingsValue = depotHoldingsValue();
  const total = depot.cash + holdingsValue;
  const returnPct = ((total - DEPOT_START_CASH) / DEPOT_START_CASH) * 100;

  cashEl.textContent = formatEuro(depot.cash);
  holdingsValueEl.textContent = formatEuro(holdingsValue);
  totalEl.textContent = formatEuro(total);
  returnEl.textContent = (returnPct >= 0 ? '+' : '') + returnPct.toFixed(1) + ' %';
  returnEl.style.color = returnPct > 0 ? 'var(--green)' : returnPct < 0 ? 'var(--red)' : '';

  list.innerHTML = '';
  depot.stocks.forEach(stock => {
    const shares = depot.holdings[stock.id] || 0;
    const value = shares * stock.price;
    const trend = depotTrends[stock.id];
    const trendClass = trend === 'up' ? 'flash-up' : trend === 'down' ? 'flash-down' : '';
    const trendArrow = trend === 'up' ? ' ▲' : trend === 'down' ? ' ▼' : '';

    const li = document.createElement('li');
    li.className = 'stock-row';
    li.innerHTML = `
      <div class="stock-info">
        <span class="stock-name">${stock.name}</span>
        <span class="stock-price ${trendClass}">${formatEuro(stock.price)} je Anteil${trendArrow}</span>
        ${shares > 0 ? `<span class="stock-position">${shares.toFixed(2)} Anteile · ${formatEuro(value)}</span>` : ''}
      </div>
      <div class="stock-actions">
        <button class="mini-btn buy" data-action="buy" data-id="${stock.id}">+ ${DEPOT_BUY_AMOUNT} €</button>
        <button class="mini-btn sell" data-action="sell" data-id="${stock.id}" ${shares > 0 ? '' : 'disabled'}>Verkaufen</button>
      </div>
    `;
    list.appendChild(li);
  });
}

document.getElementById('depotStocks').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const stock = depot.stocks.find(s => s.id === btn.dataset.id);
  if (!stock) return;

  if (btn.dataset.action === 'buy') {
    if (depot.cash < DEPOT_BUY_AMOUNT) return;
    depot.cash -= DEPOT_BUY_AMOUNT;
    depot.holdings[stock.id] = (depot.holdings[stock.id] || 0) + DEPOT_BUY_AMOUNT / stock.price;
  } else if (btn.dataset.action === 'sell') {
    const shares = depot.holdings[stock.id] || 0;
    depot.cash += shares * stock.price;
    depot.holdings[stock.id] = 0;
  }

  saveDepot();
  renderDepot();
});

let depotTrends = {};
let depotLiveTimer = null;
const DEPOT_TICK_MS = 1800;

function tickDepotPrices() {
  depot.stocks.forEach(stock => {
    const oldPrice = stock.price;
    const volatility = 0.03;
    const shock = gaussianRandom() * volatility;
    stock.price = Math.max(1, stock.price * (1 + shock));
    depotTrends[stock.id] = stock.price > oldPrice ? 'up' : stock.price < oldPrice ? 'down' : null;
  });
  saveDepot();
  renderDepot();
}

function startDepotLive() {
  if (depotLiveTimer) return;
  tickDepotPrices();
  depotLiveTimer = setInterval(tickDepotPrices, DEPOT_TICK_MS);
  const toggleBtn = document.getElementById('depotToggle');
  toggleBtn.textContent = '⏸ Pausieren';
  toggleBtn.classList.remove('start');
  toggleBtn.classList.add('stop');
  document.getElementById('depotLiveHint').classList.remove('hidden');
}

function stopDepotLive() {
  if (!depotLiveTimer) return;
  clearInterval(depotLiveTimer);
  depotLiveTimer = null;
  const toggleBtn = document.getElementById('depotToggle');
  toggleBtn.textContent = '▶️ Simulation starten';
  toggleBtn.classList.remove('stop');
  toggleBtn.classList.add('start');
  document.getElementById('depotLiveHint').classList.add('hidden');
}

document.getElementById('depotToggle').addEventListener('click', () => {
  if (depotLiveTimer) stopDepotLive(); else startDepotLive();
});

function showConfirm(message, onConfirm) {
  const overlay = document.getElementById('confirmModal');
  document.getElementById('confirmModalText').textContent = message;
  overlay.classList.remove('hidden');

  const okBtn = document.getElementById('confirmModalOk');
  const cancelBtn = document.getElementById('confirmModalCancel');

  function cleanup() {
    overlay.classList.add('hidden');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
    overlay.removeEventListener('click', onOverlayClick);
  }
  function onOk() { cleanup(); onConfirm(); }
  function onCancel() { cleanup(); }
  function onOverlayClick(e) { if (e.target === overlay) cleanup(); }

  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
  overlay.addEventListener('click', onOverlayClick);
}

document.getElementById('depotReset').addEventListener('click', () => {
  showConfirm('Depot wirklich zurücksetzen? Dein virtuelles Guthaben und alle Positionen gehen verloren.', () => {
    stopDepotLive();
    depot = {
      cash: DEPOT_START_CASH,
      stocks: DEPOT_STOCKS_DEFAULT.map(s => ({ ...s })),
      holdings: {},
    };
    depotTrends = {};
    saveDepot();
    renderDepot();
  });
});

renderDepot();

// --- KI-Berater ---

function generateDepotAdvice() {
  const holdingsEntries = depot.stocks
    .map(s => ({ ...s, shares: depot.holdings[s.id] || 0, value: (depot.holdings[s.id] || 0) * s.price }))
    .filter(s => s.shares > 0);
  const holdingsValue = depotHoldingsValue();
  const total = depot.cash + holdingsValue;
  const returnPct = ((total - DEPOT_START_CASH) / DEPOT_START_CASH) * 100;

  const messages = [];

  if (holdingsEntries.length === 0) {
    messages.push('Dein Depot ist noch komplett in Cash. Wie wäre es mit einer ersten Position, um zu starten? 🚀');
  } else if (holdingsEntries.length === 1) {
    messages.push(`Du hältst aktuell nur ${holdingsEntries[0].name}. Eine zweite Aktie aus einer anderen Branche würde dein Risiko streuen.`);
  } else {
    messages.push(`Du bist in ${holdingsEntries.length} verschiedene Aktien investiert — solide Diversifikation für den Anfang.`);
  }

  if (holdingsEntries.length > 0) {
    const largest = holdingsEntries.reduce((a, b) => (b.value > a.value ? b : a));
    const concentration = (largest.value / holdingsValue) * 100;
    if (concentration > 60) {
      messages.push(`Achtung: ${concentration.toFixed(0)}% deines Depotwerts stecken allein in ${largest.name}. Das ist ein Klumpenrisiko.`);
    }
  }

  const cashRatio = (depot.cash / total) * 100;
  if (cashRatio > 70 && holdingsEntries.length > 0) {
    messages.push(`${cashRatio.toFixed(0)}% deines Vermögens liegen noch als Cash da — ungenutztes Potenzial fürs Depot.`);
  }

  if (returnPct > 5) {
    messages.push(`Deine Rendite von +${returnPct.toFixed(1)}% läuft gut — bleib diszipliniert und handle nicht überstürzt. 📈`);
  } else if (returnPct < -5) {
    messages.push(`Aktuell ${returnPct.toFixed(1)}% im Minus — ganz normal bei schwankenden Kursen. Langfristig zählt der Zeithorizont, nicht ein einzelner Tag.`);
  } else {
    messages.push(`Deine Rendite liegt bei ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}% — im neutralen Bereich, gut zu beobachten.`);
  }

  return messages.slice(0, 4);
}

function showTypingBubble(container) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble ai-typing-bubble';
  bubble.innerHTML = '<span class="ai-typing-dots"><span></span><span></span><span></span></span>';
  container.appendChild(bubble);
  return bubble;
}

function openAiAdvisor() {
  const overlay = document.getElementById('aiModal');
  const body = document.getElementById('aiChatBody');
  body.innerHTML = '';
  overlay.classList.remove('hidden');

  const typingBubble = showTypingBubble(body);

  setTimeout(() => {
    typingBubble.remove();
    const advice = generateDepotAdvice();
    advice.forEach((text, i) => {
      setTimeout(() => {
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        bubble.textContent = text;
        body.appendChild(bubble);
        body.scrollTop = body.scrollHeight;
      }, i * 450);
    });
  }, 1100);
}

document.getElementById('aiAdvisorBtn').addEventListener('click', openAiAdvisor);
document.getElementById('aiModalClose').addEventListener('click', () => {
  document.getElementById('aiModal').classList.add('hidden');
});
document.getElementById('aiModal').addEventListener('click', (e) => {
  if (e.target.id === 'aiModal') document.getElementById('aiModal').classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const confirmModal = document.getElementById('confirmModal');
  if (!confirmModal.classList.contains('hidden')) {
    document.getElementById('confirmModalCancel').click();
  } else {
    document.getElementById('aiModal').classList.add('hidden');
  }
});

// --- News ---

// Echte Meldungen stehen in news.json (per GitHub Action aus den RSS-Feeds von Destatis und EZB erzeugt, siehe
// scripts/update_news.py). NEWS_EXAMPLES sind frei erfundene Ersatz-Meldungen, die nur erscheinen, wenn news.json
// nicht geladen werden kann — und dann klar als Beispiel gekennzeichnet werden.
const NEWS_URL = 'news.json';
const NEWS_PAGE_SIZE = 4;
const NEWS_LINK_HOSTS = ['www.destatis.de', 'www.ecb.europa.eu'];
const NEWS_SOURCES_NOTE = [
  { name: 'Statistisches Bundesamt (Destatis)', url: 'https://www.destatis.de/DE/Presse/Pressemitteilungen/_inhalt.html' },
  { name: 'Europäische Zentralbank (EZB)', url: 'https://www.ecb.europa.eu/press/pr/html/index.en.html' },
];
const TICKER_MAX_ITEMS = 12;
const TICKER_PX_PER_SECOND = 45;

const NEWS_EXAMPLES = [
  { headline: 'DAX unter Druck', desc: 'Steigende Ölpreise belasten die Märkte, der DAX hat zuletzt deutlich nachgegeben.', category: 'Markt', sentiment: 'bearish', impact: 3 },
  { headline: 'Fed signalisiert Zinssenkung', desc: 'Die Notenbank stellt eine lockerere Geldpolitik in Aussicht — die Börsen reagieren erleichtert.', category: 'Politik', sentiment: 'bullish', impact: 3 },
  { headline: 'Öl auf Jahreshoch', desc: 'Geopolitische Spannungen treiben die Rohstoffpreise weiter nach oben.', category: 'Markt', sentiment: 'bearish', impact: 2 },
  { headline: 'BASF plant Börsengang der Agrarsparte', desc: 'Das Agrargeschäft soll 2027 an die Frankfurter Börse gebracht werden — mögliche Bewertung: 20–30 Mrd. Euro.', category: 'Unternehmen', sentiment: 'bullish', impact: 2 },
  { headline: 'Sartorius im Plus', desc: 'Die Vorzugsaktie von Sartorius legte deutlich um +4,36% zu.', category: 'Unternehmen', sentiment: 'bullish', impact: 1 },
  { headline: 'Tech-Aktien unter Verkaufsdruck', desc: 'Sorge vor überzogenen Bewertungen im KI-Sektor lässt Kurse fallen.', category: 'Trend', sentiment: 'bearish', impact: 2 },
  { headline: 'Neuer Rekord beim DAX in Sicht?', desc: 'Analysten sehen nach starken Quartalszahlen weiteres Kurspotenzial.', category: 'Markt', sentiment: 'bullish', impact: 2 },
  { headline: 'Kryptomarkt in Bewegung', desc: 'Bitcoin schwankt stark, viele Anleger bleiben vorsichtig an der Seitenlinie.', category: 'Trend', sentiment: 'neutral', impact: 1 },
  { headline: 'Inflation überrascht positiv', desc: 'Verbraucherpreise steigen langsamer als erwartet — Entspannung an den Märkten.', category: 'Politik', sentiment: 'bullish', impact: 2 },
  { headline: 'Übernahmegerüchte belasten Branche', desc: 'Spekulationen um eine mögliche Fusion sorgen für Unsicherheit bei Investoren.', category: 'Unternehmen', sentiment: 'bearish', impact: 1 },
];

// Beispielmeldungen tragen eine Marktstimmung. Echte Meldungen (Statistik, Zentralbank) tragen nur die Richtung
// der gemeldeten Zahl — "Erzeugerpreise +4,6 %" ist keine gute oder schlechte Nachricht an sich.
const SENTIMENT_META = {
  bullish: { icon: '🟢', label: 'Bullish' },
  bearish: { icon: '🔴', label: 'Bearish' },
  neutral: { icon: '⚪', label: 'Neutral' },
};
const TREND_META = {
  up: { icon: '📈', label: 'Zahl steigt' },
  down: { icon: '📉', label: 'Zahl sinkt' },
  flat: { icon: '⚪', label: 'Neutral' },
};

const newsState = { items: [], live: false, loading: true, updated: null, offset: 0 };

const newsEls = {
  ticker: document.querySelector('.ticker'),
  track: document.getElementById('tickerTrack'),
  status: document.getElementById('newsStatus'),
  fazit: document.getElementById('newsAiFazit'),
  top: document.getElementById('newsTop'),
  list: document.getElementById('newsList'),
  note: document.getElementById('newsNote'),
  shuffle: document.getElementById('newsShuffle'),
  terms: document.getElementById('newsTerms'),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeNewsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && NEWS_LINK_HOSTS.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function formatNewsAge(date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// Prüft jeden Eintrag aus news.json und lässt nur bekannte, harmlose Werte durch.
function parseNewsFeed(data) {
  if (!data || !Array.isArray(data.items)) return [];
  return data.items.map(raw => {
    const url = safeNewsUrl(raw && raw.url);
    const published = new Date(raw && raw.published);
    if (!url || typeof raw.headline !== 'string' || !raw.headline || Number.isNaN(published.getTime())) return null;
    return {
      headline: raw.headline,
      desc: typeof raw.desc === 'string' ? raw.desc : '',
      source: typeof raw.source === 'string' ? raw.source.slice(0, 80) : '',
      lang: raw.lang === 'en' ? 'en' : 'de',
      category: typeof raw.category === 'string' && raw.category ? raw.category.slice(0, 30) : 'Wirtschaft',
      trend: ['up', 'down', 'flat'].includes(raw.trend) ? raw.trend : 'flat',
      impact: Math.min(3, Math.max(1, Number(raw.impact) || 1)),
      url,
      published,
    };
  }).filter(Boolean);
}

async function loadNews() {
  try {
    const res = await fetch(NEWS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const items = parseNewsFeed(data);
    if (items.length < NEWS_PAGE_SIZE) throw new Error('zu wenige Meldungen');
    const updated = new Date(data.updated);
    newsState.items = items;
    newsState.live = true;
    newsState.updated = Number.isNaN(updated.getTime()) ? null : updated;
  } catch {
    newsState.items = NEWS_EXAMPLES;
    newsState.live = false;
  }
  newsState.loading = false;
  renderNews();
}

// Icon + Beschriftung der Einordnung: Richtung der Zahl (echte News) bzw. Marktstimmung (Beispiele).
function newsSignal(item) {
  return newsState.live ? TREND_META[item.trend] : SENTIMENT_META[item.sentiment];
}

// Seitenweise blättern; die letzte Seite darf kürzer sein (sonst würden Meldungen von Seite 1 doppelt auftauchen).
function currentNewsPage() {
  return newsState.items.slice(newsState.offset, newsState.offset + NEWS_PAGE_SIZE);
}

function renderNewsAiFazit(items) {
  let text;
  if (newsState.live) {
    const up = items.filter(i => i.trend === 'up').length;
    const down = items.filter(i => i.trend === 'down').length;
    const parts = [];
    if (up) parts.push(`${up} steigende`);
    if (down) parts.push(`${down} sinkende`);
    text = parts.length
      ? `Von ${items.length} Meldungen auf dieser Seite zeigen ${parts.join(' und ')} Zahlen — eine Bestandsaufnahme, keine Kursprognose.`
      : 'Auf dieser Seite melden die Quellen keine klaren Zahlen-Trends.';
  } else {
    const counts = { bullish: 0, bearish: 0, neutral: 0 };
    items.forEach(item => counts[item.sentiment]++);
    if (counts.bullish > counts.bearish && counts.bullish >= 2) {
      text = 'Überwiegend positive Signale — die Chancen scheinen aktuell zu überwiegen.';
    } else if (counts.bearish > counts.bullish && counts.bearish >= 2) {
      text = 'Vorsicht angesagt — mehrere belastende Faktoren dominieren gerade das Bild.';
    } else {
      text = 'Gemischtes Bild — positive und negative Signale halten sich in etwa die Waage.';
    }
  }
  newsEls.fazit.innerHTML = `<span class="ai-badge">🤖 ${newsState.live ? 'Überblick' : 'KI-Fazit'}</span> ${text}`;
}

// Ticker mit gleichbleibender Lesegeschwindigkeit, egal wie viele Schlagzeilen laufen.
function updateTickerSpeed() {
  const distance = newsEls.track.scrollWidth / 2;
  if (distance > 0) newsEls.track.style.animationDuration = Math.max(20, distance / TICKER_PX_PER_SECOND) + 's';
}

function newsSourceLine(item) {
  if (!newsState.live) return '<span class="news-source example">🧪 Beispielmeldung — frei erfunden</span>';
  const lang = item.lang === 'en' ? ' <span class="news-lang" title="Englischsprachige Originalmeldung, unübersetzt">EN</span>' : '';
  return `<span class="news-source">${escapeHtml(item.source)}${lang} · ${formatNewsAge(item.published)} · <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Weiterlesen ↗</a></span>`;
}

function newsHeadline(item, className) {
  const lang = item.lang === 'en' ? ' lang="en"' : '';
  if (!newsState.live) return `<span class="${className}">${escapeHtml(item.headline)}</span>`;
  return `<a class="${className}" href="${escapeHtml(item.url)}"${lang} target="_blank" rel="noopener noreferrer">${escapeHtml(item.headline)}</a>`;
}

function renderNews() {
  newsEls.ticker.dataset.label = newsState.live || newsState.loading ? '📰 AKTUELL' : '🧪 BEISPIEL';

  if (newsState.loading) {
    newsEls.status.classList.add('hidden');
    newsEls.fazit.innerHTML = '';
    newsEls.top.innerHTML = '<p class="news-loading">Meldungen werden geladen …</p>';
    newsEls.list.innerHTML = '';
    newsEls.note.textContent = '';
    newsEls.terms.classList.add('hidden');
    newsEls.shuffle.disabled = true;
    return;
  }

  const page = currentNewsPage();
  // Top Story = relevanteste Meldung der Seite; bei Gleichstand die neuere (Liste ist nach Datum sortiert).
  const topStory = page.reduce((best, item) => (item.impact > best.impact ? item : best), page[0]);
  const rest = page.filter(item => item !== topStory);

  renderNewsAiFazit(page);

  newsEls.status.classList.toggle('hidden', newsState.live);
  if (!newsState.live) {
    newsEls.status.textContent = '⚠️ Die aktuellen Nachrichten konnten gerade nicht geladen werden. Du siehst frei erfundene Beispielmeldungen.';
  }

  const topSignal = newsSignal(topStory);
  newsEls.top.innerHTML = `
    <div class="news-top-ribbon">🔥 Top Story</div>
    <span class="news-chip category" data-cat="${escapeHtml(topStory.category)}">${escapeHtml(topStory.category)}</span>
    <span class="news-chip sentiment">${topSignal.icon} ${topSignal.label}</span>
    <h3>${newsHeadline(topStory, 'news-top-link')}</h3>
    ${topStory.desc ? `<p>${escapeHtml(topStory.desc)}</p>` : ''}
    ${newsSourceLine(topStory)}
  `;

  newsEls.list.innerHTML = '';
  rest.forEach(item => {
    const signal = newsSignal(item);
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="news-meta">
        <span class="news-chip category" data-cat="${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
        <span class="news-chip sentiment" title="${signal.label}">${signal.icon}</span>
        <span class="news-impact" title="Marktrelevanz">${'🔥'.repeat(item.impact)}</span>
      </div>
      ${newsHeadline(item, 'info-headline')}
      ${item.desc ? `<span class="info-desc">${escapeHtml(item.desc)}</span>` : ''}
      ${newsSourceLine(item)}
    `;
    newsEls.list.appendChild(li);
  });

  // Fachbegriffe aus den Meldungen dieser Seite, die das Lexikon erklärt.
  const terms = lexTermsFor(page.map(item => `${item.headline} ${item.desc}`).join(' '));
  newsEls.terms.classList.toggle('hidden', terms.length === 0);
  newsEls.terms.innerHTML = terms.length
    ? '<span class="news-terms-label">📖 Begriffe erklärt:</span> ' +
      terms.map(t => `<button class="news-term" data-lex="${escapeHtml(t.id)}">${escapeHtml(t.title)}</button>`).join('')
    : '';

  if (newsState.live) {
    const stand = newsState.updated
      ? ` · Stand: ${newsState.updated.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr`
      : '';
    const sources = NEWS_SOURCES_NOTE.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a>`).join(' und ');
    newsEls.note.innerHTML = `Quellen: ${sources}${stand}. Thema, Richtung der Zahl (📈/📉) und Relevanz (🔥) hat die App automatisch aus dem Text abgeleitet — sie stammen nicht von den Quellen und sind keine Kursprognose. Keine Anlageberatung.`;
  } else {
    newsEls.note.textContent = 'Beispielmeldungen, frei erfunden. Keine Anlageberatung.';
  }
  newsEls.shuffle.textContent = newsState.live ? '🔄 Weitere Meldungen' : '🔀 Neue Meldungen';
  newsEls.shuffle.disabled = false;

  const tickerItems = newsState.live ? newsState.items.slice(0, TICKER_MAX_ITEMS) : newsState.items;
  const tickerText = tickerItems.map(n => `${newsSignal(n).icon} ${n.headline}`).join('   ★   ');
  newsEls.track.textContent = tickerText + '   ★   ' + tickerText;
  updateTickerSpeed();
}

newsEls.shuffle.addEventListener('click', () => {
  const next = newsState.offset + NEWS_PAGE_SIZE;
  newsState.offset = next < newsState.items.length ? next : 0;
  renderNews();
});
renderNews();
loadNews();

// --- Termine (Wochenvorschau) ---

// termine.json erzeugt scripts/update_termine.py aus frei nutzbaren Kalendern (Destatis, BEA, EZB, Fed). Anders als
// bei den News gibt es hier bewusst KEINE erfundenen Ersatz-Termine: Fehlt die Datei, bleibt das Panel einfach weg.
const TERMINE_URL = 'termine.json';
const TERMINE_DAYS = 7;
const TERMINE_LINK_HOSTS = ['www.destatis.de', 'www.bea.gov', 'www.ecb.europa.eu', 'www.federalreserve.gov'];
const TERMINE_SOURCES_NOTE = [
  { name: 'Destatis', url: 'https://www.destatis.de/DE/Presse/Wochenvorschau/_inhalt.html' },
  { name: 'U.S. Bureau of Economic Analysis', url: 'https://www.bea.gov/news/schedule' },
  { name: 'EZB', url: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
];
const TERMINE_REGIONS = { DE: '🇩🇪', EU: '🇪🇺', US: '🇺🇸' };
const TERMINE_WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const termineEls = {
  panel: document.getElementById('terminePanel'),
  list: document.getElementById('termineList'),
  note: document.getElementById('termineNote'),
};

function textField(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Prüft jeden Eintrag aus termine.json und lässt nur bekannte, harmlose Werte durch (wie parseNewsFeed()).
function parseTermine(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  return items.map(raw => {
    let url = null;
    try {
      const u = new URL(raw.url);
      if (u.protocol === 'https:' && TERMINE_LINK_HOSTS.includes(u.hostname)) url = u.href;
    } catch (e) { /* ungültiger Link */ }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw && raw.date);
    const title = textField(raw && raw.title, 240);
    if (!url || !m || !title) return null;
    return {
      day: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
      time: /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : '',
      title,
      period: textField(raw.period, 60),
      hint: textField(raw.hint, 160),
      region: TERMINE_REGIONS[raw.region] ? raw.region : null,
      key: raw.key === true,
      source: textField(raw.source, 80),
      lang: raw.lang === 'en' ? 'en' : 'de',
      url,
    };
  }).filter(Boolean);
}

function termineDayLabel(day, today) {
  const diff = Math.round((day - today) / 86400000);
  const date = day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  if (diff === 0) return `Heute · ${date}`;
  if (diff === 1) return `Morgen · ${date}`;
  return `${TERMINE_WEEKDAYS[day.getDay()]} · ${date}`;
}

function renderTermine(items) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + TERMINE_DAYS);
  const upcoming = items
    .filter(t => t.day >= today && t.day < end)
    .sort((a, b) => a.day - b.day || (a.time || '99:99').localeCompare(b.time || '99:99'));

  const byDay = new Map();
  upcoming.forEach(t => {
    const k = t.day.getTime();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(t);
  });

  termineEls.list.innerHTML = byDay.size ? '' : '<p class="news-loading">Bei unseren Quellen stehen in den nächsten 7 Tagen keine Termine an.</p>';
  byDay.forEach((dayItems, k) => {
    const day = new Date(k);
    const group = document.createElement('div');
    group.className = 'termine-day' + (day.getTime() === today.getTime() ? ' today' : '');
    group.innerHTML = `<h3 class="termine-day-label">${termineDayLabel(day, today)}</h3>`;
    const ul = document.createElement('ul');
    ul.className = 'termine-list';
    dayItems.forEach(t => {
      const li = document.createElement('li');
      if (t.key) li.classList.add('key');
      const lang = t.lang === 'en' ? ' <span class="news-lang" title="Englischsprachiger Originaltitel, unübersetzt">EN</span>' : '';
      li.innerHTML = `
        <span class="termine-time">${t.time ? escapeHtml(t.time) : '—'}</span>
        <div class="termine-body">
          <span class="termine-title">${t.region ? `<span class="termine-flag" aria-hidden="true">${TERMINE_REGIONS[t.region]}</span> ` : ''}${escapeHtml(t.title)}${lang}${t.key ? ' <span class="termine-key" title="Von der App als besonders marktrelevant markiert">⭐ wichtig</span>' : ''}</span>
          ${t.period ? `<span class="termine-sub">Zeitraum: ${escapeHtml(t.period)}</span>` : ''}
          ${t.hint ? `<span class="termine-sub">💡 ${escapeHtml(t.hint)}</span>` : ''}
          <span class="news-source">${escapeHtml(t.source)} · <a href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">Kalender ↗</a></span>
        </div>
      `;
      ul.appendChild(li);
    });
    group.appendChild(ul);
    termineEls.list.appendChild(group);
  });

  const sources = TERMINE_SOURCES_NOTE.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a>`).join(', ');
  termineEls.note.innerHTML = `Quellen: ${sources}. Uhrzeiten in deutscher Zeit, Termine können sich kurzfristig ändern. Erklärungen (💡) und die Markierung „wichtig“ stammen von der App, nicht von den Quellen. Nicht enthalten sind ifo-Index, Einkaufsmanagerindizes, US-Arbeitsmarktdaten und Quartalszahlen von Unternehmen, weil es dafür keine frei nutzbare Quelle gibt. Keine Anlageberatung.`;
  termineEls.panel.classList.remove('hidden');
}

async function loadTermine() {
  try {
    const res = await fetch(TERMINE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderTermine(parseTermine(await res.json()));
  } catch (e) {
    termineEls.panel.classList.add('hidden');
  }
}
loadTermine();

// --- Lernen: Quiz ---

const LEARN_BEST_KEY = 'boersenspiel_learn_best';
const QUIZ_START_LIVES = 3;

const LEVELS = [
  { id: 'leicht', name: 'Leicht', icon: '🌱', points: 10, desc: 'Die Grundlagen' },
  { id: 'mittel', name: 'Mittel', icon: '⚡', points: 20, desc: 'Für Fortgeschrittene' },
  { id: 'schwer', name: 'Schwer', icon: '🔥', points: 30, desc: 'Echte Profi-Fragen' },
];

// Pro Durchlauf werden QUIZ_ROUND_SIZE Fragen zufällig aus dem Level gezogen und die Antworten gemischt.
// "correct" ist der Index der richtigen Antwort in "options", "lex" (optional) die ID eines Lexikon-Eintrags.
const QUIZ_DATA = {
  leicht: [
    { q: 'Was ist eine Aktie?', options: ['Ein Anteil an einem Unternehmen', 'Ein Kredit an den Staat', 'Eine Versicherung gegen Kursverluste'], correct: 0, explain: 'Eine Aktie ist ein Anteilsschein — du wirst Miteigentümer des Unternehmens.', lex: 'aktie' },
    { q: 'Was bedeutet "Diversifikation"?', options: ['Alles Geld in eine Aktie stecken', 'Geld auf mehrere Anlagen verteilen', 'Geld nur in bar halten'], correct: 1, explain: 'Streuung über mehrere Anlagen reduziert das Risiko einzelner Rückschläge.', lex: 'diversifikation' },
    { q: 'Was ist ein ETF?', options: ['Ein börsengehandelter Fonds, der einen Index nachbildet', 'Eine Kryptowährung', 'Ein Sparbuch der Bank'], correct: 0, explain: 'ETF = Exchange Traded Fund. Er bündelt viele Aktien in einem Produkt.', lex: 'etf' },
    { q: 'Was ist der DAX?', options: ['Eine deutsche Bank', 'Der wichtigste deutsche Aktienindex', 'Eine Steuer auf Aktiengewinne'], correct: 1, explain: 'Der DAX bildet die größten deutschen Unternehmen an der Börse ab.', lex: 'dax' },
    { q: 'Was passiert beim Zinseszins?', options: ['Das Geld bleibt immer gleich', 'Zinsen erwirtschaften wieder Zinsen', 'Das Geld verliert automatisch an Wert'], correct: 1, explain: 'Zinseszins lässt dein Vermögen umso stärker wachsen, je länger du investiert bleibst.', lex: 'zinseszins' },
    { q: 'Was ist eine Anleihe?', options: ['Ein Anteil an einem Unternehmen', 'Ein Kredit, den du einem Staat oder Unternehmen gibst', 'Ein Sparkonto mit Zinsgarantie der Bank'], correct: 1, explain: 'Mit einer Anleihe leihst du dem Herausgeber Geld und bekommst dafür meist feste Zinsen.', lex: 'anleihe' },
    { q: 'Was ist ein Sparplan?', options: ['Regelmäßig einen festen Betrag investieren', 'Einmalig das ganze Geld auf einmal anlegen', 'Ein Kredit, um Aktien zu kaufen'], correct: 0, explain: 'Beim Sparplan investierst du automatisch z. B. jeden Monat denselben Betrag.', lex: 'sparplan' },
    { q: 'Was bedeutet Inflation?', options: ['Die Aktienkurse fallen', 'Die Zinsen sinken auf null', 'Die Preise steigen allgemein, Geld verliert an Kaufkraft'], correct: 2, explain: 'Bei Inflation bekommst du für denselben Betrag mit der Zeit weniger.', lex: 'inflation' },
    { q: 'Was ist ein Depot?', options: ['Ein Konto, auf dem deine Wertpapiere verwahrt werden', 'Ein Tresor für Bargeld', 'Eine Versicherung für Aktien'], correct: 0, explain: 'Ohne Depot kannst du keine Aktien oder ETFs kaufen — es ist quasi das Girokonto für Wertpapiere.', lex: 'depot' },
    { q: 'Was ist eine Rendite?', options: ['Die Gebühr beim Kauf einer Aktie', 'Der Ertrag einer Geldanlage, meist in Prozent pro Jahr', 'Die Anzahl der gekauften Aktien'], correct: 1, explain: 'Rendite = Kursgewinne plus Zinsen oder Dividenden, bezogen auf das eingesetzte Geld.', lex: 'rendite' },
    { q: 'Was beschreibt ein "Bullenmarkt"?', options: ['Eine Phase mit überwiegend steigenden Kursen', 'Eine Phase mit überwiegend fallenden Kursen', 'Einen Markt für Agrarprodukte'], correct: 0, explain: 'Der Bulle stößt mit den Hörnern von unten nach oben — die Kurse steigen.', lex: 'bullenmarkt' },
    { q: 'Was ist ein Aktienindex?', options: ['Eine Liste der Verlierer des Tages', 'Die Steuernummer einer Aktie', 'Eine Kennzahl, die die Entwicklung mehrerer Aktien zusammenfasst'], correct: 2, explain: 'Ein Index wie der DAX zeigt auf einen Blick, wie sich eine Gruppe von Aktien entwickelt.', lex: 'index' },
    { q: 'Was ist Tagesgeld?', options: ['Eine Aktie, die nur einen Tag gehandelt wird', 'Ein verzinstes Konto, über das du täglich verfügen kannst', 'Der Tageslohn an der Börse'], correct: 1, explain: 'Tagesgeld eignet sich gut für den Notgroschen: jederzeit verfügbar, in der EU bis 100.000 € gesetzlich abgesichert.', lex: 'tagesgeld' },
    { q: 'Warum schwanken Aktienkurse?', options: ['Weil sich Angebot und Nachfrage ständig ändern', 'Weil die Börse die Kurse auslost', 'Weil der Staat die Kurse täglich festlegt'], correct: 0, explain: 'Wollen mehr Menschen kaufen als verkaufen, steigt der Kurs — und umgekehrt.', lex: 'boerse' },
    { q: 'Was ist der MSCI World?', options: ['Die Weltbank', 'Ein Aktienindex mit Unternehmen aus vielen Industrieländern', 'Eine internationale Kryptobörse'], correct: 1, explain: 'Der MSCI World enthält rund 1.400 Unternehmen aus 23 Industrieländern und ist bei ETF-Sparplänen sehr beliebt.', lex: 'msci-world' },
    { q: 'Was ist eine Order?', options: ['Eine Dividendenzahlung', 'Ein Kauf- oder Verkaufsauftrag für ein Wertpapier', 'Ein Aktienindex'], correct: 1, explain: 'Mit einer Order sagst du deinem Broker, was er zu welchen Bedingungen kaufen oder verkaufen soll.', lex: 'order' },
    { q: 'Was macht ein Broker?', options: ['Er führt deine Kauf- und Verkaufsaufträge für Wertpapiere aus', 'Er berechnet den DAX', 'Er zieht die Steuern auf Aktien ein und legt sie fest'], correct: 0, explain: 'Über einen Broker (z. B. eine Bank oder eine App) handelst du an der Börse.', lex: 'broker' },
    { q: 'Was ist ein Fonds?', options: ['Eine einzelne Aktie', 'Ein Kreditvertrag mit der Bank', 'Ein Topf, in dem das Geld vieler Anleger gemeinsam angelegt wird'], correct: 2, explain: 'Ein Fonds bündelt das Geld vieler Anleger und verteilt es auf viele Wertpapiere.', lex: 'fonds' },
    { q: 'Welche dieser Anlagen schwankt im Wert typischerweise am wenigsten?', options: ['Tagesgeld', 'Die Aktie eines jungen Tech-Start-ups', 'Eine Kryptowährung'], correct: 0, explain: 'Tagesgeld hat keinen Kurs, der schwankt — dafür sind auch die Renditechancen geringer.', lex: 'tagesgeld' },
    { q: 'Was ist ein Notgroschen?', options: ['Eine seltene Sammlermünze', 'Eine Geldreserve für unerwartete Ausgaben, die schnell verfügbar ist', 'Ein besonders günstiger ETF'], correct: 1, explain: 'Als Faustregel gelten oft drei bis sechs Monatsausgaben — bevor man an der Börse investiert.', lex: 'tagesgeld' },
  ],
  mittel: [
    { q: 'Was ist Volatilität?', options: ['Die Dividendenhöhe', 'Das Ausmaß der Kursschwankungen', 'Die Anzahl der Aktionäre'], correct: 1, explain: 'Volatilität beschreibt, wie stark ein Kurs schwankt.', lex: 'volatilitaet' },
    { q: 'Was ist eine Dividende?', options: ['Eine Gewinnbeteiligung für Aktionäre', 'Eine Strafe für den Verkauf', 'Der Kaufpreis einer Aktie'], correct: 0, explain: 'Unternehmen schütten damit einen Teil ihres Gewinns an Aktionäre aus.', lex: 'dividende' },
    { q: 'Was bedeutet "Bärenmarkt"?', options: ['Ein Markt mit steigenden Kursen', 'Ein Markt mit fallenden Kursen über längere Zeit', 'Ein Markt nur für Rohstoffe'], correct: 1, explain: 'Ein Bärenmarkt beschreibt eine anhaltende Abwärtsphase.', lex: 'baerenmarkt' },
    { q: 'Warum hilft ein langer Anlagehorizont?', options: ['Kurzfristige Schwankungen gleichen sich eher aus', 'Man zahlt automatisch weniger Steuern', 'Aktien werden mit der Zeit garantiert günstiger'], correct: 0, explain: 'Je länger der Zeitraum, desto eher gleichen sich kurzfristige Ausschläge aus.', lex: 'zinseszins' },
    { q: 'Was unterscheidet Sparen von Investieren?', options: ['Kein Unterschied', 'Sparen ist risikoarm, Investieren trägt Risiko für höhere Renditechancen', 'Investieren ist immer sicherer'], correct: 1, explain: 'Investieren bedeutet, für die Chance auf höhere Rendite Risiko einzugehen.', lex: 'rendite' },
    { q: 'Was ist der Leitzins?', options: ['Der Zins auf deinem Girokonto', 'Der Zins, zu dem sich Geschäftsbanken bei der Zentralbank Geld leihen können', 'Die Dividende der Zentralbank'], correct: 1, explain: 'Über den Leitzins steuert die Zentralbank, wie teuer Geld in der Wirtschaft ist.', lex: 'leitzins' },
    { q: 'Wer legt die Leitzinsen im Euroraum fest?', options: ['Die Bundesregierung', 'Die Deutsche Börse', 'Die Europäische Zentralbank (EZB)'], correct: 2, explain: 'Der EZB-Rat entscheidet etwa alle sechs Wochen über die Leitzinsen im Euroraum.', lex: 'ezb' },
    { q: 'Was misst das Bruttoinlandsprodukt (BIP)?', options: ['Den Wert aller in einem Land erzeugten Waren und Dienstleistungen', 'Die Staatsschulden eines Landes', 'Den Stand des DAX'], correct: 0, explain: 'Das BIP ist das wichtigste Maß für die Wirtschaftsleistung eines Landes.', lex: 'bip' },
    { q: 'Was gibt die TER eines ETFs an?', options: ['Die Rendite im letzten Jahr', 'Die laufenden jährlichen Kosten in Prozent', 'Die Anzahl der Aktien im ETF'], correct: 1, explain: 'TER = Total Expense Ratio. Sie wird automatisch aus dem Fondsvermögen entnommen.', lex: 'ter' },
    { q: 'Was macht ein thesaurierender ETF mit den Dividenden?', options: ['Er legt sie automatisch wieder an', 'Er zahlt sie an dich aus', 'Er gibt sie an den Staat ab'], correct: 0, explain: 'Thesaurierend = wiederanlegend. Ein ausschüttender ETF zahlt die Erträge dagegen aus.', lex: 'thesaurierend' },
    { q: 'Was ist die Marktkapitalisierung?', options: ['Der Jahresumsatz eines Unternehmens', 'Der Börsenwert: Aktienkurs × Anzahl aller Aktien', 'Das Bargeld auf dem Firmenkonto'], correct: 1, explain: 'Sie zeigt, wie viel ein Unternehmen an der Börse insgesamt wert ist.', lex: 'marktkapitalisierung' },
    { q: 'Was beschreibt der Cost-Average-Effekt beim Sparplan?', options: ['Man zahlt keine Gebühren', 'Man erhält garantiert eine höhere Rendite', 'Mit festem Betrag kauft man bei niedrigen Kursen mehr und bei hohen weniger Anteile'], correct: 2, explain: 'Das glättet den durchschnittlichen Einstiegspreis — eine Renditegarantie ist es aber nicht.', lex: 'cost-average' },
    { q: 'Was passiert meist mit den Kursen bestehender Anleihen, wenn die Marktzinsen steigen?', options: ['Sie fallen', 'Sie steigen', 'Sie bleiben immer gleich'], correct: 0, explain: 'Neue Anleihen bieten dann höhere Zinsen — ältere mit niedrigerem Zins werden weniger attraktiv.', lex: 'anleihe' },
    { q: 'Was ist eine Limit-Order?', options: ['Ein Auftrag, der sofort zu jedem Preis ausgeführt wird', 'Ein Auftrag, der nur zu deinem Wunschpreis oder besser ausgeführt wird', 'Eine Obergrenze, wie viele Aktien man besitzen darf'], correct: 1, explain: 'So schützt du dich davor, in hektischen Phasen zu einem schlechten Kurs zu kaufen oder zu verkaufen.', lex: 'order' },
    { q: 'Wie hoch ist der Sparerpauschbetrag in Deutschland pro Person und Jahr (seit 2023)?', options: ['801 €', '1.000 €', '10.000 €'], correct: 1, explain: 'Kapitalerträge bis 1.000 € (Ehepaare 2.000 €) bleiben steuerfrei — per Freistellungsauftrag bei der Bank.', lex: 'sparerpauschbetrag' },
    { q: 'Was ist die "Realrendite"?', options: ['Die Rendite in US-Dollar', 'Die Rendite vor Steuern', 'Die Rendite nach Abzug der Inflation'], correct: 2, explain: '5 % Rendite bei 3 % Inflation ergeben ungefähr 2 % echten Kaufkraftzuwachs.', lex: 'inflation' },
    { q: 'Was ist der Spread beim Wertpapierhandel?', options: ['Der Unterschied zwischen Kauf- und Verkaufskurs', 'Die Höhe der Dividende', 'Das Kursziel von Analysten'], correct: 0, explain: 'Wer sofort kauft und wieder verkauft, verliert genau diesen Unterschied.', lex: 'spread' },
    { q: 'Was passiert auf der Hauptversammlung einer Aktiengesellschaft?', options: ['Die Börse legt den Aktienkurs fest', 'Die Aktionäre stimmen z. B. über die Verwendung des Gewinns ab', 'Die EZB entscheidet über die Zinsen'], correct: 1, explain: 'Auf der Hauptversammlung wird unter anderem über die Dividende abgestimmt.', lex: 'dividende' },
    { q: 'Was ist ein Schwellenland (Emerging Market)?', options: ['Ein Land mit wachsender Wirtschaft auf dem Weg zum Industrieland', 'Ein Land ohne eigene Börse', 'Ein Land, das keine Steuern erhebt'], correct: 0, explain: 'Beispiele sind Indien oder Brasilien. Im MSCI World sind Schwellenländer nicht enthalten.', lex: 'msci-world' },
    { q: 'Wie viele Unternehmen enthält der DAX seit 2021?', options: ['30', '40', '100'], correct: 1, explain: 'Im September 2021 wurde der DAX von 30 auf 40 Unternehmen erweitert.', lex: 'dax' },
  ],
  schwer: [
    { q: 'Was misst die Sharpe Ratio?', options: ['Rendite im Verhältnis zum eingegangenen Risiko', 'Die Dividendenrendite', 'Die Marktkapitalisierung'], correct: 0, explain: 'Die Sharpe Ratio zeigt, wie viel Rendite pro Risikoeinheit erzielt wurde.', lex: 'volatilitaet' },
    { q: 'Was ist ein Rebalancing?', options: ['Das Zurücksetzen des Depots auf die Ursprungsgewichtung', 'Der Verkauf aller Positionen', 'Eine Steuerstrategie'], correct: 0, explain: 'Rebalancing stellt die ursprünglich geplante Aufteilung des Depots wieder her.', lex: 'rebalancing' },
    { q: 'Was zeigt das Kurs-Gewinn-Verhältnis (KGV)?', options: ['Verhältnis von Aktienkurs zu Gewinn je Aktie', 'Verhältnis von Umsatz zu Mitarbeitern', 'Verhältnis von Dividende zu Kurs'], correct: 0, explain: 'Das KGV setzt den Aktienkurs ins Verhältnis zum Gewinn je Aktie.', lex: 'kgv' },
    { q: 'Was ist ein "Blue Chip"?', options: ['Eine besonders volatile Kleinstaktie', 'Eine etablierte, finanzstarke Standardaktie', 'Ein spezieller Anleihe-Typ'], correct: 1, explain: 'Blue Chips sind große, etablierte Unternehmen mit stabiler Marktstellung.', lex: 'blue-chip' },
    { q: 'Was besagt die Effizienzmarkthypothese?', options: ['Märkte reagieren nie auf neue Informationen', 'Alle verfügbaren Informationen spiegeln sich bereits im Kurs wider', 'Nur institutionelle Anleger können den Markt schlagen'], correct: 1, explain: 'Sie besagt, dass Kurse verfügbare Informationen bereits einpreisen.' },
    { q: 'Wie funktioniert ein Leerverkauf (Short)?', options: ['Man hält eine Aktie kürzer als einen Tag', 'Man verkauft geliehene Aktien und hofft, sie später günstiger zurückzukaufen', 'Man kauft nur Bruchteile einer Aktie'], correct: 1, explain: 'Wer short geht, setzt auf fallende Kurse — steigt der Kurs, ist der Verlust theoretisch unbegrenzt.', lex: 'leerverkauf' },
    { q: 'Was ist eine Stop-Loss-Order?', options: ['Ein Verkaufsauftrag, der ausgelöst wird, wenn der Kurs eine festgelegte Marke unterschreitet', 'Ein Kaufauftrag unter dem aktuellen Kurs', 'Ein Handelsstopp der Börse'], correct: 0, explain: 'Sie soll Verluste begrenzen. Bei Kurslücken kann der Verkauf aber deutlich unter der Marke erfolgen.', lex: 'order' },
    { q: 'Was beschreibt die Tracking Difference eines ETFs?', options: ['Den Unterschied zwischen Kauf- und Verkaufskurs', 'Die Anzahl der Indexmitglieder', 'Die Abweichung der ETF-Rendite von der Rendite des Index'], correct: 2, explain: 'Sie zeigt, wie gut ein ETF seinen Index inklusive aller Kosten tatsächlich abbildet.', lex: 'ter' },
    { q: 'Was sagt ein Beta von 1,5 über eine Aktie aus?', options: ['Sie schwankt im Schnitt etwa 1,5-mal so stark wie der Gesamtmarkt', 'Sie zahlt 1,5 % Dividende', 'Sie ist 1,5-mal so viel wert wie ihr Buchwert'], correct: 0, explain: 'Das Beta misst, wie stark eine Aktie im Vergleich zum Markt reagiert.', lex: 'volatilitaet' },
    { q: 'Was misst die Duration einer Anleihe?', options: ['Die Höhe des Kupons', 'Wie empfindlich der Anleihekurs auf Zinsänderungen reagiert', 'Die Bonität des Herausgebers'], correct: 1, explain: 'Je höher die Duration, desto stärker fällt der Kurs, wenn die Zinsen steigen.', lex: 'anleihe' },
    { q: 'Was bedeutet eine inverse Zinsstrukturkurve?', options: ['Alle Zinsen sind negativ', 'Langfristige Zinsen sind höher als kurzfristige', 'Kurzfristige Zinsen sind höher als langfristige'], correct: 2, explain: 'Das ist ungewöhnlich und ging in der Vergangenheit oft Rezessionen voraus — ein sicheres Signal ist es aber nicht.', lex: 'leitzins' },
    { q: 'Was ist Quantitative Easing (QE)?', options: ['Eine Steuersenkung für Unternehmen', 'Die Zentralbank kauft in großem Umfang Wertpapiere, um die Geldpolitik zu lockern', 'Eine Regel für den Hochfrequenzhandel'], correct: 1, explain: 'Durch die Käufe sinken die langfristigen Zinsen — ein Werkzeug, wenn die Leitzinsen schon sehr niedrig sind.', lex: 'leitzins' },
    { q: 'Was setzt das Kurs-Buchwert-Verhältnis (KBV) ins Verhältnis?', options: ['Börsenwert und bilanzielles Eigenkapital', 'Kurs und Umsatz', 'Kurs und Dividende'], correct: 0, explain: 'Ein KBV unter 1 heißt: Die Börse bewertet das Unternehmen niedriger als sein Eigenkapital in der Bilanz.', lex: 'kgv' },
    { q: 'Was bewirkt ein Hebel von 5 bei einem Hebelprodukt?', options: ['Gewinne werden verfünffacht, Verluste bleiben begrenzt', 'Die Dividende wird verfünffacht', 'Kursbewegungen des Basiswerts wirken etwa fünffach — in beide Richtungen'], correct: 2, explain: '2 % Minus beim Basiswert werden so zu etwa 10 % Minus — Totalverluste sind möglich.', lex: 'hebel' },
    { q: 'Was ist der Survivorship Bias?', options: ['Eine Verzerrung, weil gescheiterte Fonds oder Firmen in der Statistik fehlen', 'Die Angst, Verluste zu realisieren', 'Das Nachahmen anderer Anleger'], correct: 0, explain: 'Wer nur die "Überlebenden" betrachtet, überschätzt die durchschnittliche Rendite.' },
    { q: 'Was bezeichnet "Verlustaversion"?', options: ['Ein gesetzliches Verbot von Verlustgeschäften', 'Verluste schmerzen stärker, als gleich hohe Gewinne freuen', 'Das komplette Meiden aller Risiken'], correct: 1, explain: 'Die Verhaltensökonomie zeigt: Deshalb halten viele Anleger Verlierer-Aktien zu lange.' },
    { q: 'Was ist die Vorabpauschale bei thesaurierenden Fonds in Deutschland?', options: ['Eine Gebühr beim Kauf', 'Eine Steuerrückerstattung', 'Ein fiktiver Mindestertrag, der versteuert wird, obwohl nichts ausgeschüttet wurde'], correct: 2, explain: 'Sie wird jährlich berechnet und mit dem Sparerpauschbetrag verrechnet; beim Verkauf wird sie angerechnet.', lex: 'thesaurierend' },
    { q: 'Was ist der Streubesitz ("Free Float") einer Aktie?', options: ['Der Anteil der Aktien, der frei an der Börse gehandelt wird', 'Aktien, die kostenlos verteilt werden', 'Die Schwankungsbreite des Kurses'], correct: 0, explain: 'Aktien großer Ankeraktionäre zählen nicht dazu. Viele Indizes gewichten nach dem Streubesitz.', lex: 'marktkapitalisierung' },
    { q: 'Was bezeichnet der "Maximum Drawdown"?', options: ['Die höchste Dividende', 'Den größten Rückgang vom Höchststand bis zum Tiefpunkt', 'Die maximale Ordergröße'], correct: 1, explain: 'Er zeigt, welchen Verlust man im schlimmsten Fall zwischenzeitlich aushalten musste.', lex: 'volatilitaet' },
    { q: 'Womit wird die Volatilität in der Finanzwelt meist gemessen?', options: ['Mit der Durchschnittsrendite', 'Mit der TER', 'Mit der Standardabweichung der Renditen'], correct: 2, explain: 'Je größer die Standardabweichung, desto stärker streuen die Renditen um ihren Mittelwert.', lex: 'volatilitaet' },
  ],
};
const QUIZ_ROUND_SIZE = 10;

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Zufällige Fragen, Antworten in zufälliger Reihenfolge — "correct" wird auf die neue Position umgerechnet.
function drawQuizQuestions(levelId) {
  return shuffled(QUIZ_DATA[levelId]).slice(0, QUIZ_ROUND_SIZE).map(question => {
    const order = shuffled(question.options.map((_, i) => i));
    return {
      ...question,
      options: order.map(i => question.options[i]),
      correct: order.indexOf(question.correct),
    };
  });
}

function loadLearnBest() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEARN_BEST_KEY));
    if (saved) return saved;
  } catch (e) {}
  return {};
}

let learnBest = loadLearnBest();
let quiz = null;

function resetLearnView() {
  document.getElementById('learnQuiz').classList.add('hidden');
  document.getElementById('learnResult').classList.add('hidden');
  document.getElementById('learnLevels').classList.remove('hidden');
  renderLevels();
}

function renderLevels() {
  const list = document.getElementById('learnLevelList');
  list.innerHTML = '';
  LEVELS.forEach(level => {
    const total = Math.min(QUIZ_ROUND_SIZE, QUIZ_DATA[level.id].length);
    const best = learnBest[level.id] || 0;
    const li = document.createElement('li');
    li.className = 'level-row';
    li.innerHTML = `
      <button class="menu-item level-btn" data-level="${level.id}">
        <span class="menu-icon">${level.icon}</span>
        <span class="menu-text">
          <span class="menu-label">${level.name}</span>
          <span class="menu-sub">${level.desc} · ${total} von ${QUIZ_DATA[level.id].length} Fragen · ${level.points} Punkte/Antwort</span>
        </span>
        <span class="menu-arrow">${best > 0 ? `🏆 ${best}` : '→'}</span>
      </button>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => startQuiz(btn.dataset.level));
  });
}

function startQuiz(levelId) {
  quiz = {
    levelId,
    questions: drawQuizQuestions(levelId),
    index: 0,
    score: 0,
    lives: QUIZ_START_LIVES,
    answered: false,
  };
  document.getElementById('learnLevels').classList.add('hidden');
  document.getElementById('learnResult').classList.add('hidden');
  document.getElementById('learnQuiz').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  const level = LEVELS.find(l => l.id === quiz.levelId);
  const question = quiz.questions[quiz.index];
  quiz.answered = false;

  document.getElementById('quizProgress').textContent = `${quiz.index + 1}/${quiz.questions.length}`;
  document.getElementById('quizScore').textContent = quiz.score;
  document.getElementById('quizLives').textContent = '❤️'.repeat(quiz.lives) + '🖤'.repeat(QUIZ_START_LIVES - quiz.lives);
  document.getElementById('quizProgressBar').style.width = (quiz.index / quiz.questions.length * 100) + '%';

  document.getElementById('quizQuestion').textContent = question.q;
  document.getElementById('quizExplanation').classList.add('hidden');
  document.getElementById('quizNext').classList.add('hidden');

  const answersEl = document.getElementById('quizAnswers');
  answersEl.innerHTML = '';
  question.options.forEach((option, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = option;
    btn.dataset.index = i;
    btn.addEventListener('click', () => selectAnswer(i));
    li.appendChild(btn);
    answersEl.appendChild(li);
  });
}

function selectAnswer(i) {
  if (quiz.answered) return;
  quiz.answered = true;

  const level = LEVELS.find(l => l.id === quiz.levelId);
  const question = quiz.questions[quiz.index];
  const correct = i === question.correct;

  document.querySelectorAll('#quizAnswers .answer-btn').forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === question.correct) btn.classList.add('correct');
    else if (idx === i) btn.classList.add('wrong');
  });

  if (correct) {
    quiz.score += level.points;
    burstConfetti();
  } else {
    quiz.lives--;
  }

  document.getElementById('quizScore').textContent = quiz.score;
  bump(document.getElementById('quizScore'));
  document.getElementById('quizLives').textContent = '❤️'.repeat(Math.max(quiz.lives, 0)) + '🖤'.repeat(QUIZ_START_LIVES - Math.max(quiz.lives, 0));

  const explanationEl = document.getElementById('quizExplanation');
  explanationEl.textContent = (correct ? '✅ Richtig! ' : '❌ Leider falsch. ') + question.explain;
  if (question.lex) {
    const lexBtn = document.createElement('button');
    lexBtn.className = 'link-btn quiz-lex-link';
    lexBtn.dataset.lex = question.lex;
    lexBtn.textContent = '📖 Mehr dazu im Lexikon';
    explanationEl.append(' ', lexBtn);
  }
  explanationEl.classList.remove('hidden');
  explanationEl.classList.add(correct ? 'correct' : 'wrong');

  const nextBtn = document.getElementById('quizNext');
  const isLastQuestion = quiz.index >= quiz.questions.length - 1;
  const isGameOver = quiz.lives <= 0;
  nextBtn.textContent = (isLastQuestion || isGameOver) ? 'Ergebnis ansehen →' : 'Weiter →';
  nextBtn.classList.remove('hidden');
}

document.getElementById('quizNext').addEventListener('click', () => {
  const isLastQuestion = quiz.index >= quiz.questions.length - 1;
  const isGameOver = quiz.lives <= 0;
  if (isLastQuestion || isGameOver) {
    finishQuiz();
  } else {
    quiz.index++;
    document.getElementById('quizExplanation').classList.remove('correct', 'wrong');
    renderQuestion();
  }
});

function finishQuiz() {
  const level = LEVELS.find(l => l.id === quiz.levelId);
  const total = quiz.questions.length;
  const maxScore = total * level.points;
  const gameOver = quiz.lives <= 0;
  const perfect = quiz.score === maxScore;

  if (!learnBest[quiz.levelId] || quiz.score > learnBest[quiz.levelId]) {
    learnBest[quiz.levelId] = quiz.score;
    localStorage.setItem(LEARN_BEST_KEY, JSON.stringify(learnBest));
  }

  document.getElementById('learnQuiz').classList.add('hidden');
  document.getElementById('learnResult').classList.remove('hidden');

  document.getElementById('resultEmoji').textContent = gameOver ? '💔' : perfect ? '🏆' : '🎉';
  document.getElementById('resultTitle').textContent = gameOver ? 'Game Over' : perfect ? 'Perfekt!' : 'Geschafft!';
  document.getElementById('resultSummary').textContent =
    `${quiz.score} von ${maxScore} Punkten · Level "${level.name}"` +
    (gameOver ? ' — keine Leben mehr übrig. Versuch es nochmal!' : perfect ? ' — alle Fragen richtig beantwortet!' : '.');

  if (perfect) burstConfetti();
}

document.getElementById('resultRetry').addEventListener('click', () => startQuiz(quiz.levelId));
document.getElementById('resultBack').addEventListener('click', resetLearnView);

// --- Sparplan-Rechner ---

const SP_INFLATION = 0.02;
const SP_MILESTONE_STEP = 5;

const spEls = {
  rate: document.getElementById('spRate'),
  start: document.getElementById('spStart'),
  years: document.getElementById('spYears'),
  ret: document.getElementById('spReturn'),
  inflation: document.getElementById('spInflation'),
  rateOut: document.getElementById('spRateOut'),
  startOut: document.getElementById('spStartOut'),
  yearsOut: document.getElementById('spYearsOut'),
  retOut: document.getElementById('spReturnOut'),
  label: document.getElementById('spResultLabel'),
  final: document.getElementById('spFinal'),
  multiple: document.getElementById('spMultiple'),
  paid: document.getElementById('spPaid'),
  gain: document.getElementById('spGain'),
  milestones: document.getElementById('spMilestones'),
};
const spCtx = document.getElementById('spChart').getContext('2d');

function formatEuroRound(n) {
  return Math.round(n).toLocaleString('de-DE') + ' €';
}

// Monatliche Einzahlung zu Monatsbeginn, monatliche Verzinsung mit dem zum Jahreszins passenden Monatszins.
// Mit Inflation wird der Wert in heutige Kaufkraft umgerechnet; die Einzahlungen bleiben nominal (so viel zahlst du ja tatsächlich ein).
function computeSparplan(rate, start, years, annualReturn, inflation) {
  const monthly = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let value = start;
  let paid = start;
  const points = [{ month: 0, value, paid }];
  for (let m = 1; m <= years * 12; m++) {
    value = (value + rate) * (1 + monthly);
    paid += rate;
    const real = inflation ? value / Math.pow(1 + SP_INFLATION, m / 12) : value;
    points.push({ month: m, value: real, paid });
  }
  return points;
}

function drawSparplanChart(points) {
  const c = spCtx;
  const W = c.canvas.width;
  const H = c.canvas.height;
  const padL = 12, padR = 12, padT = 40, padB = 40;
  c.clearRect(0, 0, W, H);

  const maxY = Math.max(...points.map(p => Math.max(p.value, p.paid))) * 1.05 || 1;
  const last = points[points.length - 1].month || 1;
  const toX = m => padL + (m / last) * (W - padL - padR);
  const toY = v => H - padB - (v / maxY) * (H - padT - padB);

  function area(key, fill, stroke) {
    const grad = c.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, fill);
    grad.addColorStop(1, fill.replace(/[\d.]+\)$/, '0.02)'));
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(toX(p.month), toY(p[key])) : c.moveTo(toX(p.month), toY(p[key]))));
    c.lineTo(toX(last), H - padB);
    c.lineTo(toX(0), H - padB);
    c.closePath();
    c.fillStyle = grad;
    c.fill();
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(toX(p.month), toY(p[key])) : c.moveTo(toX(p.month), toY(p[key]))));
    c.lineWidth = 3;
    c.strokeStyle = stroke;
    c.shadowColor = stroke;
    c.shadowBlur = 8;
    c.stroke();
    c.shadowBlur = 0;
  }

  area('value', 'rgba(52, 211, 153, 0.35)', '#34d399');
  area('paid', 'rgba(96, 165, 250, 0.35)', '#60a5fa');

  c.fillStyle = '#8d94ac';
  c.font = '600 22px Outfit, sans-serif';
  c.textBaseline = 'alphabetic';
  const years = last / 12;
  const step = years > 20 ? 10 : years > 8 ? 5 : years > 3 ? 2 : 1;
  for (let y = 0; y <= years; y += step) {
    const x = toX(y * 12);
    c.textAlign = y === 0 ? 'left' : x > W - 60 ? 'right' : 'center';
    c.fillText(y === 0 ? 'heute' : `${y} J.`, x, H - 10);
  }
  c.textAlign = 'left';
  c.fillText(formatEuroRound(maxY / 1.05), padL, 26);
}

function renderSparplan() {
  const rate = Number(spEls.rate.value);
  const start = Number(spEls.start.value);
  const years = Number(spEls.years.value);
  const ret = Number(spEls.ret.value) / 100;
  const inflation = spEls.inflation.checked;

  spEls.rateOut.textContent = formatEuroRound(rate);
  spEls.startOut.textContent = formatEuroRound(start);
  spEls.yearsOut.textContent = years === 1 ? '1 Jahr' : `${years} Jahre`;
  spEls.retOut.textContent = `${(ret * 100).toLocaleString('de-DE')} %`;

  const points = computeSparplan(rate, start, years, ret, inflation);
  const end = points[points.length - 1];
  const gain = end.value - end.paid;
  const gainPct = end.paid > 0 ? (gain / end.paid) * 100 : 0;

  spEls.label.textContent = `Nach ${years === 1 ? 'einem Jahr' : `${years} Jahren`} hättest du etwa${inflation ? ' (in heutiger Kaufkraft)' : ''}`;
  spEls.final.textContent = formatEuroRound(end.value);
  spEls.multiple.textContent = `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(0)} % gegenüber deinen Einzahlungen`;
  spEls.multiple.style.color = gain > 0 ? 'var(--green)' : gain < 0 ? 'var(--red)' : '';
  spEls.paid.textContent = formatEuroRound(end.paid);
  spEls.gain.textContent = (gain >= 0 ? '+' : '') + formatEuroRound(gain);

  spEls.milestones.innerHTML = '';
  const marks = [];
  for (let y = SP_MILESTONE_STEP; y < years; y += SP_MILESTONE_STEP) marks.push(y);
  marks.push(years);
  marks.forEach(y => {
    const p = points[y * 12];
    const li = document.createElement('li');
    li.innerHTML = `<span class="sp-ms-year">${y === 1 ? '1 Jahr' : `${y} Jahre`}</span>
      <span class="sp-ms-value">${formatEuroRound(p.value)}</span>
      <span class="sp-ms-paid">eingezahlt ${formatEuroRound(p.paid)}</span>`;
    spEls.milestones.appendChild(li);
  });

  drawSparplanChart(points);
}

[spEls.rate, spEls.start, spEls.years, spEls.ret].forEach(el => el.addEventListener('input', renderSparplan));
spEls.inflation.addEventListener('change', renderSparplan);

// --- Lexikon ---

const lexEntries = [...document.querySelectorAll('.lex-entry')];
const lexSearch = document.getElementById('lexSearch');
const lexEmpty = document.getElementById('lexEmpty');

function filterLexikon() {
  const q = lexSearch.value.trim().toLowerCase();
  let shown = 0;
  lexEntries.forEach(entry => {
    const hit = !q || entry.textContent.toLowerCase().includes(q);
    entry.classList.toggle('hidden', !hit);
    if (hit) shown++;
  });
  lexEmpty.classList.toggle('hidden', shown > 0);
}

function resetLexikon() {
  lexSearch.value = '';
  filterLexikon();
}

// Öffnet einen Eintrag; "Zurück" führt danach in die Ansicht, aus der man kam (z. B. mitten ins Quiz).
function openLexikon(id) {
  const entry = document.getElementById('lex-' + id);
  if (!entry) return;
  const current = [...views].find(v => !v.classList.contains('hidden'));
  const returnTo = current ? (current.id === 'lexikon-view' ? lexReturnView : current.id) : null;
  if (!current || current.id !== 'lexikon-view') openView('lexikon-view');
  else resetLexikon();
  lexReturnView = returnTo;
  entry.classList.remove('lex-highlight');
  void entry.offsetWidth;
  entry.classList.add('lex-highlight');
  entry.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

lexSearch.addEventListener('input', filterLexikon);

// Schlagwort-Treffer wie in scripts/update_news.py: Teilstring, ein "$" am Ende verlangt ein ganzes Wort.
// Als Funktion (hoisted) statt Konstante, weil renderNews() schon weiter oben in der Datei läuft.
function lexMatchers() {
  lexMatchers.cache = lexMatchers.cache || [...document.querySelectorAll('.lex-entry')]
  .map(entry => ({
    id: entry.id.replace(/^lex-/, ''),
    title: entry.querySelector('h3').textContent,
    patterns: (entry.dataset.match || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean),
  }))
  .filter(m => m.patterns.length);
  return lexMatchers.cache;
}

function lexTermsFor(text) {
  const lower = text.toLowerCase();
  return lexMatchers().filter(m => m.patterns.some(p => {
    if (!p.endsWith('$')) return lower.includes(p);
    const word = p.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${word}($|[^\\p{L}\\p{N}])`, 'u').test(lower);
  }));
}

// Direktlinks wie https://boersen-ratespiel.github.io/#challenge öffnen gleich die passende Ansicht.
const initialView = [...views].find(v => v.dataset.hash && '#' + v.dataset.hash === location.hash);
if (initialView) openView(initialView.id);

// --- PWA: Service Worker ---

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
