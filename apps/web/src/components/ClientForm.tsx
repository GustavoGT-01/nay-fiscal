import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cnpjValido, onlyDigits, REGIMES, type ClientDTO, type CnpjLookupDTO, type Regime } from '@nay/shared';
import { api, fmtCnpj } from '../lib/api';

interface Props {
  open: boolean;
  /** cliente para editar; ausente = novo */
  client?: ClientDTO | null;
  onClose: () => void;
  onSaved: (id: string | null, name: string) => void;
}

const empty = { cnpj: '', name: '', tradeName: '', regime: 'A_DEFINIR' as Regime, city: '', cityCode: '', uf: '', cnae: '' };

/** Cadastro e edicao de cliente. No novo, o CNPJ busca os dados na Receita (BrasilAPI). */
export function ClientForm({ open, client, onClose, onSaved }: Props) {
  const editing = !!client;
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'erro' | 'ok'; text: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setF(client
      ? { cnpj: fmtCnpj(client.cnpj), name: client.name, tradeName: client.tradeName ?? '', regime: client.regime as Regime, city: client.city ?? '', cityCode: client.cityCode ?? '', uf: client.uf ?? '', cnae: client.cnae ?? '' }
      : empty);
    setTimeout(() => first.current?.focus(), 30);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open, client, onClose]);

  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setMsg(null); };

  const lookup = async () => {
    const cnpj = onlyDigits(f.cnpj);
    if (!cnpjValido(cnpj)) { setMsg({ kind: 'erro', text: 'CNPJ inválido. Confira os 14 números.' }); return; }
    setLooking(true);
    try {
      const d = await api<CnpjLookupDTO>(`/api/cnpj/${cnpj}`);
      setF((x) => ({ ...x, cnpj: fmtCnpj(cnpj), name: d.name, tradeName: d.tradeName ?? '', regime: d.regime, city: d.city ?? '', cityCode: d.cityCode ?? '', uf: d.uf ?? '', cnae: d.cnae ?? '' }));
      setMsg({ kind: 'ok', text: `Dados da Receita carregados${d.situacao ? ` (situação: ${d.situacao.toLowerCase()})` : ''}.${d.regime === 'A_DEFINIR' ? ' Não é do Simples: escolha Lucro Presumido ou Real.' : ''}` });
    } catch (e) {
      setMsg({ kind: 'erro', text: (e as Error).message });
    } finally {
      setLooking(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && !cnpjValido(f.cnpj)) { setMsg({ kind: 'erro', text: 'CNPJ inválido. Confira os 14 números.' }); return; }
    if (f.name.trim().length < 2) { setMsg({ kind: 'erro', text: 'Informe a razão social.' }); return; }
    setBusy(true);
    const body = { name: f.name, tradeName: f.tradeName || null, regime: f.regime, city: f.city || null, cityCode: f.cityCode || null, uf: f.uf || null, cnae: f.cnae || null };
    try {
      if (editing) {
        await api(`/api/clients/${client!.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        onSaved(client!.id, f.name);
      } else {
        const r = await api<{ id: string }>('/api/clients', { method: 'POST', body: JSON.stringify({ ...body, cnpj: onlyDigits(f.cnpj) }) });
        onSaved(r.id, f.name);
      }
    } catch (x) {
      setMsg({ kind: 'erro', text: (x as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim2 on" onClick={onClose} />
      <div className="cmdk confirm on client-form" role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <form onSubmit={save}>
          <h2 id="cf-title">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
          <p className="hint" style={{ margin: '4px 0 14px' }}>
            {editing ? 'O CNPJ não muda, porque as notas importadas dependem dele.' : 'Digite o CNPJ e busque os dados na Receita. Filiais entram sozinhas quando você importar as notas delas.'}
          </p>
          <label className="cf-l" htmlFor="cf-cnpj">CNPJ</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="cf-cnpj" ref={first} className="tf" value={f.cnpj} disabled={editing} inputMode="numeric" placeholder="00.000.000/0001-00"
              onChange={(e) => set({ cnpj: e.target.value })} onBlur={() => onlyDigits(f.cnpj).length === 14 && set({ cnpj: fmtCnpj(onlyDigits(f.cnpj)) })} />
            {!editing && <button type="button" className="btn" onClick={lookup} disabled={looking}><i className={'ti ' + (looking ? 'ti-loader-2' : 'ti-search')} />{looking ? 'Buscando' : 'Buscar dados'}</button>}
          </div>
          <label className="cf-l" htmlFor="cf-name">Razão social</label>
          <input id="cf-name" className="tf" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <label className="cf-l" htmlFor="cf-fant">Nome fantasia</label>
          <input id="cf-fant" className="tf" value={f.tradeName} onChange={(e) => set({ tradeName: e.target.value })} />
          <div className="cf-grid">
            <div>
              <label className="cf-l" htmlFor="cf-reg">Regime tributário</label>
              <select id="cf-reg" className="select" value={f.regime} onChange={(e) => set({ regime: e.target.value as Regime })}>
                {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="cf-l" htmlFor="cf-cnae">CNAE principal</label>
              <input id="cf-cnae" className="tf" value={f.cnae} onChange={(e) => set({ cnae: e.target.value })} placeholder="3101-2/00" />
            </div>
            <div>
              <label className="cf-l" htmlFor="cf-city">Município</label>
              <input id="cf-city" className="tf" value={f.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div className="cf-grid2">
              <div>
                <label className="cf-l" htmlFor="cf-uf">UF</label>
                <input id="cf-uf" className="tf" value={f.uf} maxLength={2} onChange={(e) => set({ uf: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="cf-l" htmlFor="cf-ibge">Código IBGE</label>
                <input id="cf-ibge" className="tf" value={f.cityCode} inputMode="numeric" maxLength={7} onChange={(e) => set({ cityCode: onlyDigits(e.target.value) })} />
              </div>
            </div>
          </div>
          <p className="hint" style={{ fontSize: 12.5, marginTop: 8 }}>O código IBGE do município é usado para conferir o destino das notas (IBS).</p>
          {msg && <p className={msg.kind === 'erro' ? 'err-msg' : 'ok-msg'} role={msg.kind === 'erro' ? 'alert' : 'status'}>{msg.text}</p>}
          <div className="confirm-f">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={busy}><i className="ti ti-check" />{busy ? 'Salvando' : editing ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
