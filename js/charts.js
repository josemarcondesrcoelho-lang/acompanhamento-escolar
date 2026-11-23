/* =========================================================================
 * charts.js — Chart.js com tema, linha de referência e ciclo de vida seguro
 * ========================================================================= */
const vivos = new Map();
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const cores = () => ({ ok: css('--ok'), warn: css('--warn'), danger: css('--danger'), muted: css('--muted'), info: css('--info'), primaria: css('--primaria2'), texto: css('--texto2'), grid: css('--grid'), card: css('--card'), yellow: css('--yellow') });

/** Plugin: linhas horizontais/verticais de referência (média 7,0 etc.) */
const refLine = {
  id: 'refLine',
  afterDatasetsDraw(chart, _a, opts) {
    const linhas = (opts && opts.linhas) || [];
    const { ctx, chartArea, scales } = chart; if (!chartArea) return;
    linhas.forEach((l) => {
      const esc = l.eixo === 'x' ? scales.x : scales.y; if (!esc) return;
      const pos = esc.getPixelForValue(l.valor); if (!Number.isFinite(pos)) return;
      ctx.save(); ctx.strokeStyle = l.cor || '#eab308'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath();
      if (l.eixo === 'x') { ctx.moveTo(pos, chartArea.top); ctx.lineTo(pos, chartArea.bottom); } else { ctx.moveTo(chartArea.left, pos); ctx.lineTo(chartArea.right, pos); }
      ctx.stroke(); ctx.setLineDash([]);
      if (l.rotulo) { ctx.fillStyle = l.cor || '#eab308'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'right'; ctx.fillText(l.rotulo, chartArea.right - 4, (l.eixo === 'x' ? chartArea.top + 11 : pos - 4)); }
      ctx.restore();
    });
  },
};

export function destruirTodos() { vivos.forEach((c) => c.destroy()); vivos.clear(); }
export function destruir(id) { const c = vivos.get(id); if (c) { c.destroy(); vivos.delete(id); } }

export function criar(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === 'undefined') return null;
  destruir(id);
  const c = cores();
  Chart.defaults.color = c.texto; Chart.defaults.borderColor = c.grid; Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  config.plugins = [...(config.plugins || []), refLine];
  config.options = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, ...config.options,
  };
  const chart = new Chart(canvas, config);
  vivos.set(id, chart);
  return chart;
}

export const escalaNota = (max = 10, eixoRef = 'y') => ({ [eixoRef]: { min: 0, max, grid: { color: cores().grid }, ticks: { stepSize: 1 } } });
