import { useEffect, useState } from 'react';
import { ANEXOS, simular, type Anexo } from '@nay/shared';
import { brl0 } from '../lib/api';
import { useSession } from '../lib/session';

const STEPS = ['Empresa', 'Faturamento', 'Alíquota efetiva', 'Clientes', 'Compras', 'Comparativo', 'Laudo'];
const pct = (v: number, d = 1) => (v * 100).toFixed(d).replace('.', ',') + '%';

interface State { step: number; nome: string; anexo: Anexo; fat: number; b2b: number; compras: number; ref: number; choice: 'puro' | 'hibrido' }

function Range({ id, label, min, max, step, value, fmt, hint, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; hint: string; onChange: (v: number) => void }) {
  return (
    <div className="range">
      <div className="range-top"><label htmlFor={id}>{label}</label><strong>{fmt(value)}</strong></div>
      <input type="range" id={id} min={min} max={max} step={step} value={value} style={{ ['--p' as string]: ((value - min) / (max - min)) * 100 + '%' }} onChange={(e) => onChange(+e.target.value)} />
      <p className="hint">{hint}</p>
    </div>
  );
}

export function Simulador() {
  const { client } = useSession();
  const [s, setS] = useState<State>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nay.sim') ?? 'null');
      if (saved) return saved;
    } catch { /* ignora */ }
    return { step: 1, nome: client?.name ?? '', anexo: 'II', fat: 230000, b2b: 40, compras: 90000, ref: 26.5, choice: 'hibrido' };
  });
  useEffect(() => { try { localStorage.setItem('nay.sim', JSON.stringify(s)); } catch { /* ignora */ } }, [s]);
  const set = (p: Partial<State>) => setS((x) => ({ ...x, ...p }));

  const r = simular({ anexo: s.anexo, faturamentoMensal: s.fat, vendasB2B: s.b2b / 100, comprasComCredito: s.compras, aliquotaReferencia: s.ref / 100 });
  const maxBal = Math.max(Math.abs(r.custoExtra), r.ganhoClientes, 1);

  let body: React.ReactNode;
  switch (s.step) {
    case 1:
      body = (
        <>
          <h2>Empresa</h2><p className="hint">Dados de quem será simulado.</p>
          <div className="form-grid">
            <div><label className="hint" htmlFor="sNome">Razão social</label><input className="tf" id="sNome" value={s.nome} onChange={(e) => set({ nome: e.target.value })} /></div>
            <div><label className="hint" htmlFor="sAnexo">Anexo do Simples</label>
              <select className="select" id="sAnexo" value={s.anexo} onChange={(e) => set({ anexo: e.target.value as Anexo })}>
                {ANEXOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
        </>
      );
      break;
    case 2:
      body = <><h2>Faturamento mensal</h2><Range id="sFat" label="Receita média" min={10000} max={400000} step={1000} value={s.fat} fmt={brl0} hint={`Média dos últimos 12 meses. Receita bruta anual (RBT12): ${brl0(r.rbt12)}.`} onChange={(v) => set({ fat: v })} /></>;
      break;
    case 3:
      body = (
        <>
          <h2>Alíquota efetiva</h2>
          <div className="range"><div className="range-top"><span>Alíquota do DAS</span><strong>{pct(r.efetiva, 2)}</strong></div></div>
          <div className="laudo" style={{ marginTop: 6 }}>
            <dl>
              <dt>Faixa</dt><dd>{r.faixa}ª faixa do {ANEXOS.find((a) => a.value === s.anexo)!.label}</dd>
              <dt>Alíquota nominal</dt><dd>{pct(r.nominal, 1)}</dd>
              <dt>Parcela a deduzir</dt><dd>{brl0(r.deduzir)}</dd>
              <dt>Cálculo</dt><dd className="mono">({brl0(r.rbt12)} × {pct(r.nominal)} − {brl0(r.deduzir)}) ÷ {brl0(r.rbt12)}</dd>
            </dl>
          </div>
          {r.acimaDoLimite && <p className="err-msg">A receita passa do limite de R$ 4,8 milhões do Simples Nacional.</p>}
          <p className="hint" style={{ marginTop: 12 }}>Calculada pela tabela do anexo (LC 123/2006). Ajuste o faturamento para ver outra faixa.</p>
        </>
      );
      break;
    case 4:
      body = <><h2>Clientes</h2><Range id="sB2b" label="Vendas para empresas do Lucro Real ou Presumido" min={0} max={100} step={1} value={s.b2b} fmt={(v) => v + '%'} hint="São esses clientes que aproveitam o crédito cheio de IBS/CBS no Híbrido." onChange={(v) => set({ b2b: v })} /></>;
      break;
    case 5:
      body = (
        <>
          <h2>Compras</h2>
          <Range id="sComp" label="Compras mensais com crédito" min={0} max={300000} step={1000} value={s.compras} fmt={brl0} hint="No Híbrido, o IBS/CBS pago nas compras vira crédito e reduz o imposto." onChange={(v) => set({ compras: v })} />
          <Range id="sRef" label="Alíquota de referência IBS + CBS" min={20} max={30} step={0.1} value={s.ref} fmt={(v) => v.toFixed(1).replace('.', ',') + '%'} hint="Estimativa da alíquota cheia após a transição. Ajuste quando os percentuais oficiais forem publicados." onChange={(v) => set({ ref: v })} />
        </>
      );
      break;
    case 6:
      body = (
        <>
          <h2>Comparativo</h2><p className="hint">Imposto mensal estimado em cada cenário. Toque em um para escolher.</p>
          <div className="duel">
            <button className="opt" aria-pressed={s.choice === 'puro'} onClick={() => set({ choice: 'puro' })}>
              {r.recomendado === 'puro' && <span className="tag ok badge">Recomendado</span>}
              <small>Simples Puro</small><strong className="num">{brl0(r.dasPuro)}</strong><small>imposto por mês</small>
            </button>
            <button className="opt" aria-pressed={s.choice === 'hibrido'} onClick={() => set({ choice: 'hibrido' })}>
              {r.recomendado === 'hibrido' && <span className="tag ok badge">Recomendado</span>}
              <small>Simples Híbrido</small><strong className="num">{brl0(r.custoHibrido)}</strong><small style={{ color: 'var(--limao)' }}>+ crédito cheio ao cliente</small>
            </button>
          </div>
          <div className="balance">
            <div className="bal-row"><span>{r.custoExtra >= 0 ? 'Custo extra do Híbrido' : 'Economia no Híbrido'}</span><span className="track"><span className="fill" style={{ display: 'block', width: (Math.abs(r.custoExtra) / maxBal) * 100 + '%', background: r.custoExtra >= 0 ? 'var(--caju)' : 'var(--limao)' }} /></span><b>{brl0(Math.abs(r.custoExtra))}</b></div>
            <div className="bal-row"><span>Crédito a mais para os clientes</span><span className="track"><span className="fill" style={{ display: 'block', width: (Math.max(0, r.ganhoClientes) / maxBal) * 100 + '%', background: 'var(--limao)' }} /></span><b>{brl0(r.ganhoClientes)}</b></div>
          </div>
          <div className="verdict">
            {r.custoExtra >= 0 ? <>O Híbrido custa <b>{brl0(r.custoExtra)}</b> a mais por mês</> : <>O Híbrido economiza <b>{brl0(-r.custoExtra)}</b> por mês</>}
            , e seus clientes do regime regular passam a aproveitar <b>{brl0(r.ganhoClientes)}</b> a mais de crédito.{' '}
            {r.ganhoClientes > Math.max(0, r.custoExtra) * 1.5 ? 'Isso tende a tornar seu preço mais competitivo.' : 'A vantagem é pequena; considere o perfil dos clientes antes de decidir.'}
          </div>
        </>
      );
      break;
    default:
      body = (
        <>
          <h2>Laudo</h2><p className="hint">Resumo pronto para enviar ao cliente.</p>
          <div className="laudo">
            <h3>{s.nome || 'Empresa simulada'}</h3>
            <dl>
              <dt>Anexo</dt><dd>{ANEXOS.find((a) => a.value === s.anexo)!.label}</dd>
              <dt>Faturamento mensal</dt><dd>{brl0(s.fat)}</dd>
              <dt>Alíquota efetiva</dt><dd>{pct(r.efetiva, 2)} ({r.faixa}ª faixa)</dd>
              <dt>Vendas B2B</dt><dd>{s.b2b}%</dd>
              <dt>Compras com crédito</dt><dd>{brl0(s.compras)} por mês</dd>
              <dt>Simples Puro</dt><dd>{brl0(r.dasPuro)} por mês</dd>
              <dt>Simples Híbrido</dt><dd>{brl0(r.custoHibrido)} por mês (DAS {brl0(r.dasHibrido)} + IBS/CBS {brl0(r.ivaHibrido)}), com {brl0(r.creditoClientesHibrido)} de crédito aos clientes</dd>
              <dt>Recomendação</dt><dd>{r.recomendado === 'hibrido' ? 'Simples Híbrido' : 'Simples Puro'}</dd>
              <dt>Escolha</dt><dd>{s.choice === 'hibrido' ? 'Simples Híbrido' : 'Simples Puro'}</dd>
            </dl>
            <p className="hint" style={{ marginTop: 14 }}>Estimativa. Parcela do DAS substituída por IBS/CBS: {pct(r.share, 1)} (média do anexo). Alíquota de referência {s.ref.toFixed(1).replace('.', ',')}%. Base: LC 123/2006 e LC 214/2025, art. 41.</p>
          </div>
        </>
      );
  }

  return (
    <section className="view on" aria-labelledby="h-sim">
      <h1 id="h-sim">Simulador do Simples</h1>
      <p className="lede">Compare ficar no Simples Puro ou recolher IBS/CBS por fora no Simples Híbrido, considerando o crédito que seus clientes deixam de ganhar.</p>
      <div className="sim">
        <div className="panel steps">
          {STEPS.map((t, i) => (
            <button key={t} className={`step${i + 1 < s.step ? ' done' : ''}${i + 1 === s.step ? ' cur' : ''}`} onClick={() => set({ step: i + 1 })}>
              <span className="n">{i + 1 < s.step ? <i className="ti ti-check" /> : i + 1}</span><span className="l">{t}</span>
            </button>
          ))}
        </div>
        <div className="panel stage">
          <div className="stage-body" key={s.step}>{body}</div>
          <div className="stage-foot">
            <button className="btn" onClick={() => set({ step: Math.max(1, s.step - 1) })} disabled={s.step === 1}><i className="ti ti-arrow-left" />Voltar</button>
            <button className="btn primary" onClick={() => (s.step < 7 ? set({ step: s.step + 1 }) : window.print())}>
              {s.step === 6 ? 'Gerar laudo' : s.step === 7 ? <><i className="ti ti-download" />Baixar laudo</> : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
