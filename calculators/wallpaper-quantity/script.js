"use strict";

// m 입력은 mm 정수로 읽어 정수 경계의 오차 없이 나눗셈합니다.
function parseLength(value, min, max, name) {
  const input = String(value ?? "").trim();
  if (!input || input.length > 16 || !/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(input)) {
    return { error: name + "을 숫자로 입력해 주세요. 소수점 셋째 자리까지 가능합니다." };
  }
  const number = Number(input);
  if (!Number.isFinite(number) || number < min || number > max) {
    return { error: min + "~" + max.toLocaleString("ko-KR") + "m 범위로 입력해 주세요." };
  }
  const [whole, fraction = ""] = input.split(".");
  return { mm: BigInt(whole || "0") * 1000n + BigInt(fraction.padEnd(3, "0")) };
}
function ceilRatio(n, d) { return (n + d - 1n) / d; }

function calculateWallpaper({ mode = "room", width = "", length = "", height = "",
  rollWidth = "", rollLength = "", endExtra = "10" } = {}) {
  const errors = {};
  const w = parseLength(width, .01, 100, mode === "wall" ? "벽 가로 길이" : "방 가로 길이");
  const h = parseLength(height, .01, 10, "벽 높이");
  const rw = parseLength(rollWidth, .01, 10, "벽지 폭");
  const rl = parseLength(rollLength, .01, 1000, "한 롤 길이");
  let l;
  for (const [id, value] of [["width", w], ["height", h], ["roll-width", rw], ["roll-length", rl]]) {
    if (value.error) errors[id] = value.error;
  }
  if (mode === "room") {
    l = parseLength(length, .01, 100, "방 세로 길이");
    if (l.error) errors.length = l.error;
  } else if (mode !== "wall") errors.mode = "도배할 범위를 다시 선택해 주세요.";
  const end = String(endExtra).trim();
  if (!/^\d{1,3}$/.test(end) || Number(end) > 100) {
    errors["end-extra"] = "0~100cm 사이의 정수로 입력해 주세요.";
  }
  if (Object.keys(errors).length) return { errors };
  const cutLength = h.mm + BigInt(end) * 20n; // cm → mm × 위아래 두 곳
  const perRoll = rl.mm / cutLength;
  if (perRoll === 0n) {
    return { errors: { "roll-length": "한 롤이 벽 높이와 위아래 여유를 합친 길이보다 짧아요. 제품 규격이나 여유 길이를 확인해 주세요." } };
  }
  // 벽마다 올림: 모서리에서 남는 폭을 다른 벽에 재사용하지 않는 단순 모델.
  const widthStrips = ceilRatio(w.mm, rw.mm);
  const lengthStrips = mode === "room" ? ceilRatio(l.mm, rw.mm) : null;
  const strips = mode === "room" ? 2n * (widthStrips + lengthStrips) : widthStrips;
  const wallWidth = mode === "room" ? 2n * (w.mm + l.mm) : w.mm;
  const rolls = ceilRatio(strips, perRoll);
  return { mode, width: Number(w.mm) / 1000, length: mode === "room" ? Number(l.mm) / 1000 : null,
    height: Number(h.mm) / 1000, rollWidth: Number(rw.mm) / 1000, rollLength: Number(rl.mm) / 1000,
    endExtra: Number(end), area: Number(wallWidth * h.mm) / 1000000,
    widthStrips: Number(widthStrips), lengthStrips: lengthStrips === null ? null : Number(lengthStrips),
    strips: Number(strips), cutLength: Number(cutLength) / 1000, perRoll: Number(perRoll), rolls: Number(rolls) };
}

