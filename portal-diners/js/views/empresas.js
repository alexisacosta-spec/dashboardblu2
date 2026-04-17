// ─── EMPRESAS ─────────────────────────────────────────────────────────────────
async function loadEmpresas() {
  const q = getFilters();
  const empWrap = document.getElementById('emp-table-wrap');
  if (empWrap) empWrap.innerHTML = `<table class="tbl"><thead><tr><th>Empresa</th><th class="num">Horas</th><th class="num">% del total</th></tr></thead><tbody>${skelTable([80,50,50], 4)}</tbody></table>`;
  const [emp, heatmap] = await Promise.all([api('/api/datos/por-empresa'+q), api('/api/datos/empresa-rol'+q)]);
  _cacheEmpresas = { emp, heatmap };
  const verCostos = ['admin','gerente'].includes(USER.perfil);

  if (chartEmpBar) chartEmpBar.destroy();
  chartEmpBar = new Chart(document.getElementById('chart-emp-bar'), {
    type:'bar', data:{labels:emp.map(r=>r.empresa), datasets:[{
      label:'Horas', data:emp.map(r=>r.horas),
      backgroundColor:['rgba(10,22,40,.8)','rgba(107,114,128,.7)','rgba(180,178,169,.7)','rgba(211,209,199,.7)'],
      borderRadius:2
    }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>' '+fmtH(c.raw)+' h'}}},
      scales:{y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:10}}}}}
  });

  const roles = [...new Set(heatmap.map(r=>r.rol))];
  const empresas = [...new Set(heatmap.map(r=>r.empresa))];
  const maxH = Math.max(...heatmap.map(r=>r.horas));
  const getH = (emp,rol) => heatmap.find(r=>r.empresa===emp&&r.rol===rol)?.horas || 0;
  const hmClass = h => { if(!h) return 'hm-0'; const p=h/maxH; return p>.8?'hm-5':p>.6?'hm-4':p>.4?'hm-3':p>.2?'hm-2':'hm-1'; };
  document.getElementById('heatmap-content').innerHTML = `
    <table><thead><tr><th></th>${roles.map(r=>`<th title="${r}">${r.replace('Desarrollador ','Dev ')}</th>`).join('')}</tr></thead>
    <tbody>${empresas.map(e=>`<tr><th style="text-align:left;font-size:9px;padding:5px 8px;white-space:nowrap">${e}</th>
      ${roles.map(r=>`<td class="${hmClass(getH(e,r))}">${fmtH(getH(e,r))}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;

  document.getElementById('emp-table-wrap').innerHTML = `
    <table class="tbl"><thead><tr><th>Empresa</th><th class="num">Horas</th>
      ${verCostos?'<th class="num">Costo</th>':''}
      <th class="num">% del total</th></tr></thead>
    <tbody>${emp.map(r=>`<tr>
      <td><span class="badge ${BADGE_EMPRESA[r.empresa]||'badge-default'}">${r.empresa}</span></td>
      <td class="num">${fmtH(r.horas)}</td>
      ${verCostos?`<td class="num">$${fmtN(r.costo)}</td>`:''}
      <td class="num">${Math.round(r.horas/emp.reduce((s,x)=>s+x.horas,0)*1000)/10}%</td>
    </tr>`).join('')}</tbody></table>`;
}
