import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabase";

// ─── Helpers ───
const generateId = () => Math.random().toString(36).substr(2, 9);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const formatMoney = (n) => `₡${Number(n).toLocaleString("es-CR", { minimumFractionDigits: 0 })}`;
const formatDate = (d) => { if (!d) return "—"; const clean = d.length > 10 ? d : d + "T12:00:00"; return new Date(clean).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }); };
const formatDateShort = (d) => { if (!d) return "—"; const clean = d.length > 10 ? d : d + "T12:00:00"; return new Date(clean).toLocaleDateString("es-CR", { day: "numeric", month: "short" }); };

// Split bounds into up to 4 segments for charts
const semanasEnBounds = (bounds) => {
  const start = new Date(bounds.from + "T00:00:00");
  const end   = new Date(bounds.to   + "T23:59:59");
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const fmt = (d) => d.toLocaleDateString("es-CR", {day:"numeric", month:"short"});
  if (totalDays <= 1) return [{ from: bounds.from, to: bounds.to, l: fmt(start) }];
  const segments = Math.min(4, totalDays);
  const segDays = Math.ceil(totalDays / segments);
  return Array.from({length: segments}, (_, i) => {
    const f = new Date(start); f.setDate(f.getDate() + i * segDays);
    const t = new Date(f);     t.setDate(t.getDate() + segDays - 1);
    if (t > end) t.setTime(end.getTime());
    return { from: f.toISOString().split("T")[0], to: t.toISOString().split("T")[0], l: `${fmt(f)}–${fmt(t)}` };
  });
};

// ─── Date filter hook ───
function useDateFilter(initRange = "30dias") {
  const [range, setRange] = useState(initRange);
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split("T")[0]; });
  const [customTo, setCustomTo] = useState(todayStr);
  const bounds = useMemo(() => {
    const ts = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const t = new Date();
    if (range === "hoy") return { from: ts(t), to: ts(t) };
    if (range === "7dias") { const d = new Date(t); d.setDate(d.getDate()-7); return { from: ts(d), to: ts(t) }; }
    if (range === "30dias") { const d = new Date(t); d.setDate(d.getDate()-30); return { from: ts(d), to: ts(t) }; }
    if (range === "custom") return { from: customFrom, to: customTo };
    return { from: "2000-01-01", to: "2099-12-31" };
  }, [range, customFrom, customTo]);
  return { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo, bounds };
}