function setupCalculator() {
  const el = id => document.getElementById(id);
  const form = el("wallpaper-form");
  const fmt = n => n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
  const areaFormat = n => n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let current, revision = 0, copying = false;
  function update() {
    revision++;
    el("copy-status").textContent = "";
    el("manual-copy").hidden = true;
    el("copy-text").value = "";
    const mode = el("mode").value;
    el("length-field").hidden = mode === "wall";
    el("length").disabled = mode === "wall";
    el("width-label").textContent = mode === "wall" ? "벽 가로 길이 (m)" : "방 가로 길이 (m)";
    current = calculateWallpaper({ mode, width: el("width").value, length: el("length").value,
      height: el("height").value, rollWidth: el("roll-width").value,
      rollLength: el("roll-length").value, endExtra: el("end-extra").value });
    for (const id of ["width", "length", "height", "roll-width", "roll-length", "end-extra"]) {
      el(id + "-error").textContent = current.errors?.[id] || "";
      el(id).setAttribute("aria-invalid", String(Boolean(current.errors?.[id])));
    }
    const valid = !current.errors;
    el("copy").disabled = !valid || copying;
    for (const [id, key] of [["quantity", "rolls"], ["strips", "strips"], ["cut-length", "cutLength"], ["per-roll", "perRoll"]]) {
      el(id).textContent = valid ? fmt(current[key]) : "—";
    }
    el("area-result").textContent = valid ? areaFormat(current.area) : "—";
    el("result-description").textContent = valid ?
      (current.mode === "room" ? "가로 벽 2면: " + current.widthStrips + "조각씩, 세로 벽 2면: " +
        current.lengthStrips + "조각씩. " : "벽 한 면을 기준으로 계산했어요. ") +
      current.strips + "조각 ÷ 롤당 " + current.perRoll + "조각을 롤 단위로 올림했어요." :
      (current.errors.mode || current.errors["roll-length"] || "벽 크기와 제품의 벽지 폭·한 롤 길이를 확인해 주세요.");
    // 오류가 접힌 설정 안에 있으면 펼쳐 원인을 바로 볼 수 있게 합니다.
    if (current.errors?.["end-extra"]) el("end-extra").closest("details").open = true;
  }
  function legacyCopy(text) {
    const focus = document.activeElement;
    el("manual-copy").hidden = false;
    el("copy-text").value = text;
    el("copy-text").focus();
    el("copy-text").select();
    let success = false;
    try { success = document.execCommand("copy"); } catch (_) { /* 수동 복사 안내 */ }
    if (success) { el("manual-copy").hidden = true; focus?.focus(); }
    return success;
  }
  el("copy").addEventListener("click", async () => {
    if (!current || current.errors || copying) return;
    const text = ["도배지 수량 계산 결과", current.mode === "room" ?
      "방 전체 네 벽: " + current.width + "m × " + current.length + "m, 높이 " + current.height + "m" :
      "벽 한 면: 가로 " + current.width + "m × 높이 " + current.height + "m",
      "벽 면적(문·창문 포함): " + areaFormat(current.area) + "㎡",
      "벽지 한 롤 규격: 폭 " + current.rollWidth + "m × 길이 " + current.rollLength + "m",
      "위·아래 각각 여유: " + current.endExtra + "cm",
      "필요 조각: " + current.strips + "개 · 한 조각 길이: " + fmt(current.cutLength) + "m",
      "한 롤에서 나오는 조각: " + current.perRoll + "개 · 예상 필요: " + current.rolls + "롤",
      "무늬 맞춤 없는 벽 도배용 추정치입니다. 문·창문은 빼지 않았고 천장·무늬 맞춤·추가 예비 롤은 제외했습니다. 실제 주문 전 판매처·시공 담당자와 확인하세요."].join("\n");
    const startRevision = revision;
    copying = true;
    el("copy").disabled = true;
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); success = true; }
        catch (_) { if (revision === startRevision) success = legacyCopy(text); }
      } else success = legacyCopy(text);
      if (revision === startRevision) el("copy-status").textContent = success ?
        "계산 결과를 복사했어요." : "자동 복사가 지원되지 않습니다. 아래 결과를 직접 복사해 주세요.";
    } finally { copying = false; el("copy").disabled = Boolean(current.errors); }
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("reset", () => {
    form.querySelector("details").open = false;
    setTimeout(update, 0);
  });
  update();
}

if (typeof document !== "undefined") setupCalculator();
if (typeof module !== "undefined" && module.exports) module.exports = { calculateWallpaper };

