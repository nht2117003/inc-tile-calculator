"use strict";
// 방 길이와 장판 폭은 mm 정수로 계산하며, 주문 길이를 마지막에만 올림합니다.
function parseLength(value, min, max, name) {
  const s = String(value ?? "").trim();
  if (!s || s.length > 16 || !/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(s))
    return {error:name + "을 숫자로 입력해 주세요. 소수점 셋째 자리까지 가능합니다."};
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return {error:min + "~" + max + " 범위로 입력해 주세요."};
  const [whole, fraction = ""] = s.split(".");
  return {mm:BigInt(whole || "0") * 1000n + BigInt(fraction.padEnd(3,"0"))};
}
function ceilRatio(n,d) { return (n + d - 1n) / d; }
function calculateSheet({width="",length="",rollWidth="",direction="auto",endExtra="10",increment="0.1"}={}) {
  const errors = {};
  const w=parseLength(width,.01,100,"방 가로 길이"), l=parseLength(length,.01,100,"방 세로 길이");
  const r=parseLength(rollWidth,.01,10,"장판 폭");
  if(w.error) errors.width=w.error;
  if(l.error) errors.length=l.error;
  if(r.error) errors["roll-width"]=r.error;
  const end=String(endExtra).trim();
  if(!/^\d{1,3}$/.test(end) || Number(end)>100) errors["end-extra"]="0~100cm 사이의 정수로 입력해 주세요.";
  if(!["auto","length","width"].includes(direction)) errors.direction="펼치는 방향을 다시 선택해 주세요.";
  if(!["0.1","0.5","1"].includes(String(increment))) errors.increment="주문 단위를 다시 선택해 주세요.";
  if(Object.keys(errors).length) return {errors};
  const orderUnit=BigInt(Math.round(Number(increment)*1000));
  const evaluate=(across,along,name)=>{
    const strips=ceilRatio(across,r.mm);
    const cutLength=along + BigInt(end)*20n; // 한쪽 cm를 mm로 변환한 후 양쪽에 더함
    const totalLength=strips*cutLength;
    const purchaseLength=ceilRatio(totalLength,orderUnit)*orderUnit;
    return {strips,cutLength,totalLength,purchaseLength,direction:name};
  };
  const alongLength=evaluate(w.mm,l.mm,"length"), alongWidth=evaluate(l.mm,w.mm,"width");
  let result=direction==="width"?alongWidth:alongLength;
  if(direction==="auto" && (alongWidth.purchaseLength<alongLength.purchaseLength ||
      (alongWidth.purchaseLength===alongLength.purchaseLength && alongWidth.totalLength<alongLength.totalLength))) result=alongWidth;
  return {area:Number(w.mm*l.mm)/1000000,rollWidth:Number(r.mm)/1000,
    direction:result.direction,auto:direction==="auto",strips:Number(result.strips),
    cutLength:Number(result.cutLength)/1000,totalLength:Number(result.totalLength)/1000,
    purchaseLength:Number(result.purchaseLength)/1000,purchaseArea:Number(result.purchaseLength*r.mm)/1000000,
    endExtra:Number(end),increment:Number(increment)};
}
function setupCalculator() {
  const el=id=>document.getElementById(id);
  const fmt=n=>n.toLocaleString("ko-KR",{maximumFractionDigits:3});
  const area=n=>n.toLocaleString("ko-KR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const dir=d=>d==="length"?"방 세로 길이를 따라":"방 가로 길이를 따라";
  let current,revision=0,copying=false;
  function update() {
    revision++; el("copy-status").textContent=""; el("manual-copy").hidden=true; el("copy-text").value="";
    current=calculateSheet({width:el("width").value,length:el("length").value,rollWidth:el("roll-width").value,
      direction:el("direction").value,endExtra:el("end-extra").value,increment:el("increment").value});
    for(const id of ["width","length","roll-width","end-extra"]) {
      el(id+"-error").textContent=current.errors?.[id]||"";
      el(id).setAttribute("aria-invalid",String(Boolean(current.errors?.[id])));
    }
    const valid=!current.errors;
    el("copy").disabled=!valid||copying;
    for(const [id,key] of [["quantity","purchaseLength"],["strips","strips"],["cut-length","cutLength"],["total-length","totalLength"]])
      el(id).textContent=valid?fmt(current[key]):"—";
    el("area-result").textContent=valid?area(current.area):"—";
    el("purchase-area").textContent=valid?area(current.purchaseArea):"—";
    el("direction-result").textContent=valid?dir(current.direction):"—";
    el("result-description").textContent=valid?
      (current.auto?"두 방향 중 구매 길이가 짧은 쪽을 골랐어요. ":"")+
      "입력 폭 "+current.rollWidth+"m 기준, 전체 길이를 "+current.increment+"m 단위로 올림했어요. 이음부 겹침과 무늬 맞춤은 제외됩니다.":
      (current.errors.direction||current.errors.increment||"방 크기와 제품의 장판 폭을 확인해 주세요.");
  }
  function legacyCopy(text) {
    const focus=document.activeElement;
    el("manual-copy").hidden=false; el("copy-text").value=text; el("copy-text").focus();el("copy-text").select();
    let success=false; try {success=document.execCommand("copy");} catch(_){}
    if(success){el("manual-copy").hidden=true;focus?.focus();} return success;
  }
  el("copy").addEventListener("click",async()=>{
    if(!current||current.errors||copying)return;
    const text=["장판 길이 계산 결과","방 면적: "+area(current.area)+"㎡","장판 폭: "+current.rollWidth+"m",
      "펼치는 방향: "+dir(current.direction),"한쪽 끝 여유: "+current.endExtra+"cm",
      current.strips+"조각 × "+fmt(current.cutLength)+"m = "+fmt(current.totalLength)+"m",
      "주문 단위: "+current.increment+"m · 예상 구매 길이: "+fmt(current.purchaseLength)+"m",
      "단순 직사각형 방 기준 추정치입니다. 이음부 겹침·무늬 맞춤·여러 방 자투리 재사용은 제외됩니다. 구매 전 판매처와 확인하세요."].join("\n");
    const start=revision;copying=true;el("copy").disabled=true;let success=false;
    try {
      if(navigator.clipboard?.writeText){
        try{await navigator.clipboard.writeText(text);success=true;}
        catch(_){if(revision===start)success=legacyCopy(text);}
      }else success=legacyCopy(text);
      if(revision===start)el("copy-status").textContent=success?"계산 결과를 복사했어요.":"자동 복사가 지원되지 않습니다. 아래 결과를 직접 복사해 주세요.";
    } finally{copying=false;el("copy").disabled=Boolean(current.errors);}
  });
  const form=el("sheet-form");
  form.addEventListener("input",update);form.addEventListener("change",update);
  form.addEventListener("submit",e=>e.preventDefault());form.addEventListener("reset",()=>setTimeout(update,0));
  update();
}
if(typeof document!=="undefined")setupCalculator();
if(typeof module!=="undefined"&&module.exports)module.exports={calculateSheet};

