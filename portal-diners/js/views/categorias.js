// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
async function loadCategorias() {
  const q = getFilters();
  const rows = await api('/api/datos/por-categoria'+q);
  _cacheCategorias = rows;
  const verCostos = ['admin','gerente'].includes(USER.perfil);
  const total = rows.reduce((s,r)=>s+r.horas,0);
  const cols = ['#0A1628','#6B7280','#B4B2A9','#D3D1C7','#1a3060'];

  if (chartCat) chartCat.destroy();
  chartCat = new Chart(document.getElementById('chart-cat'), {
    type:'doughnut', data:{labels:rows.map(r=>r.categoria_negocio), datasets:[{data:rows.map(r=>r.horas), backgroundColor:cols.slice(0,rows.length), borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{
        legend:{
          position:'right',
          labels:{font:{size:10},boxWidth:12},
          onHover: (e, item, legend) => { legend.chart.canvas.style.cursor = 'pointer'; },
          onLeave: (e, item, legend) => { legend.chart.canvas.style.cursor = 'default'; }
        },
        tooltip:{callbacks:{label:c=>`${c.label}: ${fmtH(c.raw)} h`}}
      }}
  });

  document.getElementById('cat-detail').innerHTML = rows.map(r=>`
    <div class="pbar-row">
      <div class="pbar-label">${r.categoria_negocio}</div>
      <div class="pbar-track"><div class="pbar-fill" style="width:${Math.round(r.horas/total*100)}%"></div></div>
      <div style="font-size:10px;color:var(--muted);width:60px;text-align:right;flex-shrink:0">${fmtH(r.horas)} h</div>
    </div>
    ${verCostos?`<div style="font-size:10px;color:var(--muted);text-align:right;margin-bottom:8px">$${fmtN(r.costo)}</div>`:''}
  `).join('');
}
