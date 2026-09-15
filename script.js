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

  ctx.strokeStyle = '#4d7cff';
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
  ctx.fillStyle = visibleCount > HISTORY_POINTS ? (opts.color || '#8b95ab') : '#4d7cff';
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
  const revealColor = actuallyUp ? '#2ecc71' : '#ff5c5c';

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

function showResult(correct, pctChange) {
  if (correct) {
    score++;
    streak++;
    if (streak > best) {
      best = streak;
      localStorage.setItem('boersenspiel_best', String(best));
    }
  } else {
    streak = 0;
  }

  scoreEl.textContent = score;
  streakEl.textContent = streak;
  bestEl.textContent = best;

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
