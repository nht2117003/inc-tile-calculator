"use strict";

// 모든 도형 길이는 0.1mm 정수. 화면 표시값으로 재계산하지 않습니다.
const MAX_PLACEMENTS = 20000;
const MAX_DRAWN = 2500;
function parseScaled(value, min, max, decimals, factor, name) {
  const input = String(value ?? "").trim();
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp("^(?:\\d+(?:\\.\\d{0," + decimals + "})?|\\.\\d{1," + decimals + "})$");
  if (!input || input.length > 16 || !pattern.test(input)) return { error: name + "을 " +
    (decimals ? "소수점 " + decimals + "자리까지 숫자로" : "정수로") + " 입력해 주세요." };
  const n = Number(input);
  if (!Number.isFinite(n) || n < min || n > max) return { error: min + "~" + max.toLocaleString("ko-KR") + " 범위로 입력해 주세요." };
  const [whole, fraction = ""] = input.split(".");
  const denominator = 10 ** decimals;
  const scaled = Number(whole || "0") * factor + Number(fraction.padEnd(decimals, "0") || "0") * (factor / denominator);
  return { value: scaled };
}
function axisPlacements(room, tile, joint, origin) {
  const pitch = tile + joint;
  let start = origin === "center" ? (room - tile) / 2 : 0;
  if (start > 0) start -= Math.ceil(start / pitch) * pitch;
  if (start + tile <= 0) start += (Math.floor((-start - tile) / pitch) + 1) * pitch;
  const positions = [];
  for (let p = start; p < room; p += pitch) {
    const visibleStart = Math.max(0, p);
    const end = Math.min(room, p + tile);
    if (end > visibleStart) positions.push({ start: p, visibleStart, size: end - visibleStart,
      whole: p >= 0 && p + tile <= room });
  }
  return positions;
}
function calculateLayout({ width = "", length = "", tileWidth = "600", tileLength = "300",
  joint = "2", origin = "corner", spare = "10", perBox = "" } = {}) {
  const errors = {};
  const w = parseScaled(width, .01, 100, 3, 10000, "바닥 가로 길이");
  const l = parseScaled(length, .01, 100, 3, 10000, "바닥 세로 길이");
  const tw = parseScaled(tileWidth, 10, 3000, 0, 10, "타일 가로 길이");
  const th = parseScaled(tileLength, 10, 3000, 0, 10, "타일 세로 길이");
  const j = parseScaled(joint, 0, 20, 1, 10, "줄눈 간격");
  const s = parseScaled(spare, 0, 30, 0, 1, "추가 여유");
  let b = null;
  if (String(perBox).trim()) b = parseScaled(perBox, 1, 1000, 0, 1, "박스당 장수");
  for (const [id, parsed] of [["width",w],["length",l],["tile-width",tw],["tile-length",th],["joint",j],["spare",s],["per-box",b]]) {
    if (parsed?.error) errors[id] = parsed.error;
  }
  if (!["corner", "center"].includes(origin)) errors.origin = "시작 기준을 다시 선택해 주세요.";
  if (Object.keys(errors).length) return { errors };
  const xs = axisPlacements(w.value, tw.value, j.value, origin);
  const ys = axisPlacements(l.value, th.value, j.value, origin);
  const base = xs.length * ys.length;
  if (base > MAX_PLACEMENTS) return { errors: { layout: "배치가 " + MAX_PLACEMENTS.toLocaleString("ko-KR") +
    "자리를 넘습니다. 바닥 범위를 줄이거나 더 큰 타일 규격으로 나눠 확인해 주세요." } };
  const whole = xs.filter(p=>p.whole).length * ys.filter(p=>p.whole).length;
  const cut = base - whole;
  const spareCount = Math.floor((base * s.value + 99) / 100);
  const required = base + spareCount;
  const boxes = b ? Math.floor((required + b.value - 1) / b.value) : null;
  const dimensions = positions => {
    const counts = new Map();
    for (const p of positions) counts.set(p.size, (counts.get(p.size) || 0) + 1);
    return counts;
  };
  const cutGroups = [];
  for (const [cw, nc] of dimensions(xs)) for (const [ch, nr] of dimensions(ys)) {
    if (cw === tw.value && ch === th.value) continue;
    cutGroups.push({ width: cw / 10, length: ch / 10, count: nc * nr });
  }
  cutGroups.sort((a,b)=>b.count-a.count || b.width-a.width || b.length-a.length);
  return { width: w.value/10000, length: l.value/10000, tileWidth:tw.value/10, tileLength:th.value/10,
    joint:j.value/10, origin, spare:s.value, perBox:b?.value ?? null,
    area:w.value*l.value/100000000, columns:xs.length, rows:ys.length,
    whole, cut, base, spareCount, required, boxes, purchaseTiles:boxes===null?null:boxes*b.value,
    xs, ys, roomUnits:{width:w.value,length:l.value}, cutGroups, draw:base<=MAX_DRAWN };
}
function setupCalculator() {
  const el = id => document.getElementById(id);
  const fmt = (n, places=0) => n.toLocaleString("ko-KR",{maximumFractionDigits:places});
  const area = n => n.toLocaleString("ko-KR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const NS = "http://www.w3.org/2000/svg";
  let current, revision=0, copying=false;
  function svgElement(tag, attrs={}, text) {
    const node=document.createElementNS(NS,tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
    if(text!==undefined) node.textContent=text;
    return node;
  }
  function draw(result) {
    el("diagram").replaceChildren();
    el("cut-list").replaceChildren();
    if (result.errors) {
      const message=document.createElement("p");
      message.textContent="입력값을 확인하면 여기에 배치 그림이 나타납니다.";
      el("diagram").append(message);
      el("diagram-status").textContent=result.errors.layout || "유효한 입력값이 필요합니다.";
      el("diagram").setAttribute("aria-label","입력값 오류로 배치 그림이 표시되지 않음");
      el("cut-details").hidden=true;
      return;
    }
    el("cut-details").hidden=false;
    for(const group of result.cutGroups) {
      const row=document.createElement("tr");
      for(const text of [fmt(group.width,1)+" × "+fmt(group.length,1)+" mm",fmt(group.count)+"개"]) {
        const cell=document.createElement("td");cell.textContent=text;row.append(cell);
      }
      el("cut-list").append(row);
    }
    if(!result.cutGroups.length) {
      const row=document.createElement("tr"),cell=document.createElement("td");
      cell.colSpan=2;cell.textContent="잘라 쓸 타일이 없습니다.";row.append(cell);el("cut-list").append(row);
    }
    const summary="그대로 쓰는 타일 "+fmt(result.whole)+"장, 잘라 쓰는 타일 "+fmt(result.cut)+"장.";
    el("diagram").setAttribute("aria-label",summary);
    if(!result.draw) {
      const message=document.createElement("p");
      message.textContent="배치가 "+MAX_DRAWN.toLocaleString("ko-KR")+"자리를 넘어 그림은 생략했습니다. 수량 계산과 조각 크기 표는 유효합니다.";
      el("diagram").append(message);
      el("diagram-status").textContent=summary+" 그림 생략.";
      return;
    }
    const svg=svgElement("svg",{viewBox:"0 0 900 620",role:"img","aria-labelledby":"layout-svg-title layout-svg-description"});
    svg.append(svgElement("title",{id:"layout-svg-title"},"타일 배치 미리보기"));
    svg.append(svgElement("desc",{id:"layout-svg-description"},summary+" 위쪽이 가로 방향이며 초록색은 그대로 쓰는 타일, 주황색은 잘라 쓰는 타일입니다."));
    const rw=result.roomUnits.width,rh=result.roomUnits.length;
    const scale=Math.min(780/rw,490/rh);
    const ox=(900-rw*scale)/2,oy=65+(490-rh*scale)/2;
    svg.append(svgElement("rect",{x:ox,y:oy,width:rw*scale,height:rh*scale,fill:"#ebe9df"}));
    for(const y of result.ys)for(const x of result.xs) {
      const whole=x.whole&&y.whole;
      const rect=svgElement("rect",{x:ox+x.visibleStart*scale,y:oy+y.visibleStart*scale,
        width:x.size*scale,height:y.size*scale,fill:whole?"#437765":"#d79b54",
        stroke:whole?"#2e5a49":"#9a6632","stroke-width":.35,"data-kind":whole?"whole":"cut"});
      rect.append(svgElement("title",{},(whole?"그대로 사용":"잘라 사용")+" · "+fmt(x.size/10,1)+" × "+fmt(y.size/10,1)+"mm"));
      svg.append(rect);
    }
    svg.append(svgElement("rect",{x:ox,y:oy,width:rw*scale,height:rh*scale,fill:"none",stroke:"#253b35","stroke-width":1.4}));
    const label={"font-family":"Malgun Gothic, sans-serif","font-size":18,fill:"#253b35","text-anchor":"middle"};
    svg.append(svgElement("text",{...label,x:450,y:38},"가로 "+fmt(result.width,3)+"m"));
    svg.append(svgElement("text",{...label,x:450,y:595},"세로 "+fmt(result.length,3)+"m · "+(result.origin==="corner"?"왼쪽 위 모서리 기준":"가운데 타일 기준")));
    el("diagram").append(svg);
    el("diagram-status").textContent=fmt(result.columns)+"열 × "+fmt(result.rows)+"행. "+summary+" 추가 여유분은 그림에 표시하지 않습니다.";
  }
  function update() {
    revision++;
    el("copy-status").textContent="";el("manual-copy").hidden=true;el("copy-text").value="";
    current=calculateLayout({width:el("width").value,length:el("length").value,
      tileWidth:el("tile-width").value,tileLength:el("tile-length").value,joint:el("joint").value,
      origin:el("origin").value,spare:el("spare").value,perBox:el("per-box").value});
    for(const id of ["width","length","tile-width","tile-length","joint","spare","per-box"]) {
      el(id+"-error").textContent=current.errors?.[id]||"";
      el(id).setAttribute("aria-invalid",String(Boolean(current.errors?.[id])));
    }
    const valid=!current.errors;
    el("copy").disabled=!valid||copying;
    for(const [id,key]of[["quantity","required"],["whole","whole"],["cut","cut"],["base","base"],["spare-count","spareCount"]])
      el(id).textContent=valid?fmt(current[key]):"—";
    el("area-result").textContent=valid?area(current.area):"—";
    el("purchase").hidden=!valid||current.boxes===null;
    el("boxes").textContent=valid&&current.boxes!==null?fmt(current.boxes):"—";
    el("purchase-description").textContent=valid&&current.boxes!==null?
      "한 박스 "+fmt(current.perBox)+"장 · 총 "+fmt(current.purchaseTiles)+"장 구매 (준비 수량보다 "+fmt(current.purchaseTiles-current.required)+"장 많음)":"";
    el("result-description").textContent=valid?
      "배치 "+fmt(current.base)+"장에 추가 여유 "+current.spare+"%("+fmt(current.spareCount)+"장)를 더했습니다. 자투리는 재사용하지 않습니다.":
      (current.errors.layout||current.errors.origin||"바닥 크기와 타일 규격을 확인해 주세요.");
    draw(current);
  }
  function legacyCopy(text) {
    const focus=document.activeElement;
    el("manual-copy").hidden=false;el("copy-text").value=text;el("copy-text").focus();el("copy-text").select();
    let success=false;try{success=document.execCommand("copy");}catch(_){}
    if(success){el("manual-copy").hidden=true;focus?.focus();}return success;
  }
  el("copy").addEventListener("click",async()=>{
    if(!current||current.errors||copying)return;
    const r=current;
    const lines=["타일 배치 계산 결과","바닥: "+r.width+"m × "+r.length+"m ("+area(r.area)+"㎡)",
      "타일: "+r.tileWidth+" × "+r.tileLength+"mm · 줄눈: "+r.joint+"mm",
      "시작 기준: "+(r.origin==="corner"?"왼쪽 위 모서리":"가운데 타일 한 장"),
      "그대로 사용: "+r.whole+"장 · 잘라 사용: "+r.cut+"장 · 배치 합계: "+r.base+"장",
      "추가 여유: "+r.spare+"% ("+r.spareCount+"장) · 예상 준비: "+r.required+"장"];
    if(r.boxes!==null)lines.push("한 박스 "+r.perBox+"장 → "+r.boxes+"박스, 총 "+r.purchaseTiles+"장");
    lines.push("직사각형 바닥·일자 배치 추정. 자르는 자리마다 새 타일 1장 사용, 자투리 재사용 없음. 벽 가장자리 별도 간격·절단 날 두께 제외. 실제 주문 전 판매처·시공 담당자와 확인하세요.");
    const text=lines.join("\n"),start=revision;copying=true;el("copy").disabled=true;let success=false;
    try{
      if(navigator.clipboard?.writeText){
        try{await navigator.clipboard.writeText(text);success=true;}
        catch(_){if(revision===start)success=legacyCopy(text);}
      }else success=legacyCopy(text);
      if(revision===start)el("copy-status").textContent=success?"계산 결과를 복사했어요.":"자동 복사가 지원되지 않습니다. 아래 결과를 직접 복사해 주세요.";
    }finally{copying=false;el("copy").disabled=Boolean(current.errors);}
  });
  el("rotate").addEventListener("click",()=>{
    const width=el("tile-width").value;el("tile-width").value=el("tile-length").value;el("tile-length").value=width;update();
  });
  const form=el("layout-form");
  form.addEventListener("input",update);form.addEventListener("change",update);
  form.addEventListener("submit",e=>e.preventDefault());
  form.addEventListener("reset",()=>{el("cut-details").open=false;setTimeout(update,0);});
  update();
}
if(typeof document!=="undefined")setupCalculator();
if(typeof module!=="undefined"&&module.exports)module.exports={calculateLayout,axisPlacements,MAX_PLACEMENTS,MAX_DRAWN};

