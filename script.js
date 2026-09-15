const menu = document.getElementById('menu');
document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    menu.classList.add('hidden');
    document.getElementById(btn.dataset.view).classList.remove('hidden');
  });
});
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.view').classList.add('hidden');
    menu.classList.remove('hidden');
  });
});

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

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

let round = 1;
let score = 0;
let streak = 0;
let best = Number(localStorage.getItem('boersenspiel_best') || 0);
bestEl.textContent = best;

let series = [];
let guessing = true;

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateSeries() {
  const total = HISTORY_POINTS + FUTURE_POINTS;
  const drift = (Math.random() - 0.45) * 0.006;
  const volatility = 0.012 + Math.random() * 0.022;
  const points = [100];
  for (let i = 1; i < total; i++) {
    const shock = gaussianRandom() * volatility;
    const next = points[i - 1] * (1 + drift + shock);
    points.push(Math.max(5, next));
  }
  return points;
}

function draw(visibleCount, opts = {}) {
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

  ctx.lineWidth = 2;

  ctx.strokeStyle = '#60a5fa';
  ctx.beginPath();
  for (let i = 0; i < historyEnd; i++) {
    const [x, y] = toXY(i, series[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (visibleCount > HISTORY_POINTS) {
    ctx.strokeStyle = opts.color || '#8b95ab';
    ctx.beginPath();
    for (let i = HISTORY_POINTS - 1; i < visibleCount; i++) {
      const [x, y] = toXY(i, series[i]);
      if (i === HISTORY_POINTS - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
  ctx.fillStyle = visibleCount > HISTORY_POINTS ? (opts.color || '#8b95ab') : '#60a5fa';
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fill();
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
  draw(HISTORY_POINTS);
}

function revealAndScore(guessUp) {
  guessing = false;
  btnUp.disabled = true;
  btnDown.disabled = true;

  const startPrice = series[HISTORY_POINTS - 1];
  const endPrice = series[series.length - 1];
  const actuallyUp = endPrice > startPrice;
  const pctChange = ((endPrice - startPrice) / startPrice) * 100;
  const correct = guessUp === actuallyUp;
  const revealColor = actuallyUp ? '#34d399' : '#fb7185';

  let frame = HISTORY_POINTS;
  const timer = setInterval(() => {
    frame++;
    draw(frame, { color: revealColor });
    if (frame >= series.length) {
      clearInterval(timer);
      showResult(correct, pctChange);
    }
  }, 40);
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

function showResult(correct, pctChange) {
  if (correct) {
    score++;
    streak++;
    if (streak > best) {
      best = streak;
      localStorage.setItem('boersenspiel_best', String(best));
    }
    burstConfetti();
  } else {
    streak = 0;
  }

  scoreEl.textContent = score;
  streakEl.textContent = streak;
  bestEl.textContent = best;
  [scoreEl, streakEl, bestEl].forEach(bump);

  const sign = pctChange >= 0 ? '+' : '';
  banner.textContent = `${correct ? '✅ Richtig!' : '❌ Falsch.'} ${sign}${pctChange.toFixed(1)}%`;
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

newRound();

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

    const li = document.createElement('li');
    li.className = 'stock-row';
    li.innerHTML = `
      <div class="stock-info">
        <span class="stock-name">${stock.name}</span>
        <span class="stock-price">${formatEuro(stock.price)} je Anteil</span>
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

document.getElementById('depotRefresh').addEventListener('click', () => {
  depot.stocks.forEach(stock => {
    const volatility = 0.03;
    const shock = gaussianRandom() * volatility;
    stock.price = Math.max(1, stock.price * (1 + shock));
  });
  saveDepot();
  renderDepot();
});

document.getElementById('depotReset').addEventListener('click', () => {
  if (!confirm('Depot wirklich zurücksetzen? Dein virtuelles Guthaben und alle Positionen gehen verloren.')) return;
  depot = {
    cash: DEPOT_START_CASH,
    stocks: DEPOT_STOCKS_DEFAULT.map(s => ({ ...s })),
    holdings: {},
  };
  saveDepot();
  renderDepot();
});

renderDepot();
