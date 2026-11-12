import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../lib/ui';

const SOON: Record<string, [string, string, string, string, string]> = {
  creditos: ['ti-coins', 'Créditos', 'O mapa de créditos de IBS/CBS por fornecedor é montado a partir das notas de entrada auditadas.', 'Ver auditoria', '/auditoria'],
  ajuda: ['ti-lifebuoy', 'Ajuda', 'Guias da Reforma 2026, leiaute da NT 2025.002 e passo a passo de cada tela.', 'Perguntar à IA', '/ia'],
};

export function EmBreve({ k }: { k: keyof typeof SOON }) {
  const nav = useNavigate();
  const [icon, title, text, cta, to] = SOON[k];
  return (
    <section className="view on">
      <EmptyState icon={icon} title={title} text={text} action={<button className="btn primary" onClick={() => nav(to)}>{cta}</button>} />
    </section>
  );
}
