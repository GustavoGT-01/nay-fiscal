/** Periodos prontos dos filtros (todas, mes atual e os dois anteriores). Datas AAAA-MM-DD. */
function monthRange(offset: number) {
  const d = new Date();
  const a = new Date(d.getFullYear(), d.getMonth() - offset, 1);
  const b = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0);
  // data local do navegador, sem passar por UTC (toISOString voltaria um dia a noite em Brasilia)
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: f(a), to: f(b), label: a.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
}

export const PERIODS = [
  { key: 'all', label: 'Período: todas', from: '', to: '' },
  ...[0, 1, 2].map((o) => { const r = monthRange(o); return { key: 'm' + o, label: r.label.charAt(0).toUpperCase() + r.label.slice(1), from: r.from, to: r.to }; }),
];
