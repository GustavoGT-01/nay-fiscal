import { ISS_RETENCAO, ISS_TRIBUTACAO, SIMPLES_OPCAO, type NfseDetailDTO } from '@nay/shared';
import { brl } from '../../lib/api';

/** Servico, ISS e retencoes da NFS-e (no lugar da tabela de itens). */
export function NfseView({ s }: { s: NfseDetailDTO }) {
  const retFed = s.retPis + s.retCofins + s.retIrrf + s.retCsll + s.retCp;
  return (
    <>
      <div className="section-t">Serviço</div>
      <div className="kv" style={{ gridTemplateColumns: '1fr' }}>
        <div><small>Código {s.serviceCode}{s.nbs ? ` · NBS ${s.nbs}` : ''}{s.competence ? ` · competência ${s.competence.split('-').reverse().join('/')}` : ''}</small><b style={{ font: '500 14px var(--body)' }}>{s.description || '—'}</b></div>
      </div>
      <div className="section-t">ISS</div>
      <div className="kv">
        <div><small>Base de cálculo</small><b>{brl(s.issBase)}</b></div>
        <div><small>Alíquota</small><b>{s.issRate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</b></div>
        <div><small>ISS</small><b>{brl(s.issValue)}</b></div>
        <div><small>Tributação</small><b style={{ fontSize: 13 }}>{ISS_TRIBUTACAO[s.issTributacao] ?? '—'}</b></div>
        <div><small>Retenção</small><b style={{ fontSize: 13 }}>{ISS_RETENCAO[s.issRetention] ?? '—'}</b></div>
        <div><small>Prestador</small><b style={{ fontSize: 13 }}>{SIMPLES_OPCAO[s.simplesOption] ?? '—'}</b></div>
      </div>
      <div className="section-t">Valores</div>
      <div className="kv">
        <div><small>Serviço</small><b>{brl(s.serviceValue)}</b></div>
        <div><small>Retenções{retFed ? ` (federais ${brl(retFed)})` : ''}</small><b>{brl(s.retentionsTotal)}</b></div>
        <div><small>Líquido</small><b>{brl(s.netValue)}</b></div>
      </div>
      <p className="hint" style={{ fontSize: 12.5, marginTop: 8 }}>ISS devido em {s.incidenceCity || s.incidenceCityCode || '—'}. IBS/CBS: {s.hasIbsCbs ? 'grupo presente na nota' : 'grupo ausente'}.</p>
    </>
  );
}
