// Tilgungsplan-Rechnung für Darlehen (Monatsraster). Reine Funktionen, keine Abhängigkeit zur Oberfläche.
// Darlehen: { amount, rate, method:'annuitaet'|'rate', repay, start:'YYYY-MM', freeYears, fixYears, followRate,
//   payouts:[{ym,amount}], commitRate, commitFree, specialYearly, specialMax, specialMonth, specials:[{ym,amount}] }
const ymIndex = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };
const ymOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const nowYm = () => { const d = new Date(); return ymOf(d.getFullYear() * 12 + d.getMonth()); };
export const fmtYm = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y}`; };

export function simulate(L, { specials = true } = {}) {
  const A = Number(L.amount) || 0, rows = [];
  if (!(A > 0) || !/^\d{4}-\d{2}$/.test(L.start || '')) return { rows, interest: 0, months: 0, endYm: null, payment: 0, fixBalance: null };
  const t0 = ymIndex(L.start);
  const pay = (L.payouts || []).filter((p) => /^\d{4}-\d{2}$/.test(p.ym) && p.amount > 0).map((p) => ({ i: ymIndex(p.ym) - t0, a: Number(p.amount) }));
  const drawdown = pay.length > 0;
  if (!drawdown) pay.push({ i: 0, a: A });
  const planned = pay.reduce((s, p) => s + p.a, 0), total = Math.min(A, planned) || A;
  const free = Math.round((Number(L.freeYears) || 0) * 12), fix = Math.round((Number(L.fixYears) || 0) * 12);
  const r0 = (Number(L.rate) || 0) / 100, r1 = L.followRate !== '' && L.followRate != null && Number(L.followRate) >= 0 ? Number(L.followRate) / 100 : r0;
  const t = (Number(L.repay) || 0) / 100;
  const P = L.method === 'rate' ? 0 : A * (r0 + t) / 12;          // feste Annuität (bleibt auch nach Zinsbindung gleich)
  const Pm = L.method === 'rate' ? A * t / 12 : 0;                // feste Tilgung bei Ratentilgung
  const commitFree = Number(L.commitFree ?? 12), commitRate = (Number(L.commitRate) || 0) / 100;
  const sp = (L.specials || []).filter((x) => /^\d{4}-\d{2}$/.test(x.ym) && x.amount > 0).map((x) => ({ i: ymIndex(x.ym) - t0, a: Number(x.amount) }));
  const smonth = Number(L.specialMonth) || 12, smax = Number(L.specialMax) > 0 ? Number(L.specialMax) : Infinity, syear = Number(L.specialYearly) || 0;
  let b = 0, drawn = 0, interestSum = 0, fixBalance = null, spentThisYear = {};
  for (let m = 0; m < 12 * 60; m++) {
    for (const p of pay) if (p.i === m) { b += p.a; drawn += p.a; }
    const yr = fix > 0 && m >= fix ? r1 : r0;
    const interest = b * yr / 12;
    const fee = drawdown && m >= commitFree && drawn < total - 0.005 ? (total - drawn) * commitRate / 12 : 0;
    const fullyDrawn = drawn >= total - 0.005;
    let principal = 0;
    if (m >= free && fullyDrawn) principal = Math.min(b, L.method === 'rate' ? Pm : Math.max(0, P - interest));
    let special = 0;
    if (specials && m >= free && fullyDrawn) {
      const date = ymOf(t0 + m), year = date.slice(0, 4);
      if (syear > 0 && Number(date.slice(5)) === smonth) special += Math.min(syear, smax);
      for (const x of sp) if (x.i === m) special += x.a;
      if (special > 0 && smax < Infinity) special = Math.min(special, Math.max(0, smax - (spentThisYear[year] || 0)));
      special = Math.min(special, b - principal);
      spentThisYear[year] = (spentThisYear[year] || 0) + special;
    }
    b = Math.max(0, b - principal - special);
    interestSum += interest + fee;
    rows.push({ ym: ymOf(t0 + m), interest, fee, principal, special, payment: interest + fee + principal, balance: b, rate: yr * 100 });
    if (fix > 0 && m === fix - 1) fixBalance = b;
    if (fullyDrawn && b <= 0.005 && m >= free) break;
  }
  const last = rows[rows.length - 1];
  const pm = rows.find((r) => r.principal > 0 || (r.ym && r.payment > 0 && r.interest > 0));
  return { rows, interest: interestSum, months: rows.length, endYm: b <= 0.005 ? last.ym : null, payment: (rows.find((r, i) => i >= free && r.principal > 0) || pm || { payment: 0 }).payment, fixBalance };
}

export function summarize(L) {
  const s = simulate(L), base = simulate(L, { specials: false });
  const now = nowYm();
  const row = s.rows.find((r) => r.ym === now);
  const before = s.rows.length && s.rows[0].ym > now;
  const nowBalance = before ? 0 : row ? row.balance : s.rows.length ? s.rows[s.rows.length - 1].balance : 0;
  const saved = (L.specialYearly > 0 || (L.specials || []).length) ? Math.max(0, base.interest - s.interest) : 0;
  const monthsSaved = Math.max(0, base.months - s.months);
  return { ...s, nowBalance, saved, monthsSaved, plan: s };
}

// Jahreswerte (Summe der Monate, Restschuld zum Jahresende) für eine Liste von Plänen
export function yearly(plans) {
  const ys = new Set();
  plans.forEach((p) => p.rows.forEach((r) => ys.add(r.ym.slice(0, 4))));
  const list = [...ys].sort();
  const out = list.map((year) => ({ year, interest: 0, principal: 0, special: 0, payment: 0, balance: 0 }));
  for (const p of plans) {
    const end = {};
    for (const r of p.rows) {
      const o = out.find((x) => x.year === r.ym.slice(0, 4));
      o.interest += r.interest + r.fee; o.principal += r.principal; o.special += r.special; o.payment += r.payment;
      end[r.ym.slice(0, 4)] = r.balance;
    }
    const lastY = p.rows.length ? p.rows[p.rows.length - 1].ym.slice(0, 4) : '';
    for (const o of out) if (o.year in end) o.balance += end[o.year]; else if (o.year < (p.rows[0]?.ym.slice(0, 4) || '')) o.balance += 0; else if (o.year > lastY) o.balance += 0;
  }
  return out;
}