// ─── DateFilterBar ───
function DateFilterBar({ df }) {
  const opts = [{ k:"hoy", l:"Hoy" }, { k:"7dias", l:"7 días" }, { k:"30dias", l:"30 días" }, { k:"custom", l:"Rango" }];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
        {opts.map(o=>(
          <button key={o.k} onClick={()=>df.setRange(o.k)}
            className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all ${df.range===o.k?"bg-white text-stone-800 shadow-sm":"text-stone-500 hover:text-stone-700"}`}>
            {o.l}
          </button>
        ))}
      </div>
      {df.range==="custom"&&(
        <div className="flex gap-2 items-center">
          <input type="date" value={df.customFrom} onChange={e=>df.setCustomFrom(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:border-amber-500 text-stone-800"/>
          <span className="text-stone-400 text-xs">a</span>
          <input type="date" value={df.customTo} onChange={e=>df.setCustomTo(e.target.value)} className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:border-amber-500 text-stone-800"/>
        </div>
      )}
    </div>
  );
}

// ─── MiniBarChart SVG ───
function MiniBarChartSVG({ data, color="#f59e0b", height=80 }) {
  if (!data||!data.length) return null;
  const max = Math.max(...data.map(d=>d.v), 1);
  const w = 100 / data.length;
  return (
    <div className="w-full overflow-hidden" style={{height}}>
      <svg width="100%" height="100%" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {data.map((d,i)=>{ const bh=Math.max(2,(d.v/max)*(height-12)); const x=i*w+w*0.15; const bw=w*0.7; return <rect key={i} x={x} y={height-bh-8} width={bw} height={bh} rx="2" fill={color} opacity="0.85"/>; })}
      </svg>
    </div>
  );
}

// ─── DonutChart ───
function DonutChart({ segments, size=100 }) {
  const total = segments.reduce((s,x)=>s+x.v,0)||1;
  let cum = 0;
  const r=40,cx=50,cy=50;
  const arc = (start,end) => {
    const s=(start/total)*Math.PI*2-Math.PI/2, e=((start+end)/total)*Math.PI*2-Math.PI/2;
    const x1=cx+r*Math.cos(s),y1=cy+r*Math.sin(s),x2=cx+r*Math.cos(e),y2=cy+r*Math.sin(e);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${end/total>0.5?1:0} 1 ${x2} ${y2} Z`;
  };
  return (<svg width={size} height={size} viewBox="0 0 100 100">{segments.map((seg,i)=>{ const path=arc(cum,seg.v); cum+=seg.v; return <path key={i} d={path} fill={seg.color} opacity="0.85"/>; })}<circle cx="50" cy="50" r="25" fill="white"/></svg>);
}

// ─── Detail screens ───
function DetalleScreen({ title, onBack, children }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 bg-stone-100 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
        <h1 className="text-lg font-bold text-stone-800 m-0">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function DetalleTortillas({ data, bounds }) {
  const pedidosPagados = data.pedidos.filter(p=>["entregado","pagado"].includes(getOrderStatus(p,data.pagos))&&p.fecha_entrega>=bounds.from&&p.fecha_entrega<=bounds.to);
  const totalTortillas = pedidosPagados.reduce((s,p)=>s+p.detalles.reduce((ss,d)=>ss+d.cantidad,0),0);
  const semanas = semanasEnBounds(bounds);
  const barData = semanas.map(s=>({ l:s.l, v:data.pedidos.filter(p=>["entregado","pagado"].includes(getOrderStatus(p,data.pagos))&&p.fecha_entrega>=s.from&&p.fecha_entrega<=s.to).reduce((sum,p)=>sum+p.detalles.reduce((ss,d)=>ss+d.cantidad,0),0) }));
  const porReceta = {};
  pedidosPagados.forEach(p=>p.detalles.forEach(d=>{ if(!porReceta[d.nombre]) porReceta[d.nombre]=0; porReceta[d.nombre]+=d.cantidad; }));
  const recetaRows = Object.entries(porReceta).sort((a,b)=>b[1]-a[1]);
  const porCliente = data.clientes.map(c=>({ nombre:c.nombre, v:pedidosPagados.filter(p=>p.cliente_id===c.id).reduce((s,p)=>s+p.detalles.reduce((ss,d)=>ss+d.cantidad,0),0) })).filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  const maxCli = Math.max(...porCliente.map(c=>c.v),1);
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-amber-50 rounded-xl p-4 text-center"><p className="text-xs text-amber-600 font-medium uppercase tracking-wider mb-1 m-0">Tortillas vendidas</p><p className="text-3xl font-bold text-amber-700 m-0">{totalTortillas}</p><p className="text-xs text-stone-400 mt-1 m-0">{pedidosPagados.length} pedido{pedidosPagados.length!==1?"s":""}</p></div>
      <div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por período</p><MiniBarChartSVG data={barData} color="#c8702a" height={90}/><div className="flex justify-between mt-1">{barData.map(d=><span key={d.l} className="text-[10px] text-stone-400">{d.l}</span>)}</div></div>
      {recetaRows.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por tipo de tortilla</p><div className="flex flex-col gap-1">{recetaRows.map(([nom,qty])=><div key={nom} className="flex justify-between py-1.5 border-b border-stone-100"><span className="text-sm text-stone-600">{nom}</span><span className="text-sm font-bold text-stone-800">{qty} ud.</span></div>)}</div></div>}
      {porCliente.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por cliente</p><div className="flex flex-col gap-2">{porCliente.map(c=>{ const pct=Math.round((c.v/maxCli)*100); return(<div key={c.nombre}><div className="flex justify-between text-xs mb-0.5"><span className="text-stone-600 truncate flex-1 mr-2">{c.nombre}</span><span className="font-medium">{c.v} ud. · {totalTortillas>0?Math.round((c.v/totalTortillas)*100):0}%</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{width:`${pct}%`}}/></div></div>); })}</div></div>}
    </div>
  );
}

function DetalleVentas({ data, bounds }) {
  const pagosFilt = data.pagos.filter(p=>p.fecha>=bounds.from&&p.fecha<=bounds.to);
  const totalCobrado = pagosFilt.reduce((s,p)=>s+p.monto,0);
  const pedidosConSaldo = data.pedidos.map(p=>{ const paid=data.pagos.filter(pg=>pg.pedido_id===p.id).reduce((s,pg)=>s+pg.monto,0); return{...p,saldo:p.total-paid}; }).filter(p=>p.saldo>0);
  const totalPorCobrar = pedidosConSaldo.reduce((s,p)=>s+p.saldo,0);
  const METODO_COLORS = {"efectivo":"#10b981","transferencia":"#3b82f6","tarjeta":"#8b5cf6","otro":"#f59e0b"};
  const byMetodo = {};
  pagosFilt.forEach(p=>{ if(!byMetodo[p.metodo]) byMetodo[p.metodo]=0; byMetodo[p.metodo]+=p.monto; });
  const metodoSegs = Object.entries(byMetodo).sort((a,b)=>b[1]-a[1]).map(([m,v])=>({nombre:m,v,color:METODO_COLORS[m]||"#6b7280"}));
  const porCliente = data.clientes.map(c=>{ const v=pagosFilt.filter(pg=>{ const ped=data.pedidos.find(p=>p.id===pg.pedido_id); return ped?.cliente_id===c.id; }).reduce((s,pg)=>s+pg.monto,0); return{nombre:c.nombre,v}; }).filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  const maxCli = Math.max(...porCliente.map(c=>c.v),1);
  const semanas = semanasEnBounds(bounds);
  const semData = semanas.map(s=>({ l:s.l, v:data.pagos.filter(p=>p.fecha>=s.from&&p.fecha<=s.to).reduce((sum,p)=>sum+p.monto,0) }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-[10px] text-emerald-600 uppercase mb-1 m-0">Cobrado</p><p className="text-2xl font-bold text-emerald-700 m-0">{formatMoney(totalCobrado)}</p></div>
        <div className="bg-amber-50 rounded-xl p-3 text-center"><p className="text-[10px] text-amber-600 uppercase mb-1 m-0">Por cobrar</p><p className="text-2xl font-bold text-amber-700 m-0">{formatMoney(totalPorCobrar)}</p></div>
      </div>
      {metodoSegs.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-3 m-0">Por método de pago</p><div className="flex items-center gap-4 mb-3"><DonutChart segments={metodoSegs} size={80}/><div className="flex-1 flex flex-col gap-2">{metodoSegs.map(m=>{ const pct=totalCobrado>0?Math.round((m.v/totalCobrado)*100):0; return(<div key={m.nombre}><div className="flex justify-between text-xs mb-0.5"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:m.color}}/><span className="capitalize text-stone-600">{m.nombre}</span></div><span className="font-medium">{formatMoney(m.v)} · {pct}%</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:m.color}}/></div></div>); })}</div></div></div>}
      {porCliente.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por cliente</p><div className="flex flex-col gap-2">{porCliente.map(c=>{ const pct=Math.round((c.v/maxCli)*100); const pctT=totalCobrado>0?Math.round((c.v/totalCobrado)*100):0; return(<div key={c.nombre}><div className="flex justify-between text-xs mb-0.5"><span className="text-stone-600 truncate flex-1 mr-2">{c.nombre}</span><span className="font-medium">{formatMoney(c.v)} · {pctT}%</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{width:`${pct}%`}}/></div></div>); })}</div></div>}
      <div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por período</p><MiniBarChartSVG data={semData} color="#059669" height={90}/><div className="flex justify-between mt-1">{semData.map(d=><span key={d.l} className="text-[10px] text-stone-400">{d.l}</span>)}</div></div>
    </div>
  );
}

function DetalleGastosDash({ data, bounds }) {
  const gastosFilt = data.gastos.filter(g=>g.fecha>=bounds.from&&g.fecha<=bounds.to);
  const totalGastos = gastosFilt.reduce((s,g)=>s+g.monto,0);
  const COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#ef4444","#f97316","#6b7280"];
  const byCat = data.expenseCats.map((cat,i)=>({nombre:cat.nombre,v:gastosFilt.filter(g=>g.categoria_id===cat.id).reduce((s,g)=>s+g.monto,0),color:COLORS[i%COLORS.length]})).filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  const semanas = semanasEnBounds(bounds);
  const barData = semanas.map(s=>({ l:s.l, v:data.gastos.filter(g=>g.fecha>=s.from&&g.fecha<=s.to).reduce((sum,g)=>sum+g.monto,0) }));
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-red-50 rounded-xl p-4 text-center"><p className="text-xs text-red-600 font-medium uppercase mb-1 m-0">Total gastos</p><p className="text-3xl font-bold text-red-600 m-0">{formatMoney(totalGastos)}</p></div>
      <div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por período</p><MiniBarChartSVG data={barData} color="#ef4444" height={90}/><div className="flex justify-between mt-1">{barData.map(d=><span key={d.l} className="text-[10px] text-stone-400">{d.l}</span>)}</div></div>
      {byCat.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-3 m-0">Por categoría</p><div className="flex items-center gap-4 mb-3"><DonutChart segments={byCat} size={80}/><div className="flex-1 flex flex-col gap-2">{byCat.map(c=>{ const pct=totalGastos>0?Math.round((c.v/totalGastos)*100):0; return(<div key={c.nombre}><div className="flex justify-between text-xs mb-0.5"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:c.color}}/><span className="text-stone-600 truncate">{c.nombre}</span></div><span className="font-medium">{formatMoney(c.v)}</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:c.color}}/></div></div>); })}</div></div></div>}
    </div>
  );
}

function DetalleUtilidad({ data, bounds }) {
  const pagosFilt = data.pagos.filter(p=>p.fecha>=bounds.from&&p.fecha<=bounds.to);
  const gastosFilt = data.gastos.filter(g=>g.fecha>=bounds.from&&g.fecha<=bounds.to);
  const totalCobrado = pagosFilt.reduce((s,p)=>s+p.monto,0);
  const totalGastos = gastosFilt.reduce((s,g)=>s+g.monto,0);
  const ganancia = totalCobrado - totalGastos;
  const positivo = ganancia>=0;
  const margen = totalCobrado>0?Math.round((ganancia/totalCobrado)*100):0;
  const semanas = semanasEnBounds(bounds);
  const semData = semanas.map(s=>({ l:s.l, cobrado:data.pagos.filter(p=>p.fecha>=s.from&&p.fecha<=s.to).reduce((sum,p)=>sum+p.monto,0), gastos:data.gastos.filter(g=>g.fecha>=s.from&&g.fecha<=s.to).reduce((sum,g)=>sum+g.monto,0) })).filter(s=>s.cobrado>0||s.gastos>0);
  const maxSem = Math.max(...semData.map(s=>Math.max(s.cobrado,s.gastos)),1);
  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-xl p-4 text-center ${positivo?"bg-emerald-50":"bg-red-50"}`}><p className={`text-xs font-medium uppercase mb-1 m-0 ${positivo?"text-emerald-600":"text-red-600"}`}>Utilidad neta</p><p className={`text-3xl font-bold m-0 ${positivo?"text-emerald-700":"text-red-600"}`}>{formatMoney(ganancia)}</p><p className="text-xs text-stone-400 mt-1 m-0">{positivo?`Margen del ${margen}%`:"⚠ Gastos superan lo cobrado"}</p></div>
      <div className="flex flex-col gap-3"><p className="text-sm font-semibold text-stone-700 m-0">Cobrado vs Gastos</p>{[{label:"Cobrado",valor:totalCobrado,color:"bg-emerald-400",text:"text-emerald-700"},{label:"Gastos",valor:totalGastos,color:"bg-red-400",text:"text-red-600"}].map(row=>{ const pct=Math.round((row.valor/Math.max(totalCobrado,totalGastos,1))*100); return(<div key={row.label}><div className="flex justify-between text-xs mb-1"><span className={`font-medium ${row.text}`}>{row.label}</span><span className={`font-bold ${row.text}`}>{formatMoney(row.valor)}</span></div><div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className={`h-full ${row.color} rounded-full`} style={{width:`${pct}%`}}/></div></div>); })}<div className={`rounded-xl px-3 py-2 flex justify-between ${positivo?"bg-emerald-50":"bg-red-50"}`}><span className="text-xs text-stone-500">Utilidad neta</span><span className={`text-sm font-bold ${positivo?"text-emerald-700":"text-red-600"}`}>{positivo?"+ ":""}{formatMoney(ganancia)}</span></div></div>
      {semData.length>0&&<div><p className="text-sm font-semibold text-stone-700 mb-2 m-0">Por período</p><div className="flex flex-col gap-3">{semData.map(s=>{ const pctC=Math.round((s.cobrado/maxSem)*100); const pctG=Math.round((s.gastos/maxSem)*100); const ganSem=s.cobrado-s.gastos; const pos=ganSem>=0; return(<div key={s.l} className="bg-stone-50 rounded-xl p-3"><div className="flex justify-between mb-2"><span className="text-xs font-medium text-stone-600">{s.l}</span><span className={`text-xs font-bold ${pos?"text-emerald-600":"text-red-500"}`}>{pos?"+ ":""}{formatMoney(ganSem)}</span></div><div className="mb-1"><div className="flex justify-between text-[10px] text-stone-400 mb-0.5"><span>Cobrado</span><span>{formatMoney(s.cobrado)}</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{width:`${pctC}%`}}/></div></div><div><div className="flex justify-between text-[10px] text-stone-400 mb-0.5"><span>Gastos</span><span>{formatMoney(s.gastos)}</span></div><div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{width:`${pctG}%`}}/></div></div></div>); })}</div></div>}
    </div>
  );
}

// ─── Initial Data ───
const INITIAL_CLIENTS = [
  { id: "cl1", nombre: "Soda La Esquina", telefono: "8811-2233", direccion: "Calle 5, San José", url_ubicacion: "", creado_en: "2025-01-10" },
  { id: "cl2", nombre: "Pulpería Don Chalo", telefono: "8822-4455", direccion: "Av. Central, Desamparados", url_ubicacion: "", creado_en: "2025-02-14" },
  { id: "cl3", nombre: "Restaurante El Fogón", telefono: "8833-6677", direccion: "Barrio Escalante", url_ubicacion: "", creado_en: "2025-03-01" },
];

const INITIAL_PEDIDOS = [
  { id: "p1", cliente_id: "cl1", cliente_nombre: "Soda La Esquina", fecha_registro: "2026-04-20", fecha_entrega: "2026-04-28", hora_entrega: "09:00", estado: "pendiente", total: 3000, detalles: [{ id:"d1", tipo:"receta", nombre:"Tortilla Normal", cantidad:6, precio_unitario:500, subtotal:3000 }], creado_en: Date.now()-500000 },
  { id: "p2", cliente_id: "cl2", cliente_nombre: "Pulpería Don Chalo", fecha_registro: "2026-04-22", fecha_entrega: "2026-04-29", hora_entrega: "10:00", estado: "pendiente", total: 4500, detalles: [{ id:"d2", tipo:"receta", nombre:"Tortilla con Chicharrón", cantidad:6, precio_unitario:750, subtotal:4500 }], creado_en: Date.now()-300000 },
  { id: "p3", cliente_id: "cl3", cliente_nombre: "Restaurante El Fogón", fecha_registro: "2026-04-25", fecha_entrega: "2026-04-27", hora_entrega: "08:00", estado: "entregado", total: 5500, detalles: [{ id:"d3", tipo:"receta", nombre:"Tortilla Normal", cantidad:8, precio_unitario:500, subtotal:4000 }, { id:"d4", tipo:"oferta", nombre:"Oferta Especial", cantidad:5, precio_unitario:300, subtotal:1500 }], creado_en: Date.now()-800000 },
];

const INITIAL_PAGOS = [
  { id: "pg1", pedido_id: "p3", monto: 5500, metodo: "efectivo", fecha: "2026-04-27" },
  { id: "pg2", pedido_id: "p1", monto: 1500, metodo: "transferencia", fecha: "2026-04-26" },
];

const INITIAL_GASTOS = [
  { id: "g1", categoria_id: "cat1", monto: 12000, descripcion: "Harina de maíz 5kg", fecha: "2026-04-20" },
  { id: "g2", categoria_id: "cat2", monto: 8000, descripcion: "Queso blanco 2kg", fecha: "2026-04-21" },
  { id: "g3", categoria_id: "cat3", monto: 4500, descripcion: "Gas propano recarga", fecha: "2026-04-22" },
  { id: "g4", categoria_id: "cat4", monto: 3000, descripcion: "Bolsas y empaques", fecha: "2026-04-23" },
];

const INITIAL_EXPENSE_CATS = [
  { id: "cat1", nombre: "Harina y masa" },
  { id: "cat2", nombre: "Lácteos y queso" },
  { id: "cat3", nombre: "Gas y combustible" },
  { id: "cat4", nombre: "Empaques e insumos" },
  { id: "cat5", nombre: "Transporte" },
  { id: "cat6", nombre: "Salarios" },
  { id: "cat7", nombre: "Otro" },
];

const INITIAL_INVENTARIO = [
  { id: "inv1", nombre: "Harina de maíz", cantidad: 5000, unidad: "g", precio_total: 12000, minimo: 500 },
  { id: "inv2", nombre: "Queso blanco", cantidad: 2000, unidad: "g", precio_total: 8000, minimo: 200 },
  { id: "inv3", nombre: "Sal", cantidad: 500, unidad: "g", precio_total: 800, minimo: 50 },
  { id: "inv4", nombre: "Mantequilla", cantidad: 1000, unidad: "g", precio_total: 3500, minimo: 100 },
  { id: "inv5", nombre: "Gas propano", cantidad: 10, unidad: "kg", precio_total: 4500, minimo: 2 },
];

const INITIAL_RECETAS = [
  { id: "r1", nombre: "Tortilla Normal", precio_venta: 500, ingredientes: [
    { inv_id: "inv1", cantidad: 80, unidad: "g" },
    { inv_id: "inv2", cantidad: 30, unidad: "g" },
    { inv_id: "inv3", cantidad: 2, unidad: "g" },
    { inv_id: "inv4", cantidad: 10, unidad: "g" },
  ]},
  { id: "r2", nombre: "Tortilla con Chicharrón", precio_venta: 750, ingredientes: [
    { inv_id: "inv1", cantidad: 80, unidad: "g" },
    { inv_id: "inv2", cantidad: 40, unidad: "g" },
    { inv_id: "inv3", cantidad: 2, unidad: "g" },
    { inv_id: "inv4", cantidad: 10, unidad: "g" },
  ]},
];

const STATUS_COLORS = {
  pendiente: "bg-amber-100 text-amber-800",
  "en camino": "bg-blue-100 text-blue-800",
  entregado: "bg-emerald-100 text-emerald-800",
  pagado: "bg-purple-100 text-purple-800",
  cancelado: "bg-red-100 text-red-700",
};

function getOrderStatus(pedido, pagos) {
  const paid = pagos.filter(p => p.pedido_id === pedido.id).reduce((s, p) => s + p.monto, 0);
  if (paid >= pedido.total) return "pagado";
  return pedido.estado;
}

// ─── Icons ───
const I = {
  Home: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  Users: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  Dollar: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  TrendDown: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  Box: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Bell: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  X: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Trash: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Edit: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  TrendUp: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  ChefHat: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13.87A4 4 0 017.41 6a5.11 5.11 0 0111.18 0A4 4 0 0118 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>,
  Alert: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Map: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  Phone: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.63a16 16 0 006.29 6.29l1.95-1.95a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  ChevLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  ChevDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Bell: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Filter: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  LogOut: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
};

// ─── Modal ───
function Modal({ open, onClose, title, children, preventBackdropClose=false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={preventBackdropClose ? undefined : onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-5 py-4 border-b border-stone-100 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400"><I.X/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── MiniBarChart ───
function MiniBarChart({ data, color }) {
  const max = Math.max(...data.map(d => d.v), 1);
  return (
    <div className="flex items-end gap-1 h-10 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div style={{ width:"100%", background: color, borderRadius:"3px 3px 0 0", height:`${(d.v/max)*36}px`, opacity: i===data.length-1?1:0.45, transition:"height 0.5s ease" }}/>
        </div>
      ))}
    </div>
  );
}

// ─── StatCard (tappable KPI) ───
function StatCard({ icon, label, value, sub, gradient, chartData, chartColor }) {
  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-stone-100 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-2 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: gradient }}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] text-stone-400 font-semibold uppercase tracking-wider truncate m-0">{label}</p>
          <p className="text-base sm:text-xl font-bold text-stone-800 leading-tight break-words m-0">{value}</p>
          {sub && <p className="text-[10px] text-stone-400 truncate m-0">{sub}</p>}
        </div>
      </div>
      {chartData && <MiniBarChart data={chartData} color={chartColor}/>}
    </div>
  );
}

// ─── QuickPagoModal ───
function QuickPagoModal({ grupo, pagos, onPago, onClose }) {
  const pedidosOrdenados = useMemo(()=>
    [...grupo.pedidos].sort((a,b)=>a.fecha_registro.localeCompare(b.fecha_registro)),
    [grupo.pedidos]
  );
  const getSaldoPedido = (p) => {
    const paid = pagos.filter(pg=>pg.pedido_id===p.id).reduce((s,pg)=>s+pg.monto,0);
    return p.total - paid;
  };
  const totalDeuda = pedidosOrdenados.reduce((s,p)=>s+getSaldoPedido(p),0);
  const totalPedidos = pedidosOrdenados.reduce((s,p)=>s+p.total,0);
  const totalPagadoAntes = pedidosOrdenados.reduce((s,p)=>s+(p.total-getSaldoPedido(p)),0);
  const [monto, setMonto] = useState(String(totalDeuda));
  const [metodo, setMetodo] = useState("efectivo");
  const montoNum = Number(monto);
  const excede = montoNum > totalDeuda;

  const preview = useMemo(()=>{
    let restante = Math.min(montoNum, totalDeuda);
    return pedidosOrdenados.map(p=>{
      const saldo = getSaldoPedido(p);
      if (saldo<=0||restante<=0) return { p, aplica:0, saldo };
      const aplica = Math.min(saldo, restante);
      restante -= aplica;
      return { p, aplica, saldo };
    }).filter(x=>x.aplica>0||x.saldo>0);
  },[montoNum, pedidosOrdenados, pagos]);

  const handleConfirm = () => {
    if (!montoNum||montoNum<=0||excede) return;
    let restante = montoNum;
    pedidosOrdenados.forEach(p=>{
      if (restante<=0) return;
      const saldo = getSaldoPedido(p);
      if (saldo<=0) return;
      const aplica = Math.min(saldo, restante);
      restante -= aplica;
      onPago({ id:generateId(), pedido_id:p.id, monto:aplica, metodo, fecha:todayStr() });
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-800 m-0">Registrar pago</h2>
            <p className="text-xs text-stone-400 m-0">{grupo.cliente_nombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400"><I.X/></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="bg-stone-50 rounded-xl p-3 text-sm flex flex-col gap-1">
            <div className="flex justify-between"><span className="text-stone-500">Total acumulado</span><span className="font-medium text-stone-800">{formatMoney(totalPedidos)}</span></div>
            {totalPagadoAntes>0&&<div className="flex justify-between"><span className="text-stone-500">Ya pagado</span><span className="text-emerald-600">{formatMoney(totalPagadoAntes)}</span></div>}
            <div className="flex justify-between pt-1 border-t border-stone-200"><span className="font-medium text-stone-700">Saldo total</span><span className="font-bold text-amber-600">{formatMoney(totalDeuda)}</span></div>
            {pedidosOrdenados.length>1&&<p className="text-[10px] text-stone-400 m-0">{pedidosOrdenados.length} pedidos · el abono se aplica del más antiguo al más nuevo</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-stone-600">Monto a abonar (₡)</label>
              <button type="button" onClick={()=>setMonto(String(totalDeuda))} className="text-xs text-amber-600 font-medium">Pagar todo</button>
            </div>
            <input type="number" value={monto} onChange={e=>setMonto(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"/>
          </div>
          {excede&&<p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 m-0">El monto supera el saldo de {formatMoney(totalDeuda)}</p>}
          {montoNum>0&&!excede&&pedidosOrdenados.length>1&&(
            <div className="bg-amber-50 rounded-xl p-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider m-0">Distribución automática</p>
              {preview.filter(x=>x.aplica>0).map(({p,aplica,saldo})=>(
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="text-stone-600">Pedido {formatDate(p.fecha_registro)}</span>
                  <span className="font-medium text-amber-700">{formatMoney(aplica)} de {formatMoney(saldo)}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1.5">Método</label>
            <div className="grid grid-cols-2 gap-2">
              {["efectivo","transferencia","tarjeta","otro"].map(m=>(
                <button key={m} type="button" onClick={()=>setMetodo(m)}
                  className={`py-2 rounded-xl text-xs font-medium capitalize transition-all border ${metodo===m?"border-amber-500 bg-amber-50 text-amber-700":"border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleConfirm} disabled={!montoNum||montoNum<=0||excede}
            className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <I.Check/> Confirmar pago
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashPedidosActivos ───
function DashPedidosActivos({ pedidos, pagos, onStatusChange, onPago, titulo, clientes, onReorder }) {
  const [pagoForm, setPagoForm] = useState(null);
  const [expanded, setExpanded] = useState({});

  const shareWhatsApp = (group) => {
    const cliente = clientes?.find(c=>c.id===group.cliente_id) || {};
    const ubicacion = [cliente.provincia, cliente.canton, cliente.distrito].filter(Boolean).join(", ");
    const lineas = [
      "🫓 *QueTortillApp — Datos de entrega*",
      "",
      `👤 *Cliente:* ${group.cliente_nombre || cliente.nombre || ""}`,
      cliente.telefono ? `📞 *Teléfono:* ${cliente.telefono}` : null,
      ubicacion ? `📍 *Ubicación:* ${ubicacion}` : null,
      cliente.direccion ? `🏠 *Dirección:* ${cliente.direccion}` : null,
      cliente.url_ubicacion ? `🗺️ *Mapa:* ${cliente.url_ubicacion}` : null,
    ].filter(l=>l!==null).join("\n");
    const url = `https://wa.me/?text=${encodeURIComponent(lineas)}`;
    window.open(url, "_blank");
  };
  const ESTADOS = ["pendiente","en camino","entregado"];

  const clienteGroups = useMemo(()=>{
    const map = {};
    pedidos.forEach(p=>{
      if (!map[p.cliente_id]) map[p.cliente_id]={ cliente_id:p.cliente_id, cliente_nombre:p.cliente_nombre, pedidos:[] };
      map[p.cliente_id].pedidos.push(p);
    });
    return Object.values(map).sort((a,b)=>{
      const ordenA = Math.min(...a.pedidos.map(p=>p.orden ?? 999999));
      const ordenB = Math.min(...b.pedidos.map(p=>p.orden ?? 999999));
      if (ordenA!==ordenB) return ordenA-ordenB;
      const proxA = [...a.pedidos].sort((x,y)=>x.fecha_entrega.localeCompare(y.fecha_entrega))[0];
      const proxB = [...b.pedidos].sort((x,y)=>x.fecha_entrega.localeCompare(y.fecha_entrega))[0];
      return proxA.fecha_entrega.localeCompare(proxB.fecha_entrega);
    });
  },[pedidos]);

  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const handleDrop = async (targetIdx) => {
    if (dragIdx===null || dragIdx===targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...clienteGroups];
    const [moved] = reordered.splice(dragIdx,1);
    reordered.splice(targetIdx,0,moved);
    setDragIdx(null); setOverIdx(null);
    // Persist new order: each group's pedidos get sequential orden values
    const ordenMap = {};
    reordered.forEach((group,i)=>{
      group.pedidos.forEach(p=>{ ordenMap[p.id] = i; });
    });
    const updates = Object.entries(ordenMap)
      .filter(([id,orden])=>pedidos.find(p=>p.id===id)?.orden !== orden)
      .map(([id,orden])=>supabase.from("pedidos").update({orden}).eq("id",id));
    await Promise.all(updates);
    if (onReorder) onReorder(ordenMap);
  };

  const getSaldoCliente = (group)=>{
    const totalPedidos = group.pedidos.reduce((s,p)=>s+p.total,0);
    const totalPagado  = group.pedidos.reduce((s,p)=>s+pagos.filter(pg=>pg.pedido_id===p.id).reduce((ss,pg)=>ss+pg.monto,0),0);
    return { totalPedidos, totalPagado, saldo: totalPedidos-totalPagado };
  };

  const getPedidoParaPagar = (group)=>{
    const sorted = [...group.pedidos].sort((a,b)=>a.fecha_registro.localeCompare(b.fecha_registro));
    return sorted.find(p=>{ const paid=pagos.filter(pg=>pg.pedido_id===p.id).reduce((s,pg)=>s+pg.monto,0); return paid<p.total; });
  };

  if (pedidos.length===0) return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm">
      <div className="px-4 py-3 border-b border-stone-100">
        <h3 className="font-semibold text-stone-700 text-sm m-0">{titulo||"Pedidos activos"} (0)</h3>
      </div>
      <p className="text-stone-400 text-sm text-center py-6 m-0">Sin pedidos activos</p>
    </div>
  );

  return (
    <>
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100">
        <h3 className="font-semibold text-stone-700 text-sm m-0">{titulo||"Pedidos activos"} — {clienteGroups.length} cliente{clienteGroups.length!==1?"s":""} · {pedidos.length} pedido{pedidos.length!==1?"s":""}</h3>
      </div>
      <div className="divide-y divide-stone-50">
        {clienteGroups.map((group,idx)=>{
          const { totalPedidos, totalPagado, saldo } = getSaldoCliente(group);
          const isPaid = saldo<=0;
          const pct = totalPedidos>0 ? Math.min(100,Math.round((totalPagado/totalPedidos)*100)) : 0;
          const isExpanded = expanded[group.cliente_id];
          const pedidoParaPagar = getPedidoParaPagar(group);
          const proxEntrega = [...group.pedidos].sort((a,b)=>a.fecha_entrega.localeCompare(b.fecha_entrega))[0];

          return (
            <div key={group.cliente_id}
              draggable
              onDragStart={()=>setDragIdx(idx)}
              onDragOver={(e)=>{e.preventDefault(); setOverIdx(idx);}}
              onDrop={()=>handleDrop(idx)}
              onDragEnd={()=>{setDragIdx(null);setOverIdx(null);}}
              className={`transition-colors ${overIdx===idx&&dragIdx!==null&&dragIdx!==idx?"bg-amber-50":""} ${dragIdx===idx?"opacity-40":""}`}>
              <div className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-400" title="Arrastrar para reordenar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-700 m-0 break-words">{group.cliente_nombre}</p>
                    <p className="text-xs text-amber-600 font-medium m-0 mt-0.5">
                      Próx. entrega: {formatDate(proxEntrega.fecha_entrega)}{proxEntrega.hora_entrega?" · "+proxEntrega.hora_entrega:""}
                    </p>
                    {group.pedidos.length>1&&<p className="text-[10px] text-stone-400 m-0">{group.pedidos.length} pedidos pendientes</p>}

                    <div className="flex items-center justify-between gap-2 mt-2.5 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-stone-800 m-0">{formatMoney(totalPedidos)}</p>
                        {saldo>0&&totalPagado>0&&<p className="text-[10px] text-red-500 m-0">Saldo: {formatMoney(saldo)}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={()=>shareWhatsApp(group)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 whitespace-nowrap">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Compartir
                        </button>
                        {!isPaid&&pedidoParaPagar&&(
                          <button onClick={()=>setPagoForm(group)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 whitespace-nowrap">
                            <I.Dollar/> Pagar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Barra de progreso pago */}
                {totalPedidos>0&&(
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-stone-400">Pagado: {formatMoney(totalPagado)}</span>
                      <span className={isPaid?"text-emerald-500 font-medium":"text-stone-400"}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${isPaid?"bg-emerald-400":"bg-amber-400"}`} style={{width:`${pct}%`}}/>
                    </div>
                  </div>
                )}

                {/* Status labels — pedido único */}
                {group.pedidos.length===1&&(
                  <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                    {ESTADOS.map(s=>(
                      <button key={s} type="button" onClick={()=>onStatusChange(group.pedidos[0].id,s)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${group.pedidos[0].estado===s?STATUS_COLORS[s]:"bg-stone-100 text-stone-400 hover:bg-stone-200"}`}>
                        {s}
                      </button>
                    ))}
                    <button type="button"
                      onClick={()=>{ if(window.confirm("¿Anular este pedido?")) onStatusChange(group.pedidos[0].id,"cancelado"); }}
                      className="ml-auto px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">
                      Anular
                    </button>
                  </div>
                )}

                {/* Toggle para múltiples pedidos */}
                {group.pedidos.length>1&&(
                  <button onClick={()=>setExpanded(prev=>({...prev,[group.cliente_id]:!prev[group.cliente_id]}))}
                    className="mt-2 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${isExpanded?"rotate-180":""}`}><polyline points="6 9 12 15 18 9"/></svg>
                    {isExpanded?"Ocultar pedidos":"Ver pedidos individuales"}
                  </button>
                )}
              </div>

              {/* Pedidos expandidos (múltiples) */}
              {isExpanded&&group.pedidos.length>1&&(
                <div className="bg-stone-50 border-t border-stone-100 divide-y divide-stone-100">
                  {[...group.pedidos].sort((a,b)=>a.fecha_entrega.localeCompare(b.fecha_entrega)).map(p=>(
                    <div key={p.id} className="px-5 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-xs font-medium text-stone-700 m-0">{formatDate(p.fecha_entrega)}{p.hora_entrega?" · "+p.hora_entrega:""}</p>
                          <p className="text-[10px] text-stone-400 m-0">{p.detalles.map(d=>`${d.cantidad}x ${d.nombre}`).join(", ")}</p>
                        </div>
                        <p className="text-xs font-semibold text-stone-700 m-0">{formatMoney(p.total)}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap items-center">
                        {ESTADOS.map(s=>(
                          <button key={s} type="button" onClick={()=>onStatusChange(p.id,s)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${p.estado===s?STATUS_COLORS[s]:"bg-stone-200 text-stone-400 hover:bg-stone-300"}`}>
                            {s}
                          </button>
                        ))}
                        <button type="button"
                          onClick={()=>{ if(window.confirm("¿Anular este pedido?")) onStatusChange(p.id,"cancelado"); }}
                          className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-400 hover:bg-red-100 border border-red-200">
                          Anular
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    {pagoForm&&<QuickPagoModal grupo={pagoForm} pagos={pagos} onPago={onPago} onClose={()=>setPagoForm(null)}/>}
    </>
  );
}

// ─── Dashboard ───
function Dashboard({ data, setData }) {
  const df = useDateFilter("30dias");
  const { bounds } = df;
  const [detalle, setDetalle] = useState(null); // null | "tortillas" | "ventas" | "gastos" | "utilidad"

  const pagosFilt   = data.pagos.filter(p=>p.fecha>=bounds.from&&p.fecha<=bounds.to);
  const gastosFilt  = data.gastos.filter(g=>g.fecha>=bounds.from&&g.fecha<=bounds.to);
  const totalVentas = pagosFilt.reduce((s,p)=>s+p.monto,0);
  const totalGastos = gastosFilt.reduce((s,g)=>s+g.monto,0);
  const utilidad    = totalVentas - totalGastos;
  const tortillasVendidas = data.pedidos
    .filter(p=>["entregado","pagado"].includes(getOrderStatus(p,data.pagos))&&p.fecha_entrega>=bounds.from&&p.fecha_entrega<=bounds.to)
    .reduce((s,p)=>s+p.detalles.reduce((ss,d)=>ss+d.cantidad,0),0);

  const last7 = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });
  const chartVentas = last7.map(d=>({ v: data.pagos.filter(p=>p.fecha===d).reduce((s,p)=>s+p.monto,0) }));
  const chartGastos = last7.map(d=>({ v: data.gastos.filter(g=>g.fecha===d).reduce((s,g)=>s+g.monto,0) }));
  const chartUtil   = last7.map((_,i)=>({ v: Math.max(0, chartVentas[i].v - chartGastos[i].v) }));
  const chartTort   = last7.map(d=>({ v: data.pedidos.filter(p=>getOrderStatus(p,data.pagos)==="pagado"&&p.fecha_entrega===d).reduce((s,p)=>s+p.detalles.reduce((ss,dd)=>ss+dd.cantidad,0),0) }));

  const stockBajo = data.inventario.filter(i=>i.cantidad<=i.minimo);

  // Cumpleaños de hoy
  const hoyMD = todayStr().slice(5); // "MM-DD"
  const cumpleHoy = data.clientes.filter(cl => cl.fecha_nacimiento && cl.fecha_nacimiento.slice(5) === hoyMD);
  const upcomingOrders = useMemo(()=>{
    const n = new Date();
    return data.pedidos
      .filter(p=>!["cancelado","pagado"].includes(getOrderStatus(p,data.pagos)))
      .map(p=>{ const e=new Date(p.fecha_entrega+"T"+(p.hora_entrega||"23:59")+":00"); return {...p, diffH:(e-n)/3600000}; })
      .filter(p=>p.diffH>=0&&p.diffH<=48)
      .sort((a,b)=>a.diffH-b.diffH);
  },[data.pedidos, data.pagos]);

  const activosPendientes = data.pedidos.filter(p=>["pendiente","en camino"].includes(getOrderStatus(p,data.pagos))).sort((a,b)=>a.fecha_entrega.localeCompare(b.fecha_entrega));
  const activosEntregados = data.pedidos.filter(p=>getOrderStatus(p,data.pagos)==="entregado").sort((a,b)=>b.fecha_entrega.localeCompare(a.fecha_entrega));

  const handleStatusChange = async (pedidoId, nuevoEstado) => {
    const { error } = await supabase.from("pedidos").update({ estado: nuevoEstado }).eq("id", pedidoId);
    if (error) { alert("Error actualizando estado: " + error.message); return; }
    setData(d=>({ ...d, pedidos: d.pedidos.map(p=>p.id===pedidoId?{...p,estado:nuevoEstado}:p) }));
  };
  const handlePago = async (pago) => {
    const ped = data.pedidos.find(p=>p.id===pago.pedido_id);
    const pagoCompleto = { ...pago, cliente_nombre: ped?.cliente_nombre||"" };
    const { error } = await supabase.from("pagos").insert(pagoCompleto);
    if (error) { alert("Error guardando pago: " + error.message); return; }
    setData(d=>({ ...d, pagos: [...d.pagos, pagoCompleto] }));
  };

  // ── Detalle screens ──
  if (detalle==="tortillas") return <DetalleScreen title="Tortillas vendidas" onBack={()=>setDetalle(null)}><DetalleTortillas data={data} bounds={bounds}/></DetalleScreen>;
  if (detalle==="ventas")    return <DetalleScreen title="Detalle de ventas"  onBack={()=>setDetalle(null)}><DetalleVentas data={data} bounds={bounds}/></DetalleScreen>;
  if (detalle==="gastos")    return <DetalleScreen title="Detalle de gastos"  onBack={()=>setDetalle(null)}><DetalleGastosDash data={data} bounds={bounds}/></DetalleScreen>;
  if (detalle==="utilidad")  return <DetalleScreen title="Detalle de utilidad" onBack={()=>setDetalle(null)}><DetalleUtilidad data={data} bounds={bounds}/></DetalleScreen>;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-stone-800 m-0">Dashboard</h1><p className="text-xs text-stone-400 m-0">Resumen de tu negocio</p></div>
        <button onClick={()=>window.location.reload()} className="flex items-center gap-1.5 px-3 py-2 bg-stone-100 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-200">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Actualizar
        </button>
      </div>

      <DateFilterBar df={df}/>

      {/* KPI cards — tapeables */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { key:"tortillas", icon:<I.ChefHat/>, label:"Tortillas vendidas", value:tortillasVendidas, sub:"unidades", gradient:"linear-gradient(135deg,#c8702a,#a85520)", chart:chartTort, color:"#c8702a" },
          { key:"ventas",    icon:<I.TrendUp/>, label:"Ventas",             value:formatMoney(totalVentas), sub:"cobrado", gradient:"linear-gradient(135deg,#059669,#047857)", chart:chartVentas, color:"#059669" },
          { key:"gastos",    icon:<I.TrendDown/>, label:"Gastos",           value:formatMoney(totalGastos), sub:"este período", gradient:"linear-gradient(135deg,#dc2626,#b91c1c)", chart:chartGastos, color:"#dc2626" },
          { key:"utilidad",  icon:<I.Dollar/>, label:"Utilidad",            value:formatMoney(utilidad), sub:utilidad>=0?"positiva":"negativa", gradient:utilidad>=0?"linear-gradient(135deg,#7c3aed,#5b21b6)":"linear-gradient(135deg,#dc2626,#b91c1c)", chart:chartUtil, color:utilidad>=0?"#7c3aed":"#dc2626" },
        ].map(s=>(
          <button key={s.key} onClick={()=>setDetalle(s.key)}
            className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex flex-col gap-3 text-left active:scale-[0.97] transition-transform w-full">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{background:s.gradient}}>{s.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider m-0">{s.label}</p>
                <p className="text-xl font-bold text-stone-800 leading-tight truncate m-0">{s.value}</p>
                {s.sub&&<p className="text-[11px] text-stone-400 m-0">{s.sub}</p>}
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-300 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <MiniBarChart data={s.chart} color={s.color}/>
          </button>
        ))}
      </div>

      {/* Stock bajo */}
      {stockBajo.length>0&&(
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start">
          <div className="text-amber-600 mt-0.5 flex-shrink-0"><I.Alert/></div>
          <div><p className="text-sm font-bold text-amber-800 m-0">⚠️ Stock bajo</p><p className="text-xs text-amber-700 mt-1 m-0">{stockBajo.map(i=>`${i.nombre} (${i.cantidad}${i.unidad})`).join(", ")}</p></div>
        </div>
      )}

      {/* Cumpleaños hoy */}
      {cumpleHoy.length>0&&(
        <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-xl flex-shrink-0">🎂</span>
          <div>
            <p className="text-sm font-bold text-pink-800 m-0">¡Cumpleaños hoy!</p>
            <p className="text-xs text-pink-700 mt-1 m-0">{cumpleHoy.map(cl=>cl.nombre).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Entregas próximas */}
      {upcomingOrders.length>0&&(
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1.5"><I.Bell/><p className="text-sm font-semibold text-amber-800 m-0">Entregas próximas (48h)</p></div>
          {upcomingOrders.map(p=>(
            <div key={p.id} className="flex items-center justify-between py-1.5 border-t border-amber-100 first:border-0">
              <div><p className="text-sm text-amber-800 m-0">{p.cliente_nombre}</p><p className="text-xs text-amber-600 m-0">{p.fecha_entrega} · {p.hora_entrega}</p></div>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${p.diffH<=4?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{p.diffH<=4?"¡Urgente!":p.diffH<=24?"Hoy":"Mañana"}</span>
            </div>
          ))}
        </div>
      )}

      <DashPedidosActivos titulo="Pendientes / En camino" pedidos={activosPendientes} pagos={data.pagos} onStatusChange={handleStatusChange} onPago={handlePago} clientes={data.clientes} onReorder={(ordenMap)=>setData(d=>({...d, pedidos:d.pedidos.map(p=>ordenMap[p.id]!==undefined?{...p,orden:ordenMap[p.id]}:p)}))}/>
      {activosEntregados.length>0&&<DashPedidosActivos titulo="Entregados — pendiente de cobro" pedidos={activosEntregados} pagos={data.pagos} onStatusChange={handleStatusChange} onPago={handlePago} clientes={data.clientes} onReorder={(ordenMap)=>setData(d=>({...d, pedidos:d.pedidos.map(p=>ordenMap[p.id]!==undefined?{...p,orden:ordenMap[p.id]}:p)}))}/>}
    </div>
  );
}

// ─── Clientes ───
function Clientes({ data, setData }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editCl, setEditCl] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });
  const [form, setForm] = useState({ nombre:"", telefono:"", provincia:"", canton:"", distrito:"", direccion:"", url_ubicacion:"", fecha_nacimiento:"", notas:"" });

  const filtered = data.clientes.filter(c=>c.nombre.toLowerCase().includes(search.toLowerCase()));

  const daysInMonth = new Date(calMonth.y, calMonth.m+1, 0).getDate();
  const firstDay = new Date(calMonth.y, calMonth.m, 1).getDay();
  const todayFull = new Date();

  const ordersByDay = useMemo(()=>{
    const map = {};
    data.pedidos.forEach(p=>{
      if (!map[p.fecha_registro]) map[p.fecha_registro]=[];
      map[p.fecha_registro].push(p);
    });
    return map;
  },[data.pedidos]);

  const prevMonth = () => setCalMonth(prev=>{ const d=new Date(prev.y,prev.m-1,1); return {y:d.getFullYear(),m:d.getMonth()}; });
  const nextMonth = () => setCalMonth(prev=>{ const d=new Date(prev.y,prev.m+1,1); return {y:d.getFullYear(),m:d.getMonth()}; });

  const selectedPedidos = useMemo(()=> selectedDay ? (ordersByDay[selectedDay]||[]) : [], [selectedDay,ordersByDay]);

  const openAdd = () => { setForm({nombre:"",provincia:"",canton:"",distrito:"",direccion:"",url_ubicacion:"",fecha_nacimiento:"",notas:""}); setEditCl(null); setShowAdd(true); };
  const openEdit = (cl) => { setForm({nombre:cl.nombre||"",telefono:cl.telefono||"",provincia:cl.provincia||"",canton:cl.canton||"",distrito:cl.distrito||"",direccion:cl.direccion||"",url_ubicacion:cl.url_ubicacion||"",fecha_nacimiento:cl.fecha_nacimiento||"",notas:cl.notas||""}); setEditCl(cl); setShowAdd(true); };

  const saveCliente = async () => {
    if (!form.nombre.trim()) return;
    if (editCl) {
      const { error } = await supabase.from("clientes").update({ nombre:form.nombre, telefono:form.telefono, provincia:form.provincia, canton:form.canton, distrito:form.distrito, direccion:form.direccion, url_ubicacion:form.url_ubicacion, fecha_nacimiento:form.fecha_nacimiento, notas:form.notas }).eq("id", editCl.id);
      if (error) { alert("Error guardando: " + error.message); return; }
      setData(d=>({...d, clientes: d.clientes.map(c=>c.id===editCl.id?{...c,...form}:c)}));
    } else {
      const newC = {...form, id:generateId()};
      const { error } = await supabase.from("clientes").insert(newC);
      if (error) { alert("Error guardando: " + error.message); return; }
      setData(d=>({...d, clientes: [...d.clientes, newC]}));
    }
    setShowAdd(false);
  };

  const deleteCliente = async (id) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    await supabase.from("clientes").delete().eq("id", id);
    setData(d=>({...d, clientes: d.clientes.filter(c=>c.id!==id)}));
  };

  const monthLabel = new Date(calMonth.y,calMonth.m,1).toLocaleDateString("es-CR",{month:"long",year:"numeric"});

  return (
    <div className="flex flex-col gap-4">
      {/* Calendario */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500"><I.ChevLeft/></button>
          <p className="text-sm font-bold text-stone-800 capitalize">{monthLabel}</p>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500"><I.ChevRight/></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {["D","L","M","X","J","V","S"].map(d=><div key={d} className="text-[10px] font-semibold text-stone-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i}/>)}
          {Array.from({length:daysInMonth},(_,i)=>{
            const day = i+1;
            const dayStr = `${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const hasOrders = !!ordersByDay[dayStr];
            const isToday = calMonth.y===todayFull.getFullYear()&&calMonth.m===todayFull.getMonth()&&day===todayFull.getDate();
            const isSelected = selectedDay===dayStr;
            return (
              <div key={day}
                onClick={()=>setSelectedDay(isSelected?null:dayStr)}
                className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-[13px] cursor-pointer transition-all
                  ${isSelected?"bg-amber-600 text-white font-bold":hasOrders?"bg-amber-50 text-amber-700 font-bold":"text-stone-600 hover:bg-stone-50"}
                  ${isToday&&!isSelected?"ring-2 ring-amber-500":""}`}>
                {day}
              </div>
            );
          })}
        </div>
        {selectedDay && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            {selectedPedidos.length===0
              ? <p className="text-xs text-stone-400 text-center">Sin pedidos este día</p>
              : selectedPedidos.map(p=>(
                  <div key={p.id} className="flex justify-between py-1.5 border-b border-stone-50 last:border-0">
                    <p className="text-sm text-stone-700 m-0">{p.cliente_nombre}</p>
                    <p className="text-sm font-semibold text-amber-700 m-0">{formatMoney(p.total)}</p>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* Búsqueda + botón */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"><I.Search/></span>
          <input className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-semibold px-4 rounded-xl">
          <I.Plus/> Nuevo
        </button>
      </div>

      {/* Lista de clientes */}
      {filtered.map(cl=>{
        const pedidosCl = data.pedidos.filter(p=>p.cliente_id===cl.id);
        const totalCobrado = data.pagos.filter(pg=>pedidosCl.some(p=>p.id===pg.pedido_id)).reduce((s,pg)=>s+pg.monto,0);
        return (
          <div key={cl.id} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-800 m-0">{cl.nombre}</p>
                <div className="flex flex-col gap-1 mt-2">
                  {cl.telefono && <div className="flex gap-2 items-center text-stone-500"><I.Phone/><span className="text-xs">{cl.telefono}</span></div>}
                  {(cl.provincia||cl.canton||cl.distrito) && <div className="flex gap-2 items-center text-stone-500"><I.Map/><span className="text-xs">{[cl.provincia,cl.canton,cl.distrito].filter(Boolean).join(" · ")}</span></div>}
                  {cl.direccion && <div className="flex gap-2 items-center text-stone-500"><I.Map/><span className="text-xs">{cl.direccion}</span></div>}
                  {cl.url_ubicacion && <a href={cl.url_ubicacion} target="_blank" rel="noreferrer" className="flex gap-2 items-center text-amber-600 text-xs no-underline"><I.Map/><span>Ver en mapa</span></a>}
                  {cl.fecha_nacimiento && <div className="flex gap-2 items-center text-stone-500"><span className="text-xs">🎂</span><span className="text-xs">{cl.fecha_nacimiento}</span></div>}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={()=>{
                      const lineas = [
                        `👤 *${cl.nombre}*`,
                        cl.telefono ? `📞 ${cl.telefono}` : null,
                        [cl.provincia,cl.canton,cl.distrito].filter(Boolean).length ? `📍 ${[cl.provincia,cl.canton,cl.distrito].filter(Boolean).join(", ")}` : null,
                        cl.direccion ? `🏠 ${cl.direccion}` : null,
                        cl.url_ubicacion ? `🗺️ ${cl.url_ubicacion}` : null,
                        cl.notas ? `📝 ${cl.notas}` : null,
                      ].filter(Boolean).join("\n");
                      window.open(`https://wa.me/?text=${encodeURIComponent(lineas)}`,"_blank");
                    }} className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 w-fit">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Compartir contacto
                    </button>
                    <button onClick={()=>{
                      const msg = `Hola ${cl.nombre}! 🫓 Para mantener tus datos de entrega al día, por favor llená este formulario: https://forms.gle/Lm9XUiLxMexkPNL3A`;
                      const tel = cl.telefono ? cl.telefono.replace(/\D/g,"") : "";
                      window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,"_blank");
                    }} className="flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 w-fit">
                      📝 Enviar formulario de actualización
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 ml-2">
                <button onClick={()=>openEdit(cl)} className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"><I.Edit/></button>
                <button onClick={()=>deleteCliente(cl.id)} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><I.Trash/></button>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-100 flex gap-4">
              <div><p className="text-[10px] text-stone-400 font-semibold uppercase m-0">Pedidos</p><p className="text-base font-bold text-stone-800 m-0">{pedidosCl.length}</p></div>
              <div><p className="text-[10px] text-stone-400 font-semibold uppercase m-0">Cobrado</p><p className="text-base font-bold text-emerald-600 m-0">{formatMoney(totalCobrado)}</p></div>
              <div><p className="text-[10px] text-stone-400 font-semibold uppercase m-0">Desde</p><p className="text-xs font-semibold text-stone-600 m-0 mt-1">{formatDate(cl.created_at)}</p></div>
            </div>
          </div>
        );
      })}

      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title={editCl?"Editar cliente":"Nuevo cliente"} preventBackdropClose>
        <div className="flex flex-col gap-3">
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Nombre *</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del cliente"/></div>
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Teléfono</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="8888-8888"/></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Provincia</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.provincia} onChange={e=>setForm(f=>({...f,provincia:e.target.value}))} placeholder="San José"/></div>
            <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Cantón</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.canton} onChange={e=>setForm(f=>({...f,canton:e.target.value}))} placeholder="Central"/></div>
            <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Distrito</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.distrito} onChange={e=>setForm(f=>({...f,distrito:e.target.value}))} placeholder="Carmen"/></div>
          </div>
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Dirección exacta</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.direccion} onChange={e=>setForm(f=>({...f,direccion:e.target.value}))} placeholder="100m norte del parque..."/></div>
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">URL Waze / Google Maps</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.url_ubicacion} onChange={e=>setForm(f=>({...f,url_ubicacion:e.target.value}))} placeholder="https://waze.com/..."/></div>
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Fecha de nacimiento</label><input type="date" className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.fecha_nacimiento} onChange={e=>setForm(f=>({...f,fecha_nacimiento:e.target.value}))}/></div>
          <div><label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Otro (opcional)</label><input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas adicionales..."/></div>
          <button onClick={saveCliente} className="w-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-semibold py-2.5 rounded-xl mt-1">Guardar</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Shared input helpers ───
function FieldInput({ label, ...props }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">{label}</label>
      <input className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 text-stone-800" {...props}/>
    </div>
  );
}
function FieldSelect({ label, children, ...props }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">{label}</label>
      <select className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 text-stone-800 bg-white" {...props}>{children}</select>
    </div>
  );
}
function BtnPrimary({ children, disabled, onClick, className="" }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

// ─── Cliente search select ───
function ClienteSearchSelect({ clientes, value, onChange }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const sorted = [...clientes].sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
  const filtered = sorted.filter(c=>c.nombre.toLowerCase().includes(search.toLowerCase())||(c.direccion||"").toLowerCase().includes(search.toLowerCase()));
  const selected = clientes.find(c=>c.id===value);
  return (
    <div className="relative">
      <div onClick={()=>setOpen(!open)}
        className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm cursor-pointer flex items-center justify-between bg-white">
        <span className={selected?"text-stone-800":"text-stone-400"}>
          {selected?`${selected.nombre}${selected.direccion?` (${selected.direccion})`:""}`:"Seleccionar cliente..."}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-stone-400 transition-transform ${open?"rotate-180":""}`}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {open&&(
        <div className="absolute z-30 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-stone-100">
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." onClick={e=>e.stopPropagation()}
              className="w-full px-3 py-1.5 bg-stone-50 rounded-lg text-sm outline-none text-stone-800"/>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length===0&&<p className="text-stone-400 text-sm text-center py-3">Sin resultados</p>}
            {filtered.map(c=>(
              <button key={c.id} type="button" onClick={()=>{onChange(c.id);setOpen(false);setSearch("");}}
                className={`w-full px-3 py-2.5 text-left text-sm hover:bg-stone-50 ${value===c.id?"bg-amber-50 text-amber-700 font-medium":"text-stone-700"}`}>
                {c.nombre}{c.direccion&&<span className="text-stone-400 text-xs ml-1">({c.direccion})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {open&&<div className="fixed inset-0 z-20" onClick={()=>{setOpen(false);setSearch("");}}/>}
    </div>
  );
}

// ─── PEDIDOS ───
function Pedidos({ data, setData }) {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterCliente, setFilterCliente] = useState("todos");
  const [form, setForm] = useState({ cliente_id:"", items:[{tipo:"receta",receta_id:"",nombre:"",cantidad:1,precio_unitario:0}], fecha_entrega:todayStr(), hora_entrega:"10:00" });

  const ESTADOS_FILTER = ["todos","pendiente","en camino","entregado","pagado","cancelado"];

  const sorted = useMemo(()=>{
    return [...data.pedidos]
      .filter(p=>{
        const ds = getOrderStatus(p, data.pagos);
        const okStatus = filterStatus==="todos" || ds===filterStatus;
        const okCliente = filterCliente==="todos" || p.cliente_id===filterCliente;
        return okStatus && okCliente;
      })
      .sort((a,b)=>{
        const oa = a.orden ?? 999999, ob = b.orden ?? 999999;
        if (oa!==ob) return oa-ob;
        return b.fecha_registro.localeCompare(a.fecha_registro);
      });
  },[data.pedidos, data.pagos, filterStatus, filterCliente]);

  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const handleDropPedido = async (targetIdx) => {
    if (dragIdx===null || dragIdx===targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx,1);
    reordered.splice(targetIdx,0,moved);
    setDragIdx(null); setOverIdx(null);
    const ordenMap = {};
    reordered.forEach((p,i)=>{ ordenMap[p.id]=i; });
    const updates = Object.entries(ordenMap)
      .filter(([id,orden])=>data.pedidos.find(p=>p.id===id)?.orden !== orden)
      .map(([id,orden])=>supabase.from("pedidos").update({orden}).eq("id",id));
    await Promise.all(updates);
    setData(d=>({...d, pedidos:d.pedidos.map(p=>ordenMap[p.id]!==undefined?{...p,orden:ordenMap[p.id]}:p)}));
  };

  const addItem = () => setForm(f=>({...f, items:[...f.items, {tipo:"receta",receta_id:"",nombre:"",cantidad:1,precio_unitario:0}]}));
  const removeItem = i => setForm(f=>({...f, items:f.items.filter((_,idx)=>idx!==i)}));
  const updateItem = (i,k,v) => setForm(f=>{ const items=[...f.items]; items[i]={...items[i],[k]:v}; return {...f,items}; });

  const selectReceta = (i, recetaId) => {
    const rec = data.recetas.find(r=>r.id===recetaId);
    if (rec) updateItem(i,"receta_id",recetaId) || setForm(f=>{ const items=[...f.items]; items[i]={...items[i],receta_id:recetaId,nombre:rec.nombre,precio_unitario:rec.precio_venta,tipo:"receta"}; return {...f,items}; });
    else setForm(f=>{ const items=[...f.items]; items[i]={...items[i],receta_id:recetaId,nombre:rec?.nombre||"",precio_unitario:rec?.precio_venta||0,tipo:"receta"}; return {...f,items}; });
  };

  const calcTotal = () => form.items.reduce((s,item)=>s+(Number(item.precio_unitario)*Number(item.cantidad)),0);

  const [savingPedido, setSavingPedido] = useState(false);
  const savePedido = async () => {
    const cliente = data.clientes.find(c=>c.id===form.cliente_id);
    if (!cliente || form.items.some(i=>!i.nombre||!i.cantidad)) return;
    if (savingPedido) return;
    setSavingPedido(true);
    const detalles = form.items.map(item=>({ id:generateId(), tipo:item.tipo, nombre:item.nombre, cantidad:Number(item.cantidad), precio_unitario:Number(item.precio_unitario), subtotal:Number(item.cantidad)*Number(item.precio_unitario) }));
    const total = detalles.reduce((s,d)=>s+d.subtotal,0);
    const newPedido = { id:generateId(), cliente_id:cliente.id, cliente_nombre:cliente.nombre, fecha_registro:todayStr(), fecha_entrega:form.fecha_entrega, hora_entrega:form.hora_entrega, estado:"pendiente", total, detalles, orden:999999 };
    const { error } = await supabase.from("pedidos").insert({ id:newPedido.id, cliente_id:newPedido.cliente_id, cliente_nombre:newPedido.cliente_nombre, fecha_registro:newPedido.fecha_registro, fecha_entrega:newPedido.fecha_entrega, hora_entrega:newPedido.hora_entrega, estado:newPedido.estado, total:newPedido.total, items:newPedido.detalles, orden:newPedido.orden });
    if (error) { alert("Error guardando pedido: " + error.message); setSavingPedido(false); return; }
    setData(d=>({...d, pedidos:[...d.pedidos, newPedido]}));
    setShowForm(false);
    setForm({ cliente_id:"", items:[{tipo:"receta",receta_id:"",nombre:"",cantidad:1,precio_unitario:0}], fecha_entrega:todayStr(), hora_entrega:"10:00" });
    setSavingPedido(false);
  };

  const updateStatus = async (id, estado) => { await supabase.from("pedidos").update({estado}).eq("id", id); setData(d=>({...d, pedidos:d.pedidos.map(p=>p.id===id?{...p,estado}:p)})); };
  const deletePedido = async (id) => {
    if (!window.confirm("¿Eliminar este pedido por completo? Esta acción no se puede deshacer.")) return;
    await supabase.from("pagos").delete().eq("pedido_id", id);
    await supabase.from("pedidos").delete().eq("id", id);
    setData(d=>({...d, pedidos:d.pedidos.filter(p=>p.id!==id), pagos:d.pagos.filter(pa=>pa.pedido_id!==id)}));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800 m-0">Pedidos</h1>
        <BtnPrimary onClick={()=>setShowForm(true)}><I.Plus/>Nuevo</BtnPrimary>
      </div>

      {/* Filtro status */}
      <div className="flex gap-1.5 flex-wrap">
        {ESTADOS_FILTER.map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border capitalize
              ${filterStatus===s ? s==="todos"?"bg-stone-700 text-white border-transparent":(STATUS_COLORS[s]+" border-transparent") : "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"}`}>
            {s==="todos"?"Todos":s}
          </button>
        ))}
      </div>

      {/* Filtro cliente */}
      <FieldSelect label="Filtrar por cliente" value={filterCliente} onChange={e=>setFilterCliente(e.target.value)}>
        <option value="todos">Todos los clientes</option>
        {[...data.clientes].sort((a,b)=>a.nombre.localeCompare(b.nombre,"es")).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
      </FieldSelect>

      {sorted.length===0&&<p className="text-center text-stone-400 text-sm py-10">Sin pedidos con este filtro</p>}

      {sorted.map((p,idx)=>{
        const ds = getOrderStatus(p, data.pagos);
        const isPaid = ds==="pagado";
        const paid = data.pagos.filter(pg=>pg.pedido_id===p.id).reduce((s,pg)=>s+pg.monto,0);
        const saldo = p.total - paid;
        const now = new Date();
        const entrega = new Date(p.fecha_entrega+"T"+(p.hora_entrega||"23:59")+":00");
        const diffH = (entrega-now)/3600000;
        const pronto = diffH>=0&&diffH<=24&&!["cancelado","pagado"].includes(ds);
        return (
          <div key={p.id}
            draggable
            onDragStart={()=>setDragIdx(idx)}
            onDragOver={(e)=>{e.preventDefault(); setOverIdx(idx);}}
            onDrop={()=>handleDropPedido(idx)}
            onDragEnd={()=>{setDragIdx(null);setOverIdx(null);}}
            className={`bg-white rounded-2xl p-4 border shadow-sm transition-colors ${pronto?"border-amber-300":isPaid?"border-purple-200":"border-stone-100"} ${overIdx===idx&&dragIdx!==null&&dragIdx!==idx?"bg-amber-50":""} ${dragIdx===idx?"opacity-40":""}`}>
            <div className="flex items-center gap-1.5 text-stone-300 mb-1 cursor-grab active:cursor-grabbing w-fit" title="Arrastrar para reordenar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
            </div>
            {pronto&&<div className="flex items-center gap-1.5 mb-2 text-amber-700"><I.Bell/><p className="text-xs font-semibold m-0">Entrega próxima</p></div>}
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="font-semibold text-stone-800 m-0">{p.cliente_nombre}</p>
                <p className="text-xs text-stone-400 m-0">Registro: {formatDate(p.fecha_registro)}</p>
                <p className="text-xs text-amber-600 font-medium m-0">Entrega: {formatDate(p.fecha_entrega)}{p.hora_entrega?" · "+p.hora_entrega:""}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-stone-800 m-0">{formatMoney(p.total)}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[ds]||"bg-stone-100 text-stone-500"}`}>{ds}</span>
              </div>
            </div>
            <p className="text-xs text-stone-500 mb-2">{p.detalles.map(d=>`${d.cantidad}x ${d.nombre}`).join(" · ")}</p>
            {!isPaid&&saldo>0&&saldo<p.total&&(
              <div className="mb-2">
                <div className="flex justify-between text-xs mb-1"><span className="text-stone-400">Pagado: {formatMoney(paid)}</span><span className="text-red-500 font-medium">Saldo: {formatMoney(saldo)}</span></div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{width:`${(paid/p.total)*100}%`}}/></div>
              </div>
            )}
            {!isPaid&&ds!=="cancelado"&&(
              <div className="flex gap-1.5 flex-wrap items-center">
                {["pendiente","en camino","entregado"].map(s=>(
                  <button key={s} onClick={()=>updateStatus(p.id,s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${p.estado===s?"bg-amber-500 text-white":"bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>{s}</button>
                ))}
                <button onClick={()=>{ if(window.confirm("¿Cancelar este pedido?")) updateStatus(p.id,"cancelado"); }}
                  className="ml-auto px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 border border-red-200">Cancelar</button>
              </div>
            )}
            {ds==="cancelado"&&<p className="text-xs text-red-500 font-medium m-0">Pedido cancelado</p>}
            {isPaid&&<p className="text-xs text-purple-600 font-medium m-0">✓ Pagado en su totalidad</p>}
            <button onClick={()=>deletePedido(p.id)}
              className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-red-500 mt-1 w-fit">
              <I.Trash/> Eliminar pedido
            </button>
          </div>
        );
      })}

      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Nuevo pedido">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1">Cliente *</label>
            <ClienteSearchSelect clientes={data.clientes} value={form.cliente_id} onChange={id=>setForm(f=>({...f,cliente_id:id}))}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Fecha entrega" type="date" value={form.fecha_entrega} onChange={e=>setForm(f=>({...f,fecha_entrega:e.target.value}))}/>
            <FieldInput label="Hora entrega" type="time" value={form.hora_entrega} onChange={e=>setForm(f=>({...f,hora_entrega:e.target.value}))}/>
          </div>

          <div className="flex flex-col gap-2">
            <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Productos</label>
            {form.items.map((item,i)=>(
              <div key={i} className="bg-stone-50 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <select className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-500 bg-white text-stone-800"
                    value={item.tipo==="oferta"?"__oferta__":item.receta_id}
                    onChange={e=>{
                      if (e.target.value==="__oferta__") {
                        setForm(f=>{ const items=[...f.items]; items[i]={...items[i],tipo:"oferta",receta_id:"",nombre:"Oferta especial",precio_unitario:0}; return {...f,items}; });
                      } else {
                        const rec = data.recetas.find(r=>r.id===e.target.value);
                        setForm(f=>{ const items=[...f.items]; items[i]={...items[i],tipo:"receta",receta_id:e.target.value,nombre:rec?.nombre||"",precio_unitario:rec?.precio_venta||0}; return {...f,items}; });
                      }
                    }}>
                    <option value="">Seleccionar...</option>
                    {data.recetas.map(r=><option key={r.id} value={r.id}>{r.nombre} — {formatMoney(r.precio_venta)}</option>)}
                    <option value="__oferta__">🏷️ Oferta especial</option>
                  </select>
                  {form.items.length>1&&<button onClick={()=>removeItem(i)} className="text-red-400 hover:text-red-600 flex-shrink-0"><I.Trash/></button>}
                </div>
                {item.tipo==="oferta"&&(
                  <FieldInput label="Descripción oferta" value={item.nombre==="Oferta especial"?"":item.nombre} placeholder="Ej: 10 tortillas por ₡3000" onChange={e=>updateItem(i,"nombre",e.target.value)}/>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput label="Cantidad" type="number" min="1" value={item.cantidad} onChange={e=>updateItem(i,"cantidad",e.target.value)}/>
                  <FieldInput label="Precio unit. (₡)" type="number" value={item.precio_unitario} onChange={e=>updateItem(i,"precio_unitario",e.target.value)}/>
                </div>
                <p className="text-xs text-amber-700 font-semibold m-0">Subtotal: {formatMoney(Number(item.cantidad)*Number(item.precio_unitario))}</p>
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-amber-600 font-medium flex items-center gap-1 hover:text-amber-700"><I.Plus/>Agregar producto</button>
          </div>

          <div className="bg-amber-50 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-stone-700">Total</span>
            <span className="text-lg font-bold text-amber-700">{formatMoney(calcTotal())}</span>
          </div>
          <BtnPrimary onClick={savePedido} disabled={!form.cliente_id||form.items.some(i=>!i.nombre)||savingPedido} className="w-full">{savingPedido ? "Guardando..." : "Guardar pedido"}</BtnPrimary>
        </div>
      </Modal>
    </div>
  );
}

// ─── PAGOS ───
function Pagos({ data, setData }) {
  const df = useDateFilter("30dias");
  const { bounds } = df;
  const [showForm, setShowForm] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [filterCliente, setFilterCliente] = useState("todos");
  const [form, setForm] = useState({ pedido_id:"", monto:"", metodo:"efectivo", fecha:todayStr() });

  const pagosFiltrados = useMemo(()=>{
    return data.pagos.filter(p=>{
      const enRango = p.fecha>=bounds.from && p.fecha<=bounds.to;
      if (filterCliente==="todos") return enRango;
      const ped = data.pedidos.find(pd=>pd.id===p.pedido_id);
      return enRango && ped?.cliente_id===filterCliente;
    });
  },[data.pagos, data.pedidos, filterCliente, bounds]);

  const pedidosConSaldo = useMemo(()=>
    data.pedidos
      .filter(p=>p.estado!=="cancelado")
      .map(p=>{ const pagado=data.pagos.filter(pg=>pg.pedido_id===p.id).reduce((s,pg)=>s+pg.monto,0); return {...p, pagado, saldo:p.total-pagado, diasDeuda:Math.floor((Date.now()-new Date(p.fecha_entrega+"T12:00:00"))/86400000)}; })
      .filter(p=>p.saldo>0)
      .sort((a,b)=>b.diasDeuda-a.diasDeuda)
  ,[data.pedidos, data.pagos]);

  const totalCobrado = pagosFiltrados.reduce((s,p)=>s+p.monto,0);
  const totalPorCobrar = pedidosConSaldo.reduce((s,p)=>s+p.saldo,0);
  const selectedPedido = pedidosConSaldo.find(p=>p.id===form.pedido_id);
  const montoNum = Number(form.monto);
  const excede = selectedPedido && montoNum>selectedPedido.saldo;

  const getMoraStyle = (dias)=>{
    if (dias>15) return { bg:"bg-red-50", dot:"bg-red-500", label:"text-red-600", alert:true };
    if (dias>7)  return { bg:"bg-amber-50", dot:"bg-amber-400", label:"text-amber-600", alert:false };
    if (dias<0)  return { bg:"", dot:"bg-blue-400", label:"text-blue-500", alert:false };
    return { bg:"", dot:"bg-stone-300", label:"text-stone-400", alert:false };
  };
  const getMoraLabel = (dias)=>{
    if (dias<0) return `Entrega en ${Math.abs(dias)}d`;
    if (dias===0) return "Entrega hoy";
    if (dias>15) return `Mora ${dias}d ⚠️`;
    return `${dias}d desde entrega`;
  };

  const savePago = async () => {
    if (!form.pedido_id||!form.monto||montoNum<=0||excede) return;
    const ped = data.pedidos.find(p=>p.id===form.pedido_id);
    const newPago = { id:generateId(), pedido_id:form.pedido_id, cliente_nombre:ped?.cliente_nombre||"", monto:montoNum, metodo:form.metodo, fecha:form.fecha };
    await supabase.from("pagos").insert(newPago);
    setData(d=>({...d, pagos:[...d.pagos, newPago]}));
    setShowForm(false);
    setForm({ pedido_id:"", monto:"", metodo:"efectivo", fecha:todayStr() });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800 m-0">Pagos</h1>
        <BtnPrimary onClick={()=>setShowForm(true)}><I.Plus/>Registrar</BtnPrimary>
      </div>

      <DateFilterBar df={df}/>

      <FieldSelect label="Filtrar por cliente" value={filterCliente} onChange={e=>setFilterCliente(e.target.value)}>
        <option value="todos">Todos los clientes</option>
        {[...data.clientes].sort((a,b)=>a.nombre.localeCompare(b.nombre,"es")).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
      </FieldSelect>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider m-0">Cobrado</p>
          <p className="text-xl font-bold text-emerald-600 mt-1 m-0">{formatMoney(totalCobrado)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider m-0">Por cobrar</p>
          <p className="text-xl font-bold text-amber-600 mt-1 m-0">{formatMoney(totalPorCobrar)}</p>
          <p className="text-xs text-stone-400 m-0">{pedidosConSaldo.length} pedido{pedidosConSaldo.length!==1?"s":""}</p>
        </div>
      </div>

      {/* Cuentas por cobrar / morosos */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-stone-50">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-stone-700 text-sm m-0">Cuentas por cobrar</h3>
            {pedidosConSaldo.some(p=>p.diasDeuda>15)&&<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"/>}
          </div>
          <span className="text-xs text-stone-400">{pedidosConSaldo.length}</span>
        </div>
        {pedidosConSaldo.length===0
          ? <p className="text-stone-400 text-sm text-center py-6 m-0">Sin cuentas pendientes ✓</p>
          : <div className="divide-y divide-stone-50">
              {pedidosConSaldo.map(p=>{
                const s = getMoraStyle(p.diasDeuda);
                return (
                  <div key={p.id} className={`px-4 py-3 ${s.bg}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${s.dot} mt-1.5 flex-shrink-0`}/>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate m-0">{p.cliente_nombre}</p>
                          <p className="text-xs text-stone-400 m-0">Entrega: {formatDate(p.fecha_entrega)}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-red-500 m-0">{formatMoney(p.saldo)}</p>
                        <p className={`text-[10px] font-medium m-0 ${s.label}`}>{getMoraLabel(p.diasDeuda)}</p>
                      </div>
                    </div>
                    {s.alert&&<div className="flex items-center gap-1.5 mt-1 ml-5 text-red-600"><I.Alert/><p className="text-[11px] font-medium m-0">Mora de más de 2 semanas</p></div>}
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <button onClick={()=>setShowHistorial(!showHistorial)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-50">
          <h3 className="font-semibold text-stone-700 text-sm m-0">Historial de pagos</h3>
          <div className="flex items-center gap-2 text-stone-400"><span className="text-xs">{pagosFiltrados.length}</span><I.ChevDown/></div>
        </button>
        {showHistorial&&(
          pagosFiltrados.length===0
            ? <p className="text-stone-400 text-sm text-center py-4 border-t border-stone-100 m-0">Sin pagos registrados</p>
            : <div className="divide-y divide-stone-50 border-t border-stone-100">
                {[...pagosFiltrados].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(p=>{
                  const ped = data.pedidos.find(pd=>pd.id===p.pedido_id);
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-800 text-sm truncate m-0">{ped?.cliente_nombre||"—"}</p>
                        <p className="text-xs text-stone-400 m-0">{formatDate(p.fecha)} · {p.metodo}</p>
                      </div>
                      <p className="text-base font-bold text-emerald-600 flex-shrink-0 ml-3 m-0">+{formatMoney(p.monto)}</p>
                    </div>
                  );
                })}
              </div>
        )}
      </div>

      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Registrar pago">
        <div className="flex flex-col gap-4">
          <FieldSelect label="Pedido con saldo" value={form.pedido_id} onChange={e=>setForm(f=>({...f,pedido_id:e.target.value,monto:""}))}>
            <option value="">Seleccionar...</option>
            {pedidosConSaldo.map(p=><option key={p.id} value={p.id}>{p.cliente_nombre} — Saldo: {formatMoney(p.saldo)}</option>)}
          </FieldSelect>
          {selectedPedido&&(
            <div className="bg-stone-50 rounded-xl p-3 text-sm flex flex-col gap-1">
              <div className="flex justify-between"><span className="text-stone-500">Total</span><span className="font-medium">{formatMoney(selectedPedido.total)}</span></div>
              <div className="flex justify-between"><span className="text-stone-500">Pagado</span><span className="text-emerald-600">{formatMoney(selectedPedido.pagado)}</span></div>
              <div className="flex justify-between pt-1 border-t border-stone-200"><span className="font-medium text-stone-700">Saldo</span><span className="font-bold text-amber-600">{formatMoney(selectedPedido.saldo)}</span></div>
            </div>
          )}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Monto (₡)</label>
              {selectedPedido&&<button type="button" onClick={()=>setForm(f=>({...f,monto:String(selectedPedido.saldo)}))} className="text-xs text-amber-600 font-medium">Pagar todo</button>}
            </div>
            <input type="number" placeholder="0" value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500"/>
          </div>
          {excede&&<p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 m-0">El monto supera el saldo disponible</p>}
          <FieldSelect label="Método" value={form.metodo} onChange={e=>setForm(f=>({...f,metodo:e.target.value}))}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </FieldSelect>
          <FieldInput label="Fecha" type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
          <BtnPrimary onClick={savePago} disabled={!form.pedido_id||!form.monto||montoNum<=0||excede} className="w-full">
            <I.Check/> Registrar pago
          </BtnPrimary>
        </div>
      </Modal>
    </div>
  );
}

// ─── GASTOS ───
function Gastos({ data, setData }) {
  const df = useDateFilter("30dias");
  const { bounds } = df;
  const [showForm, setShowForm] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [showHistorial, setShowHistorial] = useState(true);
  const [filterCat, setFilterCat] = useState("todas");
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState({ categoria_id:"", monto:"", descripcion:"", fecha:todayStr() });

  const gastosFilt = useMemo(()=>
    [...data.gastos]
      .filter(g=>{
        const enRango = g.fecha>=bounds.from && g.fecha<=bounds.to;
        const enCat = filterCat==="todas"||g.categoria_id===filterCat;
        return enRango && enCat;
      })
      .sort((a,b)=>b.fecha.localeCompare(a.fecha))
  ,[data.gastos, filterCat, bounds]);

  const totalGastos = gastosFilt.reduce((s,g)=>s+g.monto,0);
  const byCategory = data.expenseCats
    .map(cat=>({...cat, total:gastosFilt.filter(g=>g.categoria_id===cat.id).reduce((s,g)=>s+g.monto,0)}))
    .filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const addCat = () => {
    if (!newCatName.trim()) return;
    const newCat = { id:generateId(), nombre:newCatName.trim() };
    setData(d=>({...d, expenseCats:[...d.expenseCats, newCat]}));
    setNewCatName("");
  };
  const removeCat = (id) => {
    if (data.gastos.some(g=>g.categoria_id===id)) return;
    setData(d=>({...d, expenseCats:d.expenseCats.filter(c=>c.id!==id)}));
  };
  const saveGasto = async () => {
    if (!form.categoria_id||!form.monto) return;
    const catNombre = data.expenseCats.find(c=>c.id===form.categoria_id)?.nombre||"";
    const newGasto = { id:generateId(), ...form, monto:Number(form.monto), categoria:catNombre };
    await supabase.from("gastos").insert({ id:newGasto.id, categoria_id:newGasto.categoria_id, categoria:newGasto.categoria, monto:newGasto.monto, descripcion:newGasto.descripcion, fecha:newGasto.fecha });
    setData(d=>({...d, gastos:[...d.gastos, newGasto]}));
    setShowForm(false);
    setForm({ categoria_id:"", monto:"", descripcion:"", fecha:todayStr() });
  };
  const removeGasto = async (id) => { await supabase.from("gastos").delete().eq("id", id); setData(d=>({...d, gastos:d.gastos.filter(g=>g.id!==id)})); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-800 m-0">Gastos</h1>
        <div className="flex gap-2">
          <button onClick={()=>setShowCatMgr(true)} className="flex items-center gap-1 border border-stone-200 text-stone-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-stone-50">
            <I.Filter/> Categorías
          </button>
          <BtnPrimary onClick={()=>setShowForm(true)}><I.Plus/>Registrar</BtnPrimary>
        </div>
      </div>

      <DateFilterBar df={df}/>

      <FieldSelect label="Filtrar por categoría" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
        <option value="todas">Todas las categorías</option>
        {data.expenseCats.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
      </FieldSelect>

      <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl p-4 text-white">
        <p className="text-rose-100 text-xs font-medium uppercase tracking-wider m-0">Total gastos</p>
        <p className="text-2xl font-bold mt-1 m-0">{formatMoney(totalGastos)}</p>
      </div>

      {/* Breakdown por categoría */}
      {byCategory.length>0&&(
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex flex-col gap-2">
          <p className="text-sm font-bold text-stone-700 m-0">Por categoría</p>
          {byCategory.map(cat=>{
            const pct = totalGastos>0 ? Math.round((cat.total/totalGastos)*100) : 0;
            return (
              <div key={cat.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-600">{cat.nombre}</span>
                  <span className="font-semibold text-stone-700">{formatMoney(cat.total)} · {pct}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-400 rounded-full" style={{width:`${pct}%`}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista */}
      {gastosFilt.length===0
        ? <p className="text-center text-stone-400 text-sm py-10">Sin gastos registrados</p>
        : gastosFilt.map(g=>{
            const cat = data.expenseCats.find(c=>c.id===g.categoria_id);
            return (
              <div key={g.id} className="bg-white rounded-xl p-4 border border-stone-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-800 m-0">{g.descripcion||cat?.nombre}</p>
                  <p className="text-xs text-stone-400 m-0">{formatDate(g.fecha)} · {cat?.nombre||"Sin categoría"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-red-500 m-0">-{formatMoney(g.monto)}</p>
                  <button onClick={()=>removeGasto(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-stone-300 hover:text-red-500"><I.Trash/></button>
                </div>
              </div>
            );
          })
      }

      {/* Form registrar gasto */}
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Registrar gasto">
        <div className="flex flex-col gap-4">
          <FieldSelect label="Categoría" value={form.categoria_id} onChange={e=>setForm(f=>({...f,categoria_id:e.target.value}))}>
            <option value="">Seleccionar...</option>
            {data.expenseCats.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FieldSelect>
          <FieldInput label="Monto (₡)" type="number" placeholder="0" value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))}/>
          <FieldInput label="Descripción" placeholder="Ej: Harina de maíz 5kg" value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/>
          <FieldInput label="Fecha" type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
          <BtnPrimary onClick={saveGasto} disabled={!form.categoria_id||!form.monto} className="w-full">
            <I.Check/> Registrar gasto
          </BtnPrimary>
        </div>
      </Modal>

      {/* Gestión de categorías */}
      <Modal open={showCatMgr} onClose={()=>setShowCatMgr(false)} title="Categorías de gastos">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="Nueva categoría..."
              onKeyDown={e=>e.key==="Enter"&&addCat()}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500"/>
            <BtnPrimary onClick={addCat} disabled={!newCatName.trim()}><I.Plus/>Agregar</BtnPrimary>
          </div>
          <div className="flex flex-col gap-1.5">
            {data.expenseCats.map(cat=>{
              const inUse = data.gastos.some(g=>g.categoria_id===cat.id);
              return (
                <div key={cat.id} className="flex items-center justify-between px-3 py-2.5 bg-stone-50 rounded-xl">
                  <p className="text-sm font-medium text-stone-800 m-0">{cat.nombre}</p>
                  {inUse
                    ? <span className="text-[10px] text-stone-400 bg-stone-200 px-2 py-0.5 rounded-full">En uso</span>
                    : <button onClick={()=>removeCat(cat.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-stone-400 hover:text-red-500"><I.Trash/></button>
                  }
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── INVENTARIO ───
function Inventario({ data, setData }) {
  const UNIDADES = ["g","kg","ml","l","unidad","lb","oz"];

  // ── Inventario state ──
  const [showInvForm, setShowInvForm] = useState(false);
  const [editInv, setEditInv] = useState(null);
  const [invForm, setInvForm] = useState({ nombre:"", cantidad:"", cantidad_comprada:"", unidad:"g", precio_total:"", minimo:"" });

  // ── Recetario state ──
  const [showRecetaForm, setShowRecetaForm] = useState(false);
  const [editReceta, setEditReceta] = useState(null);
  const [recetaForm, setRecetaForm] = useState({ nombre:"", precio_venta:"", ingredientes:[{ inv_id:"", cantidad:"", unidad:"g" }] });

  // ── Producción state ──
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodForm, setProdForm] = useState({ receta_id:"", cantidad:"", fecha:todayStr(), notas:"" });
  const [showProdLog, setShowProdLog] = useState(false);

  // ─── Costo por tortilla ───
  const calcCostoReceta = (receta) => {
    return receta.ingredientes.reduce((total, ing) => {
      const inv = data.inventario.find(i=>i.id===ing.inv_id);
      if (!inv || !inv.precio_total) return total;
      const baseQty = inv.cantidad_comprada || inv.cantidad;
      if (!baseQty) return total;
      const precioPorUnidad = inv.precio_total / baseQty;
      return total + (precioPorUnidad * Number(ing.cantidad));
    }, 0);
  };

  // ─── Inventario CRUD ───
  const saveInv = async () => {
    if (!invForm.nombre.trim()||!invForm.cantidad) return;
    const item = { ...invForm, cantidad:Number(invForm.cantidad), cantidad_comprada:Number(invForm.cantidad_comprada)||Number(invForm.cantidad), precio_total:Number(invForm.precio_total)||0, minimo:Number(invForm.minimo)||0 };
    if (editInv) {
      await supabase.from("inventario").update({ nombre:item.nombre, cantidad:item.cantidad, cantidad_comprada:item.cantidad_comprada, unidad:item.unidad, precio_total:item.precio_total, minimo:item.minimo }).eq("id", editInv.id);
      setData(d=>({...d, inventario:d.inventario.map(i=>i.id===editInv.id?{...i,...item}:i)}));
    } else {
      const newItem = {...item, id:generateId()};
      await supabase.from("inventario").insert({ id:newItem.id, nombre:newItem.nombre, cantidad:newItem.cantidad, cantidad_comprada:newItem.cantidad_comprada, unidad:newItem.unidad, precio_total:newItem.precio_total, minimo:newItem.minimo });
      setData(d=>({...d, inventario:[...d.inventario, newItem]}));
    }
    setShowInvForm(false); setEditInv(null);
    setInvForm({ nombre:"", cantidad:"", cantidad_comprada:"", unidad:"g", precio_total:"", minimo:"" });
  };
  const deleteInv = async (id) => { if (!window.confirm("¿Eliminar este ingrediente?")) return; await supabase.from("inventario").delete().eq("id", id); setData(d=>({...d, inventario:d.inventario.filter(i=>i.id!==id)})); };
  const openEditInv = (inv) => { setInvForm({nombre:inv.nombre,cantidad:String(inv.cantidad),cantidad_comprada:String(inv.cantidad_comprada||inv.cantidad),unidad:inv.unidad,precio_total:String(inv.precio_total),minimo:String(inv.minimo)}); setEditInv(inv); setShowInvForm(true); };

  // ─── Receta CRUD ───
  const addIngrediente = () => setRecetaForm(f=>({...f, ingredientes:[...f.ingredientes,{inv_id:"",cantidad:"",unidad:"g"}]}));
  const removeIngrediente = (i) => setRecetaForm(f=>({...f, ingredientes:f.ingredientes.filter((_,idx)=>idx!==i)}));
  const updateIngrediente = (i,k,v) => setRecetaForm(f=>{ const ings=[...f.ingredientes]; ings[i]={...ings[i],[k]:v}; return {...f,ingredientes:ings}; });

  const saveReceta = async () => {
    if (!recetaForm.nombre.trim()||!recetaForm.precio_venta) return;
    const receta = { ...recetaForm, precio_venta:Number(recetaForm.precio_venta), ingredientes:recetaForm.ingredientes.filter(i=>i.inv_id&&i.cantidad).map(i=>({...i,cantidad:Number(i.cantidad)})) };
    if (editReceta) {
      await supabase.from("recetas").update({ nombre:receta.nombre, precio_venta:Number(receta.precio_venta), ingredientes:receta.ingredientes }).eq("id", editReceta.id);
      setData(d=>({...d, recetas:d.recetas.map(r=>r.id===editReceta.id?{...r,...receta}:r)}));
    } else {
      const newR = {...receta, id:generateId()};
      await supabase.from("recetas").insert({ id:newR.id, nombre:newR.nombre, precio_venta:Number(newR.precio_venta), ingredientes:newR.ingredientes });
      setData(d=>({...d, recetas:[...d.recetas, newR]}));
    }
    setShowRecetaForm(false); setEditReceta(null);
    setRecetaForm({ nombre:"", precio_venta:"", ingredientes:[{inv_id:"",cantidad:"",unidad:"g"}] });
  };
  const deleteReceta = async (id) => { if (!window.confirm("¿Eliminar esta receta?")) return; await supabase.from("recetas").delete().eq("id", id); setData(d=>({...d, recetas:d.recetas.filter(r=>r.id!==id)})); };
  const openEditReceta = (r) => { setRecetaForm({nombre:r.nombre,precio_venta:String(r.precio_venta),ingredientes:r.ingredientes.map(i=>({...i,cantidad:String(i.cantidad)}))}); setEditReceta(r); setShowRecetaForm(true); };

  // ─── Producción: descontar inventario ───
  const registrarProduccion = async () => {
    const receta = data.recetas.find(r=>r.id===prodForm.receta_id);
    if (!receta||!prodForm.cantidad||Number(prodForm.cantidad)<=0) return;
    const cant = Number(prodForm.cantidad);
    // Descontar ingredientes del inventario
    const newInv = data.inventario.map(inv=>{
      const ing = receta.ingredientes.find(i=>i.inv_id===inv.id);
      if (!ing) return inv;
      return { ...inv, cantidad: Math.max(0, inv.cantidad - (ing.cantidad * cant)) };
    });
    // Guardar log de producción
    const newProd = { id:generateId(), receta_id:prodForm.receta_id, receta_nombre:receta.nombre, cantidad:cant, fecha:prodForm.fecha, notas:prodForm.notas };
    await Promise.all([
      supabase.from("producciones").insert(newProd),
      ...newInv.filter(inv => { const orig = data.inventario.find(o=>o.id===inv.id); return orig && inv.cantidad !== orig.cantidad; })
        .map(inv => supabase.from("inventario").update({cantidad: inv.cantidad}).eq("id", inv.id))
    ]);
    setData(d=>({...d, inventario:newInv, producciones:[...(d.producciones||[]), newProd]}));
    setShowProdForm(false);
    setProdForm({ receta_id:"", cantidad:"", fecha:todayStr(), notas:"" });
  };

  const stockBajo = data.inventario.filter(i=>i.cantidad<=i.minimo);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-stone-800 m-0">Inventario</h1>

      {/* Alerta stock bajo */}
      {stockBajo.length>0&&(
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start">
          <div className="text-amber-600 flex-shrink-0 mt-0.5"><I.Alert/></div>
          <div>
            <p className="text-sm font-bold text-amber-800 m-0">⚠️ Stock bajo</p>
            <p className="text-xs text-amber-700 mt-1 m-0">{stockBajo.map(i=>`${i.nombre} (${i.cantidad}${i.unidad})`).join(", ")}</p>
          </div>
        </div>
      )}

      {/* ── SECCIÓN: Ingredientes ── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Ingredientes en stock</p>
          <BtnPrimary onClick={()=>{setEditInv(null);setInvForm({nombre:"",cantidad:"",unidad:"g",precio_total:"",minimo:""});setShowInvForm(true);}}><I.Plus/>Agregar</BtnPrimary>
        </div>
        {data.inventario.length===0
          ? <p className="text-stone-400 text-sm text-center py-6 m-0">Sin ingredientes registrados</p>
          : <div className="divide-y divide-stone-50">
              {data.inventario.map(inv=>{
                const bajo = inv.cantidad<=inv.minimo;
                const precioPorU = inv.cantidad>0 ? inv.precio_total/inv.cantidad : 0;
                return (
                  <div key={inv.id} className={`px-4 py-3 ${bajo?"bg-amber-50/50":""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-800 m-0">{inv.nombre}</p>
                        <p className="text-xs text-stone-400 m-0">{inv.cantidad}{inv.unidad} disponibles · {formatMoney(Math.round(precioPorU))}/{inv.unidad}</p>
                        {bajo&&<p className="text-[10px] text-amber-600 font-semibold m-0">⚠ Stock bajo (mín: {inv.minimo}{inv.unidad})</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <p className="text-sm font-bold text-stone-700 m-0">{formatMoney(inv.precio_total)}</p>
                        <button onClick={()=>openEditInv(inv)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 ml-1"><I.Edit/></button>
                        <button onClick={()=>deleteInv(inv.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><I.Trash/></button>
                      </div>
                    </div>
                    {/* Barra de stock */}
                    {inv.minimo>0&&(
                      <div className="mt-2">
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bajo?"bg-amber-400":"bg-emerald-400"}`} style={{width:`${Math.min(100,Math.round((inv.cantidad/Math.max(inv.cantidad_comprada||inv.cantidad,1))*100))}%`}}/>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* ── SECCIÓN: Recetario ── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Recetario</p>
          <BtnPrimary onClick={()=>{setEditReceta(null);setRecetaForm({nombre:"",precio_venta:"",ingredientes:[{inv_id:"",cantidad:"",unidad:"g"}]});setShowRecetaForm(true);}}><I.Plus/>Nueva receta</BtnPrimary>
        </div>
        {data.recetas.length===0
          ? <p className="text-stone-400 text-sm text-center py-6 m-0">Sin recetas registradas</p>
          : <div className="divide-y divide-stone-50">
              {data.recetas.map(r=>{
                const costo = calcCostoReceta(r);
                const margen = r.precio_venta>0 ? Math.round(((r.precio_venta-costo)/r.precio_venta)*100) : 0;
                return (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-800 m-0">🫓 {r.nombre}</p>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-emerald-600 font-semibold">Precio: {formatMoney(r.precio_venta)}</span>
                          <span className="text-xs text-stone-400">Costo: {formatMoney(Math.round(costo))}</span>
                          <span className={`text-xs font-semibold ${margen>30?"text-emerald-600":margen>10?"text-amber-600":"text-red-500"}`}>Margen: {margen}%</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.ingredientes.map((ing,i)=>{
                            const inv = data.inventario.find(inv=>inv.id===ing.inv_id);
                            return <span key={i} className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-full">{ing.cantidad}{ing.unidad} {inv?.nombre||"?"}</span>;
                          })}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2 flex-shrink-0">
                        <button onClick={()=>openEditReceta(r)} className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"><I.Edit/></button>
                        <button onClick={()=>deleteReceta(r.id)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><I.Trash/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* ── SECCIÓN: Registrar producción ── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Producción de tortillas</p>
          <BtnPrimary onClick={()=>setShowProdForm(true)}><I.Plus/>Registrar</BtnPrimary>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-stone-400 m-0">Al registrar producción, los ingredientes de la receta se descuentan automáticamente del inventario.</p>
        </div>
        {/* Log colapsable */}
        {(data.producciones||[]).length>0&&(
          <div className="border-t border-stone-100">
            <button onClick={()=>setShowProdLog(!showProdLog)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-stone-50">
              <span className="text-xs text-stone-500 font-medium">Historial de producción</span>
              <div className="flex items-center gap-1 text-stone-400"><span className="text-xs">{(data.producciones||[]).length}</span><I.ChevDown/></div>
            </button>
            {showProdLog&&(
              <div className="divide-y divide-stone-50 border-t border-stone-100">
                {[...(data.producciones||[])].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(p=>(
                  <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-800 m-0">{p.cantidad}x {p.receta_nombre}</p>
                      <p className="text-xs text-stone-400 m-0">{formatDate(p.fecha)}{p.notas?` · ${p.notas}`:""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Ingrediente */}
      <Modal open={showInvForm} onClose={()=>setShowInvForm(false)} title={editInv?"Editar ingrediente":"Nuevo ingrediente"}>
        <div className="flex flex-col gap-3">
          <FieldInput label="Nombre" placeholder="Ej: Harina de maíz" value={invForm.nombre} onChange={e=>setInvForm(f=>({...f,nombre:e.target.value}))}/>
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect label="Unidad" value={invForm.unidad} onChange={e=>setInvForm(f=>({...f,unidad:e.target.value}))}>
              {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
            </FieldSelect>
            <FieldInput label={`Cantidad comprada (${invForm.unidad})`} type="number" placeholder="0" value={invForm.cantidad_comprada} onChange={e=>setInvForm(f=>({...f,cantidad_comprada:e.target.value}))}/>
          </div>
          <FieldInput label="Costo total de lo comprado (₡)" type="number" placeholder="0" value={invForm.precio_total} onChange={e=>setInvForm(f=>({...f,precio_total:e.target.value}))}/>
          <FieldInput label={`Cantidad actual en stock (${invForm.unidad})`} type="number" placeholder="0" value={invForm.cantidad} onChange={e=>setInvForm(f=>({...f,cantidad:e.target.value}))}/>
          <FieldInput label={`Stock mínimo (${invForm.unidad}) para alertas`} type="number" placeholder="0" value={invForm.minimo} onChange={e=>setInvForm(f=>({...f,minimo:e.target.value}))}/>
          {invForm.cantidad_comprada&&invForm.precio_total&&(
            <div className="bg-amber-50 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700 font-semibold m-0">Precio por {invForm.unidad}: {formatMoney(Math.round(Number(invForm.precio_total)/Number(invForm.cantidad_comprada)))}</p>
            </div>
          )}
          <BtnPrimary onClick={saveInv} disabled={!invForm.nombre||!invForm.cantidad} className="w-full">Guardar</BtnPrimary>
        </div>
      </Modal>

      {/* Modal: Receta */}
      <Modal open={showRecetaForm} onClose={()=>setShowRecetaForm(false)} title={editReceta?"Editar receta":"Nueva receta"}>
        <div className="flex flex-col gap-4">
          <FieldInput label="Nombre de la receta" placeholder="Ej: Tortilla con chicharrón" value={recetaForm.nombre} onChange={e=>setRecetaForm(f=>({...f,nombre:e.target.value}))}/>
          <FieldInput label="Precio de venta (₡)" type="number" placeholder="0" value={recetaForm.precio_venta} onChange={e=>setRecetaForm(f=>({...f,precio_venta:e.target.value}))}/>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Ingredientes</label>
            {recetaForm.ingredientes.map((ing,i)=>(
              <div key={i} className="bg-stone-50 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <select className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-500 bg-white text-stone-800"
                    value={ing.inv_id} onChange={e=>{
                      const inv = data.inventario.find(inv=>inv.id===e.target.value);
                      updateIngrediente(i,"inv_id",e.target.value);
                      if (inv) updateIngrediente(i,"unidad",inv.unidad);
                    }}>
                    <option value="">Seleccionar ingrediente...</option>
                    {data.inventario.map(inv=><option key={inv.id} value={inv.id}>{inv.nombre} ({inv.unidad})</option>)}
                  </select>
                  {recetaForm.ingredientes.length>1&&<button onClick={()=>removeIngrediente(i)} className="text-red-400 flex-shrink-0"><I.Trash/></button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput label="Cantidad" type="number" placeholder="0" value={ing.cantidad} onChange={e=>updateIngrediente(i,"cantidad",e.target.value)}/>
                  <FieldSelect label="Unidad" value={ing.unidad} onChange={e=>updateIngrediente(i,"unidad",e.target.value)}>
                    {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
                  </FieldSelect>
                </div>
              </div>
            ))}
            <button onClick={addIngrediente} className="text-sm text-amber-600 font-medium flex items-center gap-1 hover:text-amber-700"><I.Plus/>Agregar ingrediente</button>
          </div>

          {/* Preview costo */}
          {recetaForm.precio_venta&&(
            <div className="bg-stone-50 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Costo estimado</span>
                <span className="font-semibold text-stone-700">{formatMoney(Math.round(calcCostoReceta(recetaForm)))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Precio de venta</span>
                <span className="font-semibold text-emerald-600">{formatMoney(Number(recetaForm.precio_venta))}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-stone-200">
                <span className="font-medium text-stone-700">Ganancia por unidad</span>
                <span className="font-bold text-amber-600">{formatMoney(Number(recetaForm.precio_venta)-Math.round(calcCostoReceta(recetaForm)))}</span>
              </div>
            </div>
          )}
          <BtnPrimary onClick={saveReceta} disabled={!recetaForm.nombre||!recetaForm.precio_venta} className="w-full">Guardar receta</BtnPrimary>
        </div>
      </Modal>

      {/* Modal: Producción */}
      <Modal open={showProdForm} onClose={()=>setShowProdForm(false)} title="Registrar producción">
        <div className="flex flex-col gap-4">
          <FieldSelect label="Receta" value={prodForm.receta_id} onChange={e=>setProdForm(f=>({...f,receta_id:e.target.value}))}>
            <option value="">Seleccionar receta...</option>
            {data.recetas.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}
          </FieldSelect>
          <FieldInput label="Cantidad de tortillas" type="number" placeholder="Ej: 20" value={prodForm.cantidad} onChange={e=>setProdForm(f=>({...f,cantidad:e.target.value}))}/>
          <FieldInput label="Fecha" type="date" value={prodForm.fecha} onChange={e=>setProdForm(f=>({...f,fecha:e.target.value}))}/>
          <FieldInput label="Notas (opcional)" placeholder="Ej: Lote de la mañana" value={prodForm.notas} onChange={e=>setProdForm(f=>({...f,notas:e.target.value}))}/>
          {prodForm.receta_id&&prodForm.cantidad&&(()=>{
            const rec = data.recetas.find(r=>r.id===prodForm.receta_id);
            if (!rec) return null;
            return (
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider m-0 mb-2">Se descontará del inventario:</p>
                {rec.ingredientes.map((ing,i)=>{
                  const inv = data.inventario.find(v=>v.id===ing.inv_id);
                  const total = ing.cantidad * Number(prodForm.cantidad);
                  return <p key={i} className="text-xs text-stone-600 m-0">• {total}{ing.unidad} de {inv?.nombre||"?"}</p>;
                })}
              </div>
            );
          })()}
          <BtnPrimary onClick={registrarProduccion} disabled={!prodForm.receta_id||!prodForm.cantidad||Number(prodForm.cantidad)<=0} className="w-full">
            <I.Check/> Registrar producción
          </BtnPrimary>
        </div>
      </Modal>
    </div>
  );
}

// ─── CONFIGURACIÓN ───
function Configuracion({ onLogout, currentUser, reminders, setReminders }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [editHora, setEditHora] = useState("");
  const [showNewReminder, setShowNewReminder] = useState(false);
  const [newR, setNewR] = useState({ nombre:"", horaH:"09", horaM:"00", mensaje:"", tipo:"diario", diasSemana:[], cadaNDias:"7", fechaInicio:todayStr() });

  const DIAS_SEMANA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  const toggleDia = (d) => setNewR(prev=>({...prev, diasSemana:prev.diasSemana.includes(d)?prev.diasSemana.filter(x=>x!==d):[...prev.diasSemana,d]}));

  const addReminder = async () => {
    if (!newR.nombre.trim()) return;
    const newReminder = { id:generateId(), nombre:newR.nombre.trim(), hora:`${newR.horaH}:${newR.horaM}`, activo:true, mensaje:newR.mensaje.trim()||newR.nombre.trim(), tipo:newR.tipo, diasSemana:newR.diasSemana, cadaNDias:Number(newR.cadaNDias)||7, fechaInicio:newR.fechaInicio||todayStr() };
    const { error } = await supabase.from("recordatorios").insert({
      id: newReminder.id, nombre: newReminder.nombre, hora: newReminder.hora,
      activo: newReminder.activo, mensaje: newReminder.mensaje, tipo: newReminder.tipo,
      dias_semana: newReminder.diasSemana, cada_n_dias: newReminder.cadaNDias,
      fecha_inicio: newReminder.fechaInicio,
    });
    if (error) { alert("Error guardando recordatorio: " + error.message); return; }
    setReminders(prev=>[...prev, newReminder]);
    setNewR({ nombre:"", horaH:"09", horaM:"00", mensaje:"", tipo:"diario", diasSemana:[], cadaNDias:"7", fechaInicio:todayStr() });
    setShowNewReminder(false);
  };

  const deleteReminder = async (id) => { await supabase.from("recordatorios").delete().eq("id", id); setReminders(prev=>prev.filter(r=>r.id!==id)); };
  const toggleReminder = async (id) => { const r = reminders.find(r=>r.id===id); if (!r) return; await supabase.from("recordatorios").update({activo: !r.activo}).eq("id", id); setReminders(prev=>prev.map(r=>r.id===id?{...r,activo:!r.activo}:r)); };
  const startEdit = (r) => { setEditingReminder(r.id); setEditHora(r.hora); };
  const saveEdit = async (id) => { if (!editHora) return; await supabase.from("recordatorios").update({hora: editHora}).eq("id", id); setReminders(prev=>prev.map(r=>r.id===id?{...r,hora:editHora}:r)); setEditingReminder(null); };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-stone-800 m-0">Configuración</h1>

      {/* Cuenta */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100"><p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Cuenta</p></div>
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">{currentUser.charAt(0).toUpperCase()}</div>
          <div><p className="font-semibold text-stone-800 m-0">{currentUser}</p><p className="text-xs text-stone-400 m-0">Administrador</p></div>
        </div>
        <div className="border-t border-stone-100">
          <button onClick={()=>setShowLogoutConfirm(true)} className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-red-50 transition-colors">
            <I.LogOut/><span className="text-sm font-medium text-red-600">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Recordatorios */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Recordatorios en app</p>
        </div>
        <div className="divide-y divide-stone-50">
          {reminders.map(r=>(
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 m-0">{r.nombre}</p>
                  <p className="text-xs text-stone-400 mt-0.5 truncate m-0">{r.mensaje}</p>
                </div>
                <button onClick={()=>toggleReminder(r.id)}
                  className={`w-10 h-5 rounded-full relative flex-shrink-0 mt-0.5 transition-colors ${r.activo?"bg-amber-500":"bg-stone-200"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.activo?"translate-x-5":"translate-x-0.5"}`}/>
                </button>
              </div>
              {editingReminder===r.id ? (
                <div className="flex gap-2 mt-2 items-center">
                  <input type="time" value={editHora} onChange={e=>setEditHora(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-sm outline-none focus:border-amber-500"/>
                  <button onClick={()=>saveEdit(r.id)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium">Guardar</button>
                  <button onClick={()=>setEditingReminder(null)} className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs font-medium">Cancelar</button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-1.5">
                  <button onClick={()=>startEdit(r)} className={`flex items-center gap-1.5 text-xs ${r.activo?"text-amber-600":"text-stone-400"}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {r.hora} · {!r.tipo||r.tipo==="diario"?"diario":r.tipo==="diasSemana"?DIAS_SEMANA.filter((_,i)=>r.diasSemana?.includes(i)).join(", ")||"sin días":`cada ${r.cadaNDias}d`} · {r.activo?"activo":"inactivo"}
                  </button>
                  <button onClick={()=>deleteReminder(r.id)} className="p-1 rounded-lg hover:bg-red-50 text-stone-300 hover:text-red-400"><I.Trash/></button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-stone-100 flex flex-col gap-3">
          {!showNewReminder ? (
            <button onClick={()=>setShowNewReminder(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-stone-300 text-stone-500 text-xs font-medium hover:bg-stone-50">
              <I.Plus/> Agregar recordatorio
            </button>
          ) : (
            <div className="bg-stone-50 rounded-xl p-3 flex flex-col gap-3">
              <p className="text-xs font-semibold text-stone-600 m-0">Nuevo recordatorio</p>
              <FieldInput label="Nombre" placeholder="Ej: Registro de producción" value={newR.nombre} onChange={e=>setNewR({...newR,nombre:e.target.value})}/>
              <FieldInput label="Mensaje" placeholder="Descripción del recordatorio" value={newR.mensaje} onChange={e=>setNewR({...newR,mensaje:e.target.value})}/>
              <div className="grid grid-cols-2 gap-2">
                <FieldInput label="Hora" type="number" min="0" max="23" placeholder="HH" value={newR.horaH} onChange={e=>setNewR({...newR,horaH:String(e.target.value).padStart(2,"0")})}/>
                <FieldInput label="Minutos" type="number" min="0" max="59" placeholder="MM" value={newR.horaM} onChange={e=>setNewR({...newR,horaM:String(e.target.value).padStart(2,"0")})}/>
              </div>
              <FieldSelect label="Frecuencia" value={newR.tipo} onChange={e=>setNewR({...newR,tipo:e.target.value})}>
                <option value="diario">Diario</option>
                <option value="diasSemana">Días específicos</option>
                <option value="cadaNDias">Cada N días</option>
              </FieldSelect>
              {newR.tipo==="diasSemana"&&(
                <div>
                  <label className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">Días</label>
                  <div className="flex gap-1 flex-wrap">
                    {DIAS_SEMANA.map((d,i)=>(
                      <button key={i} type="button" onClick={()=>toggleDia(i)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${newR.diasSemana.includes(i)?"bg-amber-500 text-white":"bg-stone-200 text-stone-600"}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {newR.tipo==="cadaNDias"&&(
                <FieldInput label="Cada cuántos días" type="number" min="1" value={newR.cadaNDias} onChange={e=>setNewR({...newR,cadaNDias:e.target.value})}/>
              )}
              <div className="flex gap-2">
                <button onClick={()=>setShowNewReminder(false)} className="flex-1 py-2 bg-stone-100 rounded-xl text-xs font-medium text-stone-600">Cancelar</button>
                <button onClick={addReminder} disabled={!newR.nombre.trim()||(newR.tipo==="diasSemana"&&newR.diasSemana.length===0)}
                  className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-xs font-medium disabled:opacity-40">Guardar</button>
              </div>
            </div>
          )}
          <p className="text-xs text-stone-400 m-0">Los recordatorios son solo dentro de la app (sin push notifications).</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100"><p className="text-xs font-semibold text-stone-400 uppercase tracking-wider m-0">Información</p></div>
        <div className="px-4 py-4 flex flex-col gap-2">
          <div className="flex justify-between"><span className="text-sm text-stone-500">App</span><span className="text-sm font-medium text-stone-700">QueTortillApp</span></div>
          <div className="flex justify-between"><span className="text-sm text-stone-500">Versión</span><span className="text-sm font-medium text-stone-700">v1.0</span></div>
        </div>
      </div>

      {showLogoutConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setShowLogoutConfirm(false)}>
          <div className="fixed inset-0 bg-black/40"/>
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800 mb-2 m-0">¿Cerrar sesión?</h3>
            <p className="text-sm text-stone-500 mb-4 m-0">Vas a salir de tu cuenta.</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowLogoutConfirm(false)} className="flex-1 py-2.5 bg-stone-100 rounded-xl text-sm font-medium text-stone-700">Cancelar</button>
              <button onClick={onLogout} className="flex-1 py-2.5 bg-red-500 rounded-xl text-sm font-medium text-white">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notif Panel (mejorado: 3 categorías) ───
function NotifPanel({ pedidos, pagos, onClose }) {
  const now = new Date();
  const withDiff = pedidos
    .filter(p=>!["cancelado","pagado","entregado"].includes(getOrderStatus(p,pagos)))
    .map(p=>{ const e=new Date(p.fecha_entrega+"T"+(p.hora_entrega||"23:59")+":00"); return {...p, diffH:(e-now)/3600000}; })
    .filter(p=>p.diffH>=0&&p.diffH<=48)
    .sort((a,b)=>a.diffH-b.diffH);

  const dentro1h  = withDiff.filter(p=>p.diffH<=1);
  const dentro24h = withDiff.filter(p=>p.diffH>1&&p.diffH<=24);
  const dentro48h = withDiff.filter(p=>p.diffH>24&&p.diffH<=48);

  const fmtDiff = (h) => h<1?`${Math.round(h*60)} min`:h<24?`${Math.round(h)}h`:`${Math.round(h/24)}d`;

  const CardPedido = ({p, colorBg, colorBorder, colorText}) => (
    <div className={`${colorBg} rounded-xl p-3 border ${colorBorder}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-stone-800 m-0">{p.cliente_nombre}</p>
          <p className="text-xs text-stone-500 mt-0.5 m-0">{p.detalles.map(d=>`${d.cantidad}x ${d.nombre}`).join(", ")}</p>
          <p className={`text-xs font-medium mt-1 m-0 ${colorText}`}>{formatDate(p.fecha_entrega)}{p.hora_entrega?" · "+p.hora_entrega:""}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-xl ${colorBg} ${colorText} border ${colorBorder} flex-shrink-0 ml-2 whitespace-nowrap`}>
          {fmtDiff(p.diffH)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-stone-100 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-stone-800 m-0">🔔 Notificaciones</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400"><I.X/></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {withDiff.length===0&&<p className="text-center text-stone-400 py-8 m-0">Sin entregas en las próximas 48 horas</p>}
          {dentro1h.length>0&&(
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 m-0">🔴 Menos de 1 hora</p>
              <div className="flex flex-col gap-2">{dentro1h.map(p=><CardPedido key={p.id} p={p} colorBg="bg-red-50" colorBorder="border-red-200" colorText="text-red-600"/>)}</div>
            </div>
          )}
          {dentro24h.length>0&&(
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 m-0">🟡 Próximas 24 horas</p>
              <div className="flex flex-col gap-2">{dentro24h.map(p=><CardPedido key={p.id} p={p} colorBg="bg-amber-50" colorBorder="border-amber-200" colorText="text-amber-600"/>)}</div>
            </div>
          )}
          {dentro48h.length>0&&(
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 m-0">⚪ Mañana (24–48h)</p>
              <div className="flex flex-col gap-2">{dentro48h.map(p=><CardPedido key={p.id} p={p} colorBg="bg-stone-50" colorBorder="border-stone-200" colorText="text-stone-500"/>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Login ───
function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-2" style={{maxWidth:280}}><img src="/IconoBanner.jpg" alt="QueTortillApp" style={{width:"100%",objectFit:"contain",mixBlendMode:"multiply"}}/></div>
          <p className="text-sm text-stone-400 mt-1">Gestión de tu emprendimiento</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 flex flex-col gap-4">
          <p className="text-center text-sm text-stone-500 m-0">Hola, Tony 👋</p>
          <button onClick={()=>onLogin("Tony")} className="w-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-semibold py-3 rounded-xl">
            Ingresar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ───
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [page, setPage] = useState("dashboard");
  const [showNotif, setShowNotif] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [data, setData] = useState({
    clientes: [],
    pedidos: [],
    pagos: [],
    gastos: [],
    inventario: [],
    recetas: [],
    expenseCats: INITIAL_EXPENSE_CATS,
    producciones: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loggedIn) return;
    const loadAll = async () => {
      setLoading(true);
      try {
        const [c, pe, pa, g, inv, rec, prod, rem] = await Promise.all([
          supabase.from("clientes").select("*").order("created_at"),
          supabase.from("pedidos").select("*").order("created_at"),
          supabase.from("pagos").select("*").order("created_at"),
          supabase.from("gastos").select("*").order("created_at"),
          supabase.from("inventario").select("*").order("created_at"),
          supabase.from("recetas").select("*").order("created_at"),
          supabase.from("producciones").select("*").order("created_at"),
          supabase.from("recordatorios").select("*").order("created_at"),
        ]);
        setData(d => ({
          ...d,
          clientes: c.data || [],
          pedidos: (pe.data || []).map(p => ({ ...p, detalles: p.items || [] })),
          pagos: pa.data || [],
          gastos: g.data || [],
          inventario: inv.data || [],
          recetas: (rec.data || []).map(r => ({ ...r, ingredientes: r.ingredientes || [] })),
          producciones: prod.data || [],
        }));
        setReminders((rem.data || []).map(r => ({
          ...r,
          diasSemana: r.dias_semana || [],
          cadaNDias: r.cada_n_dias || 7,
          fechaInicio: r.fecha_inicio || "",
        })));
      } catch(e) { console.error("Error cargando datos:", e); }
      setLoading(false);
    };
    loadAll();
  }, [loggedIn]);

  const upcomingOrders = useMemo(()=>{
    const n = new Date();
    return data.pedidos
      .filter(p=>!["cancelado","pagado"].includes(getOrderStatus(p,data.pagos)))
      .map(p=>{ const e=new Date(p.fecha_entrega+"T"+(p.hora_entrega||"23:59")+":00"); return {...p, diffH:(e-n)/3600000}; })
      .filter(p=>p.diffH>=0&&p.diffH<=48);
  },[data.pedidos,data.pagos]);

  const NAV = [
    {key:"dashboard",label:"Inicio",icon:I.Home},
    {key:"pedidos",label:"Pedidos",icon:I.Clipboard},
    {key:"clientes",label:"Clientes",icon:I.Users},
    {key:"pagos",label:"Pagos",icon:I.Dollar},
    {key:"gastos",label:"Gastos",icon:I.TrendDown},
    {key:"inventario",label:"Inventario",icon:I.Box},
    {key:"config",label:"Config",icon:I.Settings},
  ];

  if (!loggedIn) return <LoginScreen onLogin={u=>{setCurrentUser(u||"demo");setLoggedIn(true);}}/>;
  if (loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center flex-col gap-3">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"/>
      <p className="text-sm text-stone-400">Cargando datos...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-4 py-2 flex items-center gap-2 sticky top-0 z-40">
        <div className="flex-1 min-w-0">
          <img src="/IconoBanner.jpg" alt="QueTortillApp" style={{height:40,objectFit:"contain",objectPosition:"left",mixBlendMode:"multiply"}}/>
        </div>
        <div className="text-[10px] text-stone-400 leading-tight text-right flex-shrink-0"><span>Hola, {currentUser.split("@")[0]}</span></div>
        <a href="https://docs.google.com/forms/u/1/d/1iYp-GXjBaexlFkqVfpw-Hy_irssknkIylK4tOtg-GwQ/edit#response=ACYDBNh7gnsZJXz_MBEIP_gJPpY3FQi-kzhfQ3hQDIk3vdfaE8WL6cF15DyqmZMqVA" target="_blank" rel="noreferrer"
          className="flex items-center gap-1 px-2 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-medium hover:bg-amber-100 flex-shrink-0 whitespace-nowrap">
          📋 Respuestas formulario
        </a>
        <button onClick={()=>setShowNotif(true)} className="relative p-2 rounded-xl hover:bg-stone-100 text-stone-500 flex-shrink-0">
          <I.Bell/>
          {upcomingOrders.length>0 && (
            <span className={`absolute top-1 right-1 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center ${upcomingOrders.some(p=>p.diffH<=4)?"bg-red-500":"bg-amber-500"}`}>
              {upcomingOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-5 pb-28">
        {page==="dashboard"   && <Dashboard    data={data} setData={setData}/>}
        {page==="clientes"    && <Clientes     data={data} setData={setData}/>}
        {page==="pedidos"     && <Pedidos      data={data} setData={setData}/>}
        {page==="pagos"       && <Pagos        data={data} setData={setData}/>}
        {page==="gastos"      && <Gastos       data={data} setData={setData}/>}
        {page==="inventario"  && <Inventario   data={data} setData={setData}/>}
        {page==="config"      && <Configuracion onLogout={()=>{setLoggedIn(false);setCurrentUser("");setPage("dashboard");}} currentUser={currentUser} reminders={reminders} setReminders={setReminders}/>}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-1 z-40" style={{paddingBottom:"max(8px, env(safe-area-inset-bottom))"}}>
        <div className="flex justify-around">
          {NAV.map(({key,label,icon:Icon})=>(
            <button key={key} onClick={()=>setPage(key)}
              className={`flex flex-col items-center py-2 px-1 min-w-[40px] transition-colors ${page===key?"text-amber-600":"text-stone-400"}`}>
              <Icon/>
              <span className={`text-[9px] mt-0.5 ${page===key?"font-semibold":""}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {showNotif && <NotifPanel pedidos={data.pedidos} pagos={data.pagos} onClose={()=>setShowNotif(false)}/>}
    </div>
  );
}
