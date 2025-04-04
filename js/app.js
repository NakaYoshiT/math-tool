/*
 * 図形作成支援ソフト JavaScript
 * 構造:
 * - データ管理と初期化
 * - undo/redo 用状態管理
 * - ユーティリティ関数
 * - イベントハンドラー
 * - 描画関数
 * - プロパティパネル更新処理
 */

// -------------------------------
// データ管理と初期化
// -------------------------------
let polygons = [];  // 完成した多角形（各 poly は { points: [...], isClosed: true, groupId: number|null }）
let currentPolygon = { points: [], isClosed: false };
let texts = [];     // テキストオブジェクトの配列。各オブジェクトは { x, y, content, fontSize, color, groupId }

// 現在のモード ("draw", "edit", "delete", "text")
let currentMode = "draw";

// 編集時のドラッグ状態
let draggingVertex = false;
let currentDragPolyIndex = null;
let currentDragVertexIndex = null;
let draggingEdgeControl = false;
let currentEdgeControlPolyIndex = null;
let currentEdgeControlIndex = null;
let draggingPolygon = false;
let polygonDragStart = null;
let initialPolygonPoints = [];
let initialEdgeControls = [];

// テキスト編集用
let draggingText = false;
let currentDragTextIndex = null;
let textDragStart = null;
let initialTextPos = null;

// ★ 追加: 複数選択とグループ機能
let selectedPolygonIndices = [];
let selectedTextIndices = [];
let groups = [];  // 各要素 { polygons: [...], texts: [...] }
let selectedGroupId = null;

// ★ 追加: グループ内要素の個別プロパティ編集
// グループが選択されているときに「中のどのポリゴン/テキストを編集したいか」を示す
// 例: { type: 'polygon'|'text', index: number } で、index は global な配列(polygons/texts)のインデックス
let selectedGroupSubObject = null;

// ズーム用
let zoomLevel = 1;
let currentMousePos = null;  // プレビュー線用

// undo/redo 用
let undoStack = [];
let redoStack = [];
let stateChanged = false; // ドラッグ操作等で変更があったか

// -------------------------------
// HTML要素
// -------------------------------
const canvas = document.getElementById("drawingArea");
const ctx = canvas.getContext("2d");
const modeDrawRadio = document.getElementById("modeDraw");
const modeEditRadio = document.getElementById("modeEdit");
const modeDeleteRadio = document.getElementById("modeDelete");
const modeTextRadio = document.getElementById("modeText");
const showEdgeLengthCheckbox = document.getElementById("showEdgeLength");
const showAngleCheckbox = document.getElementById("showAngle");
const showGridCheckbox = document.getElementById("showGrid");
const snapGridCheckbox = document.getElementById("snapGrid");
const closePolygonBtn = document.getElementById("closePolygonBtn");
const clearBtn = document.getElementById("clearBtn");
const polyPropertiesDiv = document.getElementById("polyProperties");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

// グループ化・解除ボタン
const groupBtn = document.getElementById("groupBtn");
const ungroupBtn = document.getElementById("ungroupBtn");

// -------------------------------
// 補助関数：createLabelRange
// -------------------------------
function createLabelRange(labelText, initialValue, min, max, step, onChange) {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText + "：";
  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.min = min;
  rangeInput.max = max;
  rangeInput.step = step;
  rangeInput.value = initialValue;
  rangeInput.style.width = "200px";
  const valueSpan = document.createElement("span");
  valueSpan.textContent = initialValue;
  rangeInput.addEventListener("input", function(ev) {
    valueSpan.textContent = ev.target.value;
    onChange(ev);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(rangeInput);
  wrapper.appendChild(valueSpan);
  return wrapper;
}

// -------------------------------
// undo/redo 関連
// -------------------------------
function saveState() {
  const state = {
    polygons: JSON.parse(JSON.stringify(polygons)),
    currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
    texts: JSON.parse(JSON.stringify(texts)),
    groups: JSON.parse(JSON.stringify(groups))
  };
  undoStack.push(state);
  redoStack = [];
}

function restoreState(state) {
  polygons = JSON.parse(JSON.stringify(state.polygons));
  currentPolygon = JSON.parse(JSON.stringify(state.currentPolygon));
  texts = JSON.parse(JSON.stringify(state.texts));
  groups = JSON.parse(JSON.stringify(state.groups));
  updateDrawing();
}

function undo() {
  if (undoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
      texts: JSON.parse(JSON.stringify(texts)),
      groups: JSON.parse(JSON.stringify(groups))
    };
    redoStack.push(currentState);
    const prevState = undoStack.pop();
    restoreState(prevState);
  }
}

function redo() {
  if (redoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
      texts: JSON.parse(JSON.stringify(texts)),
      groups: JSON.parse(JSON.stringify(groups))
    };
    undoStack.push(currentState);
    const nextState = redoStack.pop();
    restoreState(nextState);
  }
}

// -------------------------------
// ユーティリティ関数
// -------------------------------
function getMousePos(event) {
  const rect = canvas.getBoundingClientRect();
  let x, y;
  if (event.touches && event.touches.length > 0) {
    x = event.touches[0].clientX - rect.left;
    y = event.touches[0].clientY - rect.top;
  } else {
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  }
  x /= zoomLevel;
  y /= zoomLevel;
  return { x, y };
}

function snapToGrid(pos) {
  const gridSize = 20;
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize
  };
}

function pointInPolygon(point, polyPoints) {
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    const xi = polyPoints[i].x, yi = polyPoints[i].y;
    const xj = polyPoints[j].x, yj = polyPoints[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function scheduleUpdate() {
  requestAnimationFrame(() => {
    updateDrawing();
  });
}

// 角度補間
function lerpAngle(a, b, t) {
  let diff = b - a;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  return a + diff * t;
}

// グリッド描画
function drawGrid() {
  const gridSize = 20;
  ctx.save();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for(let x = 0; x < canvas.width/zoomLevel; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height/zoomLevel);
    ctx.stroke();
  }
  for(let y = 0; y < canvas.height/zoomLevel; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width/zoomLevel, y);
    ctx.stroke();
  }
  ctx.restore();
}

// -------------------------------
// ★ グループ関連
// -------------------------------
function createGroupFromSelection() {
  if (selectedPolygonIndices.length + selectedTextIndices.length < 2) {
    return;
  }
  saveState();
  const newGroupId = groups.length;
  const polygonsInGroup = [];
  const textsInGroup = [];
  for (let idx of selectedPolygonIndices) {
    polygons[idx].groupId = newGroupId;
    polygonsInGroup.push(idx);
  }
  for (let idx of selectedTextIndices) {
    texts[idx].groupId = newGroupId;
    textsInGroup.push(idx);
  }
  groups.push({
    polygons: polygonsInGroup,
    texts: textsInGroup
  });
  selectedGroupId = newGroupId;
  // ★ 新規グループ作成時はサブ選択クリア
  selectedGroupSubObject = null;
  updateDrawing();
}

function ungroupSelected() {
  if (selectedGroupId == null) return;
  saveState();
  const grp = groups[selectedGroupId];
  if (!grp) return;
  for (let pIdx of grp.polygons) {
    polygons[pIdx].groupId = null;
  }
  for (let tIdx of grp.texts) {
    texts[tIdx].groupId = null;
  }
  groups[selectedGroupId] = { polygons: [], texts: [] };
  selectedGroupId = null;
  selectedGroupSubObject = null;
  updateDrawing();
}

function clearSelections() {
  selectedPolygonIndices = [];
  selectedTextIndices = [];
  selectedGroupId = null;
  selectedGroupSubObject = null;
}

// -------------------------------
// イベントハンドラー
// -------------------------------
modeDrawRadio.addEventListener("change", function() {
  if (modeDrawRadio.checked) {
    currentMode = "draw";
    clearSelections();
    updateDrawing();
  }
});
modeEditRadio.addEventListener("change", function() {
  if (modeEditRadio.checked) {
    currentMode = "edit";
    updateDrawing();
  }
});
modeDeleteRadio.addEventListener("change", function() {
  if (modeDeleteRadio.checked) {
    currentMode = "delete";
    clearSelections();
    updateDrawing();
  }
});
modeTextRadio.addEventListener("change", function() {
  if (modeTextRadio.checked) {
    currentMode = "text";
    clearSelections();
    updateDrawing();
  }
});

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

groupBtn.addEventListener("click", createGroupFromSelection);
ungroupBtn.addEventListener("click", ungroupSelected);

function handleCanvasDown(e) {
  e.preventDefault();
  let pos = getMousePos(e);
  if (snapGridCheckbox.checked) {
    pos = snapToGrid(pos);
  }

  if (currentMode === "text") {
    saveState();
    texts.push({
      x: pos.x,
      y: pos.y,
      content: "テキスト",
      fontSize: 16,
      color: "black",
      groupId: null
    });
    updateDrawing();
    return;
  }

  if (currentMode === "delete") {
    for (let p = polygons.length - 1; p >= 0; p--) {
      if (pointInPolygon(pos, polygons[p].points)) {
        saveState();
        polygons.splice(p, 1);
        updateDrawing();
        return;
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      let tObj = texts[i];
      ctx.save();
      ctx.font = (tObj.fontSize || 16) + "px sans-serif";
      let metrics = ctx.measureText(tObj.content);
      let width = metrics.width;
      let height = tObj.fontSize;
      ctx.restore();
      if (pos.x >= tObj.x - width/2 && pos.x <= tObj.x + width/2 &&
          pos.y >= tObj.y - height/2 && pos.y <= tObj.y + height/2) {
        saveState();
        texts.splice(i, 1);
        updateDrawing();
        return;
      }
    }
    return;
  }

  if (currentMode === "draw") {
    saveState();
    currentPolygon.points.push({
      x: pos.x,
      y: pos.y,
      edgeProperty: {
        showEdgeLength: true,
        curvature: 30,
        segmentColor: "black",
        bezierColor: "black",
        labelColor: "black",
        labelOverride: "",
        bezierGap: 0.1,
        labelOffsetX: 0,
        labelOffsetY: 0,
        labelFontSize: 12
      },
      angleProperty: {
        showAngle: true,
        radius: 30,
        labelOverride: "",
        fanPosition: 0,
        labelOffsetX: 0,
        labelOffsetY: 0,
        labelFontSize: 12
      }
    });
    updateDrawing();
    return;
  }

  // 編集モード
  if (currentMode === "edit") {
    currentMousePos = null;
    const isShift = e.shiftKey;
    let threshold = 8;

    // 1. 辺のコントロール点
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      const edgeCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(poly, i);
        const dx = pos.x - cp.x;
        const dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = p;
          currentEdgeControlIndex = i;
          if (!isShift) clearSelections();
          if (!selectedPolygonIndices.includes(p)) {
            selectedPolygonIndices.push(p);
          }
          selectedGroupId = polygons[p].groupId != null ? polygons[p].groupId : null;
          selectedGroupSubObject = null;  // グループ内要素のサブ選択は解除
          return;
        }
      }
    }
    // currentPolygon
    if (currentPolygon.points.length > 0) {
      const edgeCount = currentPolygon.points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(currentPolygon, i);
        const dx = pos.x - cp.x;
        const dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = "current";
          currentEdgeControlIndex = i;
          if (!isShift) clearSelections();
          return;
        }
      }
    }

    // 2. 頂点クリック
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      for (let i = 0; i < poly.points.length; i++) {
        const dx = pos.x - poly.points[i].x;
        const dy = pos.y - poly.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = p;
          currentDragVertexIndex = i;
          if (!isShift) clearSelections();
          if (!selectedPolygonIndices.includes(p)) {
            selectedPolygonIndices.push(p);
          }
          selectedGroupId = polygons[p].groupId != null ? polygons[p].groupId : null;
          selectedGroupSubObject = null;
          return;
        }
      }
    }
    // currentPolygon 頂点
    if (currentPolygon.points.length > 0) {
      for (let i = 0; i < currentPolygon.points.length; i++) {
        const dx = pos.x - currentPolygon.points[i].x;
        const dy = pos.y - currentPolygon.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = "current";
          currentDragVertexIndex = i;
          if (!isShift) clearSelections();
          return;
        }
      }
    }

    // 3. グループ所属オブジェクトをクリック
    for (let gId = groups.length - 1; gId >= 0; gId--) {
      let grp = groups[gId];
      if (!grp) continue;
      // ポリゴン
      for (let pIdx of grp.polygons) {
        if (pointInPolygon(pos, polygons[pIdx].points)) {
          draggingPolygon = true;
          currentDragPolyIndex = null;
          if (!isShift) clearSelections();
          selectedGroupId = gId;
          selectedPolygonIndices = [...grp.polygons];
          selectedTextIndices = [...grp.texts];
          selectedGroupSubObject = null;
          polygonDragStart = pos;
          initialPolygonPoints = grp.polygons.map(idx => JSON.parse(JSON.stringify(polygons[idx].points)));
          initialEdgeControls = grp.polygons.map(idx => {
            return polygons[idx].points.map(pt => pt.edgeControl ? {x:pt.edgeControl.x, y:pt.edgeControl.y} : null);
          });
          initialTextPos = grp.texts.map(idx => {
            return { x: texts[idx].x, y: texts[idx].y };
          });
          return;
        }
      }
      // テキスト
      for (let tIdx of grp.texts) {
        let tObj = texts[tIdx];
        ctx.save();
        ctx.font = (tObj.fontSize || 16) + "px sans-serif";
        let metrics = ctx.measureText(tObj.content);
        let width = metrics.width;
        let height = tObj.fontSize;
        ctx.restore();
        if (pos.x >= tObj.x - width/2 && pos.x <= tObj.x + width/2 &&
            pos.y >= tObj.y - height/2 && pos.y <= tObj.y + height/2) {
          draggingPolygon = true; // グループ全体を移動
          currentDragPolyIndex = null;
          if (!isShift) clearSelections();
          selectedGroupId = gId;
          selectedPolygonIndices = [...grp.polygons];
          selectedTextIndices = [...grp.texts];
          selectedGroupSubObject = null;
          polygonDragStart = pos;
          initialPolygonPoints = grp.polygons.map(idx => JSON.parse(JSON.stringify(polygons[idx].points)));
          initialEdgeControls = grp.polygons.map(idx => {
            return polygons[idx].points.map(pt => pt.edgeControl ? {x:pt.edgeControl.x, y:pt.edgeControl.y} : null);
          });
          initialTextPos = grp.texts.map(idx => {
            return { x: texts[idx].x, y: texts[idx].y };
          });
          return;
        }
      }
    }

    // 4. グループ非所属のポリゴン内部
    for (let p = polygons.length - 1; p >= 0; p--) {
      if (pointInPolygon(pos, polygons[p].points)) {
        draggingPolygon = true;
        currentDragPolyIndex = p;
        if (!isShift) clearSelections();
        if (!selectedPolygonIndices.includes(p)) {
          selectedPolygonIndices.push(p);
        }
        selectedGroupId = polygons[p].groupId != null ? polygons[p].groupId : null;
        selectedGroupSubObject = null;
        polygonDragStart = pos;
        initialPolygonPoints = polygons[p].points.map(pt => ({ x: pt.x, y: pt.y }));
        initialEdgeControls = polygons[p].points.map(pt => pt.edgeControl ? { x: pt.edgeControl.x, y: pt.edgeControl.y } : null);
        return;
      }
    }
    // 5. グループ非所属のテキスト
    for (let i = texts.length - 1; i >= 0; i--) {
      let tObj = texts[i];
      if (tObj.groupId != null) continue;
      ctx.save();
      ctx.font = (tObj.fontSize || 16) + "px sans-serif";
      let metrics = ctx.measureText(tObj.content);
      let width = metrics.width;
      let height = tObj.fontSize;
      ctx.restore();
      if (pos.x >= tObj.x - width/2 && pos.x <= tObj.x + width/2 &&
          pos.y >= tObj.y - height/2 && pos.y <= tObj.y + height/2) {
        draggingText = true;
        currentDragTextIndex = i;
        if (!isShift) clearSelections();
        if (!selectedTextIndices.includes(i)) {
          selectedTextIndices.push(i);
        }
        selectedGroupId = texts[i].groupId != null ? texts[i].groupId : null;
        selectedGroupSubObject = null;
        textDragStart = pos;
        initialTextPos = { x: tObj.x, y: tObj.y };
        return;
      }
    }

    // 6. どこもヒットしなければ選択解除
    if (!isShift) clearSelections();
    updateDrawing();
  }
}
canvas.addEventListener("mousedown", handleCanvasDown);
canvas.addEventListener("touchstart", handleCanvasDown);

function handleCanvasMove(e) {
  let pos = getMousePos(e);
  if (snapGridCheckbox.checked) {
    pos = snapToGrid(pos);
  }

  if (draggingEdgeControl && currentEdgeControlPolyIndex !== null && currentEdgeControlIndex !== null) {
    e.preventDefault();
    if (currentEdgeControlPolyIndex === "current") {
      currentPolygon.points[currentEdgeControlIndex].edgeControl = { x: pos.x, y: pos.y };
    } else {
      polygons[currentEdgeControlPolyIndex].points[currentEdgeControlIndex].edgeControl = { x: pos.x, y: pos.y };
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingVertex && currentDragPolyIndex !== null && currentDragVertexIndex !== null) {
    e.preventDefault();
    if (currentDragPolyIndex === "current") {
      currentPolygon.points[currentDragVertexIndex].x = pos.x;
      currentPolygon.points[currentDragVertexIndex].y = pos.y;
    } else {
      polygons[currentDragPolyIndex].points[currentDragVertexIndex].x = pos.x;
      polygons[currentDragPolyIndex].points[currentDragVertexIndex].y = pos.y;
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingPolygon && polygonDragStart) {
    e.preventDefault();
    let dx = pos.x - polygonDragStart.x;
    let dy = pos.y - polygonDragStart.y;
    if (selectedGroupId != null) {
      // グループ移動
      const grp = groups[selectedGroupId];
      for (let pIndex = 0; pIndex < grp.polygons.length; pIndex++) {
        let polyIndex = grp.polygons[pIndex];
        for (let i = 0; i < polygons[polyIndex].points.length; i++) {
          polygons[polyIndex].points[i].x = initialPolygonPoints[pIndex][i].x + dx;
          polygons[polyIndex].points[i].y = initialPolygonPoints[pIndex][i].y + dy;
          if (polygons[polyIndex].points[i].edgeControl && initialEdgeControls[pIndex][i]) {
            polygons[polyIndex].points[i].edgeControl.x = initialEdgeControls[pIndex][i].x + dx;
            polygons[polyIndex].points[i].edgeControl.y = initialEdgeControls[pIndex][i].y + dy;
          }
        }
      }
      for (let tIndex = 0; tIndex < grp.texts.length; tIndex++) {
        let realIndex = grp.texts[tIndex];
        texts[realIndex].x = initialTextPos[tIndex].x + dx;
        texts[realIndex].y = initialTextPos[tIndex].y + dy;
      }
    } else {
      // 個別ポリゴン
      if (currentDragPolyIndex === "current") {
        for (let i = 0; i < currentPolygon.points.length; i++) {
          currentPolygon.points[i].x = initialPolygonPoints[i].x + dx;
          currentPolygon.points[i].y = initialPolygonPoints[i].y + dy;
          if (currentPolygon.points[i].edgeControl && initialEdgeControls[i]) {
            currentPolygon.points[i].edgeControl.x = initialEdgeControls[i].x + dx;
            currentPolygon.points[i].edgeControl.y = initialEdgeControls[i].y + dy;
          }
        }
      } else {
        for (let i = 0; i < polygons[currentDragPolyIndex].points.length; i++) {
          polygons[currentDragPolyIndex].points[i].x = initialPolygonPoints[i].x + dx;
          polygons[currentDragPolyIndex].points[i].y = initialPolygonPoints[i].y + dy;
          if (polygons[currentDragPolyIndex].points[i].edgeControl && initialEdgeControls[i]) {
            polygons[currentDragPolyIndex].points[i].edgeControl.x = initialEdgeControls[i].x + dx;
            polygons[currentDragPolyIndex].points[i].edgeControl.y = initialEdgeControls[i].y + dy;
          }
        }
      }
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingText && currentDragTextIndex !== null) {
    e.preventDefault();
    const dx = pos.x - textDragStart.x;
    const dy = pos.y - textDragStart.y;
    texts[currentDragTextIndex].x = initialTextPos.x + dx;
    texts[currentDragTextIndex].y = initialTextPos.y + dy;
    stateChanged = true;
    scheduleUpdate();
  }
  else if (currentMode === "draw" || currentMode === "text") {
    currentMousePos = pos;
    scheduleUpdate();
  }
}
canvas.addEventListener("mousemove", handleCanvasMove);
canvas.addEventListener("touchmove", handleCanvasMove);

function endDrag(e) {
  if (stateChanged) {
    saveState();
    stateChanged = false;
  }
  draggingEdgeControl = false;
  draggingVertex = false;
  draggingPolygon = false;
  draggingText = false;
  currentEdgeControlPolyIndex = null;
  currentEdgeControlIndex = null;
  currentDragPolyIndex = null;
  currentDragVertexIndex = null;
  currentDragTextIndex = null;
  polygonDragStart = null;
  textDragStart = null;
}
canvas.addEventListener("mouseup", endDrag);
canvas.addEventListener("touchend", endDrag);

// -------------------------------
// ボタン操作
// -------------------------------
clearBtn.addEventListener("click", function() {
  saveState();
  polygons = [];
  currentPolygon = { points: [], isClosed: false };
  texts = [];
  groups = [];
  clearSelections();
  updateDrawing();
});

closePolygonBtn.addEventListener("click", function() {
  if (currentMode === "draw") {
    if (currentPolygon.points.length > 2) {
      saveState();
      currentPolygon.isClosed = true;
      polygons.push(currentPolygon);
      currentPolygon = { points: [], isClosed: false };
      updateDrawing();
    } else {
      alert("ポリゴンを閉じるには3点以上必要です。");
    }
  }
});

showEdgeLengthCheckbox.addEventListener("change", function() {
  saveState();
  updateDrawing();
});
showAngleCheckbox.addEventListener("change", function() {
  saveState();
  updateDrawing();
});
showGridCheckbox.addEventListener("change", updateDrawing);
snapGridCheckbox.addEventListener("change", updateDrawing);

// ズーム機能
canvas.addEventListener("wheel", function(e) {
  e.preventDefault();
  const scaleFactor = 1.1;
  if (e.deltaY < 0) {
    zoomLevel *= scaleFactor;
  } else {
    zoomLevel /= scaleFactor;
  }
  zoomLevel = Math.max(0.5, Math.min(zoomLevel, 3));
  scheduleUpdate();
});

// -------------------------------
// 描画関連
// -------------------------------
function updateDrawing() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(zoomLevel, zoomLevel);

  if (showGridCheckbox.checked) {
    drawGrid();
  }

  // 完成済みポリゴン描画
  polygons.forEach((poly, pIndex) => {
    if (poly.points.length > 1) {
      const segCount = poly.isClosed ? poly.points.length : poly.points.length - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = poly.points[i];
        const p2 = poly.points[(i+1) % poly.points.length];
        ctx.beginPath();
        ctx.strokeStyle = p1.edgeProperty.segmentColor;
        ctx.lineWidth = 2;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        if (showEdgeLengthCheckbox.checked && p1.edgeProperty.showEdgeLength) {
          const cp = getEdgeControlPoint(poly, i);
          drawEdgeLengthBezier(p1, p2, cp);
        }
      }
      if (showAngleCheckbox.checked) {
        if (poly.isClosed) {
          for (let i = 0; i < poly.points.length; i++) {
            if (poly.points[i].angleProperty.showAngle) {
              const prev = poly.points[(i-1+poly.points.length)%poly.points.length];
              const curr = poly.points[i];
              const next = poly.points[(i+1)%poly.points.length];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        } else if (poly.points.length >= 3) {
          for (let i = 1; i < poly.points.length - 1; i++) {
            if (poly.points[i].angleProperty.showAngle) {
              const prev = poly.points[i-1];
              const curr = poly.points[i];
              const next = poly.points[i+1];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        }
      }
      if (currentMode === "edit") {
        poly.points.forEach(p => drawVertex(p));
        const ec = poly.isClosed ? poly.points.length : poly.points.length - 1;
        for (let i = 0; i < ec; i++) {
          const cp = getEdgeControlPoint(poly, i);
          drawEdgeControl(cp);
        }
      }
      // 個別ポリゴン選択時の枠
      if (selectedPolygonIndices.includes(pIndex) && selectedGroupId == null) {
        drawBoundingBox(poly.points, "blue");
      }
    }
  });

  // テキスト描画
  texts.forEach((t, index) => {
    ctx.fillStyle = t.color;
    ctx.font = t.fontSize + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.content, t.x, t.y);

    if (selectedTextIndices.includes(index) && selectedGroupId == null) {
      ctx.save();
      let metrics = ctx.measureText(t.content);
      let width = metrics.width;
      let height = t.fontSize;
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 1;
      ctx.strokeRect(t.x - width/2, t.y - height/2, width, height);
      ctx.restore();
    }
  });

  // 未完成のポリゴン
  if (currentPolygon.points.length > 0) {
    if (currentPolygon.points.length > 1) {
      const segCount = currentPolygon.points.length - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = currentPolygon.points[i];
        const p2 = currentPolygon.points[i+1];
        ctx.beginPath();
        ctx.strokeStyle = p1.edgeProperty.segmentColor;
        ctx.lineWidth = 2;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        if (showEdgeLengthCheckbox.checked && p1.edgeProperty.showEdgeLength) {
          const cp = getEdgeControlPoint(currentPolygon, i);
          drawEdgeLengthBezier(p1, p2, cp);
        }
      }
      if (showAngleCheckbox.checked && currentPolygon.points.length >= 3) {
        for (let i = 1; i < currentPolygon.points.length - 1; i++) {
          if (currentPolygon.points[i].angleProperty.showAngle) {
            const prev = currentPolygon.points[i-1];
            const curr = currentPolygon.points[i];
            const next = currentPolygon.points[i+1];
            drawAngleFan(prev, curr, next, currentPolygon.points[i].angleProperty.radius);
          }
        }
      }
    }
    if (currentMode === "edit") {
      currentPolygon.points.forEach(p => drawVertex(p));
      const segCount = currentPolygon.points.length - 1;
      for (let i = 0; i < segCount; i++) {
        const cp = getEdgeControlPoint(currentPolygon, i);
        drawEdgeControl(cp);
      }
    }
    if (currentMode === "draw" && currentMousePos) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      const lastPoint = currentPolygon.points[currentPolygon.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(currentMousePos.x, currentMousePos.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // グループの枠描画
  if (selectedGroupId != null && groups[selectedGroupId]) {
    let grp = groups[selectedGroupId];
    let allPoints = [];
    for (let pIdx of grp.polygons) {
      allPoints = allPoints.concat(polygons[pIdx].points);
    }
    for (let tIdx of grp.texts) {
      allPoints.push({ x: texts[tIdx].x, y: texts[tIdx].y });
    }
    drawBoundingBox(allPoints, "red");
  }

  updatePropertyPanel();
  ctx.restore();
}

function drawBoundingBox(points, color) {
  if (!points || points.length === 0) return;
  let minX = Math.min(...points.map(pt => pt.x));
  let maxX = Math.max(...points.map(pt => pt.x));
  let minY = Math.min(...points.map(pt => pt.y));
  let maxY = Math.max(...points.map(pt => pt.y));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}

function getEdgeControlPoint(poly, i) {
  const p1 = poly.points[i];
  const p2 = poly.points[(i+1) % poly.points.length];
  if (p1.edgeControl) {
    return p1.edgeControl;
  } else {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const curvature = p1.edgeProperty.curvature;
    return { x: midX - (dy/dist)*curvature, y: midY + (dx/dist)*curvature };
  }
}

function drawEdgeControl(cp) {
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, 2*Math.PI);
  ctx.fillStyle = "blue";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawEdgeLengthBezier(p1, p2, cp) {
  ctx.strokeStyle = p1.edgeProperty.bezierColor;
  ctx.lineWidth = 2;
  let gap = p1.edgeProperty.bezierGap;
  if (gap >= 1) {
    // gapが1以上なら描画なし
  } else if (gap <= 0) {
    drawQuadraticSegment(p1, cp, p2, 0, 1);
  } else {
    let t1 = 0.5 - gap/2;
    let t2 = 0.5 + gap/2;
    drawQuadraticSegment(p1, cp, p2, 0, t1);
    drawQuadraticSegment(p1, cp, p2, t2, 1);
  }
  const len = approximateQuadraticBezierLength(p1, cp, p2);
  const mid = quadraticBezierPoint(0.5, p1, cp, p2);
  const pt1 = quadraticBezierPoint(0.48, p1, cp, p2);
  const pt2 = quadraticBezierPoint(0.52, p1, cp, p2);
  const derivative = { x: pt2.x - pt1.x, y: pt2.y - pt1.y };
  const norm = Math.sqrt(derivative.x*derivative.x + derivative.y*derivative.y);
  const normal = { x: -derivative.y/norm, y: derivative.x/norm };
  const baseOffset = 5;
  const verticalShift = -10;
  const xAdj = p1.edgeProperty.labelOffsetX || 0;
  const yAdj = p1.edgeProperty.labelOffsetY || 0;
  const fontSize = p1.edgeProperty.labelFontSize || 12;
  const textPos = {
    x: mid.x + normal.x * baseOffset + xAdj,
    y: mid.y + normal.y * baseOffset + verticalShift + yAdj
  };
  ctx.fillStyle = p1.edgeProperty.labelColor;
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p1.edgeProperty.labelOverride.trim() !== "" ? p1.edgeProperty.labelOverride : len.toFixed(1);
  ctx.fillText(label, textPos.x, textPos.y);
}

function quadraticBezierPoint(t, p0, cp, p1) {
  const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*cp.x + t*t*p1.x;
  const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*cp.y + t*t*p1.y;
  return { x, y };
}

function drawQuadraticSegment(p0, cp, p1, t0, t1) {
  const numSegments = 20;
  const dt = (t1 - t0) / numSegments;
  ctx.beginPath();
  let start = quadraticBezierPoint(t0, p0, cp, p1);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i <= numSegments; i++) {
    const t = t0 + dt*i;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}

function approximateQuadraticBezierLength(p0, cp, p1) {
  const numSegments = 20;
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= numSegments; i++) {
    const t = i/numSegments;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    length += Math.sqrt(dx*dx + dy*dy);
    prev = pt;
  }
  return length;
}

function drawAngleFan(pPrev, p, pNext, radius) {
  const v1 = { x: pPrev.x - p.x, y: pPrev.y - p.y };
  const v2 = { x: pNext.x - p.x, y: pNext.y - p.y };
  let angle1 = Math.atan2(v1.y, v1.x);
  let angle2 = Math.atan2(v2.y, v2.x);
  let diff = angle2 - angle1;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  const absDiff = Math.abs(diff);
  const internalCenter = Math.atan2(Math.sin(angle1)+Math.sin(angle2), Math.cos(angle1)+Math.cos(angle2));
  const internalHalfAngle = absDiff / 2;
  const externalCenter = (internalCenter + Math.PI) % (2*Math.PI);
  const externalHalfAngle = (2*Math.PI - absDiff) / 2;
  const fanPos = (p.angleProperty.fanPosition !== undefined) ? p.angleProperty.fanPosition : 0;
  const center = lerpAngle(internalCenter, externalCenter, fanPos);
  const halfAngle = internalHalfAngle * (1 - fanPos) + externalHalfAngle * fanPos;
  const startAngle = center - halfAngle;
  const endAngle = center + halfAngle;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, radius, startAngle, endAngle, false);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,0,0,0.3)";
  ctx.fill();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 1;
  ctx.stroke();
  const baseX = p.x + (radius+10)*Math.cos(center);
  const baseY = p.y + (radius+10)*Math.sin(center);
  const xAdj = p.angleProperty.labelOffsetX || 0;
  const yAdj = p.angleProperty.labelOffsetY || 0;
  const fontSize = p.angleProperty.labelFontSize || 12;
  const textX = baseX + xAdj;
  const textY = baseY + yAdj;
  ctx.fillStyle = "red";
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p.angleProperty.labelOverride.trim() !== "" ? p.angleProperty.labelOverride : (absDiff*180/Math.PI).toFixed(1)+"°";
  ctx.fillText(label, textX, textY);
}

function drawVertex(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, 2*Math.PI);
  ctx.fillStyle = "yellow";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ポリゴン複製
function duplicatePolygon(poly) {
  const newPoly = JSON.parse(JSON.stringify(poly));
  newPoly.groupId = null;
  polygons.push(newPoly);
  saveState();
  updateDrawing();
}

// -------------------------------
// ★ プロパティパネル更新処理
// -------------------------------
function updatePropertyPanel() {
  polyPropertiesDiv.innerHTML = "";

  if (currentMode !== "edit") {
    polyPropertiesDiv.innerHTML = "<p>編集モードでオブジェクトを選択するとプロパティが表示されます。</p>";
    return;
  }

  // ★ グループ選択中の場合
  if (selectedGroupId != null && groups[selectedGroupId]) {
    let grp = groups[selectedGroupId];

    // サブオブジェクトが個別選択されている場合は、その通常編集UIを表示
    if (selectedGroupSubObject) {
      let { type, index } = selectedGroupSubObject;
      // 「戻る」ボタンでサブ選択を解除
      let backBtn = document.createElement("button");
      backBtn.textContent = "グループに戻る";
      backBtn.addEventListener("click", () => {
        selectedGroupSubObject = null;
        updatePropertyPanel();
      });
      polyPropertiesDiv.appendChild(backBtn);

      // ポリゴンかテキストか
      if (type === "polygon") {
        // 単一ポリゴン編集UIを再利用
        let poly = polygons[index];
        renderSinglePolygonProperties(poly, index);
      } else if (type === "text") {
        let tObj = texts[index];
        renderSingleTextProperties(tObj, index);
      }
      return;
    }

    // サブ選択がない場合 → グループ全体の簡易情報 + グループ内要素へのリンク
    let container = document.createElement("div");
    container.className = "polyContainer";
    let header = document.createElement("h3");
    header.textContent = `グループ #${selectedGroupId}`;
    container.appendChild(header);
    let pCount = grp.polygons.length;
    let tCount = grp.texts.length;
    let info = document.createElement("p");
    info.textContent = `ポリゴン数: ${pCount}, テキスト数: ${tCount}`;
    container.appendChild(info);

    // ポリゴン一覧
    grp.polygons.forEach((pIdx) => {
      let item = document.createElement("div");
      item.style.margin = "4px 0";
      let label = `ポリゴン ${pIdx + 1}`;
      let link = document.createElement("button");
      link.textContent = label;
      link.addEventListener("click", () => {
        // ここでそのポリゴンをサブ選択
        selectedGroupSubObject = { type: "polygon", index: pIdx };
        updatePropertyPanel();
      });
      item.appendChild(link);
      container.appendChild(item);
    });

    // テキスト一覧
    grp.texts.forEach((tIdx) => {
      let item = document.createElement("div");
      item.style.margin = "4px 0";
      let label = `テキスト ${tIdx + 1}`;
      let link = document.createElement("button");
      link.textContent = label;
      link.addEventListener("click", () => {
        // サブ選択
        selectedGroupSubObject = { type: "text", index: tIdx };
        updatePropertyPanel();
      });
      item.appendChild(link);
      container.appendChild(item);
    });

    polyPropertiesDiv.appendChild(container);
    return;
  }

  // グループが選択されていない場合
  if (selectedPolygonIndices.length === 0 && selectedTextIndices.length === 0) {
    polyPropertiesDiv.innerHTML = "<p>オブジェクトが選択されていません</p>";
    return;
  }

  // テキストが1つだけ選択
  if (selectedPolygonIndices.length === 0 && selectedTextIndices.length === 1) {
    let i = selectedTextIndices[0];
    renderSingleTextProperties(texts[i], i);
    return;
  }

  // ポリゴンが1つだけ選択
  if (selectedPolygonIndices.length === 1 && selectedTextIndices.length === 0) {
    let pIndex = selectedPolygonIndices[0];
    if (pIndex === "current") {
      renderSinglePolygonProperties(currentPolygon, "current");
    } else {
      renderSinglePolygonProperties(polygons[pIndex], pIndex);
    }
    return;
  }

  // 複数同時選択
  polyPropertiesDiv.innerHTML = "<p>複数オブジェクト選択中です</p>";
}

// -------------------------------
// ★ 個別ポリゴン/テキストのUI描画関数
// -------------------------------
function renderSinglePolygonProperties(poly, pIndex) {
  let headerText = (pIndex === "current") ? "未完成ポリゴン" : `ポリゴン ${pIndex+1}`;
  const polyContainer = document.createElement("div");
  polyContainer.className = "polyContainer";
  const header = document.createElement("h3");
  header.textContent = headerText;
  polyContainer.appendChild(header);

  if (pIndex !== "current" && typeof pIndex === "number") {
    const duplicateBtn = document.createElement("button");
    duplicateBtn.textContent = "複製";
    duplicateBtn.addEventListener("click", function() {
      duplicatePolygon(poly);
    });
    polyContainer.appendChild(duplicateBtn);
  }

  const edgeHeader = document.createElement("div");
  edgeHeader.className = "subHeader";
  edgeHeader.textContent = "辺のプロパティ";
  polyContainer.appendChild(edgeHeader);
  const edgeCount = poly.points.length > 0
    ? (poly.isClosed ? poly.points.length : poly.points.length - 1)
    : 0;

  for (let i = 0; i < edgeCount; i++) {
    const container = document.createElement("div");
    container.className = "propItem";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = poly.points[i].edgeProperty.showEdgeLength;
    cb.addEventListener("change", function() {
      poly.points[i].edgeProperty.showEdgeLength = cb.checked;
      saveState();
      updateDrawing();
    });
    container.appendChild(cb);
    const label = document.createElement("label");
    label.textContent = `辺 ${i+1} 表示`;
    container.appendChild(label);

    const segmentColorInput = document.createElement("input");
    segmentColorInput.type = "color";
    segmentColorInput.value = poly.points[i].edgeProperty.segmentColor;
    segmentColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.segmentColor = segmentColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 線分色: "));
    container.appendChild(segmentColorInput);

    const bezierColorInput = document.createElement("input");
    bezierColorInput.type = "color";
    bezierColorInput.value = poly.points[i].edgeProperty.bezierColor;
    bezierColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.bezierColor = bezierColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ベジェ色: "));
    container.appendChild(bezierColorInput);

    const labelColorInput = document.createElement("input");
    labelColorInput.type = "color";
    labelColorInput.value = poly.points[i].edgeProperty.labelColor;
    labelColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.labelColor = labelColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベル色: "));
    container.appendChild(labelColorInput);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "自動値";
    textInput.value = poly.points[i].edgeProperty.labelOverride || "";
    textInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOverride = textInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 表示ラベル: "));
    container.appendChild(textInput);

    const gapRangeElem = createLabelRange("ベジェ切れ目", poly.points[i].edgeProperty.bezierGap, 0, 1, 0.05, (ev) => {
      poly.points[i].edgeProperty.bezierGap = parseFloat(ev.target.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(gapRangeElem);

    const offsetXInput = document.createElement("input");
    offsetXInput.type = "number";
    offsetXInput.value = poly.points[i].edgeProperty.labelOffsetX || 0;
    offsetXInput.style.width = "60px";
    offsetXInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOffsetX = parseFloat(offsetXInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルX: "));
    container.appendChild(offsetXInput);

    const offsetYInput = document.createElement("input");
    offsetYInput.type = "number";
    offsetYInput.value = poly.points[i].edgeProperty.labelOffsetY || 0;
    offsetYInput.style.width = "60px";
    offsetYInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOffsetY = parseFloat(offsetYInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルY: "));
    container.appendChild(offsetYInput);

    const fontSizeInput = document.createElement("input");
    fontSizeInput.type = "number";
    fontSizeInput.value = poly.points[i].edgeProperty.labelFontSize || 12;
    fontSizeInput.style.width = "60px";
    fontSizeInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelFontSize = parseFloat(fontSizeInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 文字サイズ: "));
    container.appendChild(fontSizeInput);

    polyContainer.appendChild(container);
  }

  const angleHeader = document.createElement("div");
  angleHeader.className = "subHeader";
  angleHeader.textContent = "角のプロパティ";
  polyContainer.appendChild(angleHeader);
  let angleIndices = [];
  if (poly.isClosed) {
    for (let i = 0; i < poly.points.length; i++) { angleIndices.push(i); }
  } else if (poly.points.length >= 3) {
    for (let i = 1; i < poly.points.length - 1; i++) { angleIndices.push(i); }
  }
  angleIndices.forEach(i => {
    const container = document.createElement("div");
    container.className = "propItem";
    const angleCb = document.createElement("input");
    angleCb.type = "checkbox";
    angleCb.checked = poly.points[i].angleProperty.showAngle;
    angleCb.addEventListener("change", function() {
      poly.points[i].angleProperty.showAngle = angleCb.checked;
      saveState();
      updateDrawing();
    });
    container.appendChild(angleCb);
    const angleLabel = document.createElement("label");
    angleLabel.textContent = `頂点 ${i+1} 表示`;
    container.appendChild(angleLabel);

    const radiusSlider = document.createElement("input");
    radiusSlider.type = "range";
    radiusSlider.min = "10";
    radiusSlider.max = "100";
    radiusSlider.value = poly.points[i].angleProperty.radius;
    const radiusSpan = document.createElement("span");
    radiusSpan.textContent = radiusSlider.value;
    radiusSlider.addEventListener("input", function() {
      poly.points[i].angleProperty.radius = parseFloat(radiusSlider.value);
      radiusSpan.textContent = radiusSlider.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 半径: "));
    container.appendChild(radiusSlider);
    container.appendChild(radiusSpan);

    const fanCheckbox = document.createElement("input");
    fanCheckbox.type = "checkbox";
    fanCheckbox.checked = (poly.points[i].angleProperty.fanPosition === 1);
    fanCheckbox.addEventListener("change", function() {
      poly.points[i].angleProperty.fanPosition = fanCheckbox.checked ? 1 : 0;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 外側扇形: "));
    container.appendChild(fanCheckbox);

    const angleTextInput = document.createElement("input");
    angleTextInput.type = "text";
    angleTextInput.placeholder = "自動値";
    angleTextInput.value = poly.points[i].angleProperty.labelOverride || "";
    angleTextInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOverride = angleTextInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 表示ラベル: "));
    container.appendChild(angleTextInput);

    const angleOffsetXInput = document.createElement("input");
    angleOffsetXInput.type = "number";
    angleOffsetXInput.value = poly.points[i].angleProperty.labelOffsetX || 0;
    angleOffsetXInput.style.width = "60px";
    angleOffsetXInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOffsetX = parseFloat(angleOffsetXInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルX: "));
    container.appendChild(angleOffsetXInput);

    const angleOffsetYInput = document.createElement("input");
    angleOffsetYInput.type = "number";
    angleOffsetYInput.value = poly.points[i].angleProperty.labelOffsetY || 0;
    angleOffsetYInput.style.width = "60px";
    angleOffsetYInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOffsetY = parseFloat(angleOffsetYInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルY: "));
    container.appendChild(angleOffsetYInput);

    const angleFontSizeInput = document.createElement("input");
    angleFontSizeInput.type = "number";
    angleFontSizeInput.value = poly.points[i].angleProperty.labelFontSize || 12;
    angleFontSizeInput.style.width = "60px";
    angleFontSizeInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelFontSize = parseFloat(angleFontSizeInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 文字サイズ: "));
    container.appendChild(angleFontSizeInput);

    polyContainer.appendChild(container);
  });
  polyPropertiesDiv.appendChild(polyContainer);
}

function renderSingleTextProperties(tObj, tIndex) {
  let container = document.createElement("div");
  container.className = "textProperties";
  let header = document.createElement("h3");
  header.textContent = `テキストオブジェクト ${tIndex+1}`;
  container.appendChild(header);

  let dupBtn = document.createElement("button");
  dupBtn.textContent = "複製";
  dupBtn.addEventListener("click", function() {
    let newText = JSON.parse(JSON.stringify(tObj));
    newText.groupId = null;
    texts.push(newText);
    saveState();
    updateDrawing();
  });
  container.appendChild(dupBtn);

  let contentLabel = document.createElement("label");
  contentLabel.textContent = "内容: ";
  let contentInput = document.createElement("input");
  contentInput.type = "text";
  contentInput.value = tObj.content;
  contentInput.addEventListener("change", function() {
    tObj.content = contentInput.value;
    saveState();
    updateDrawing();
  });
  container.appendChild(contentLabel);
  container.appendChild(contentInput);

  let xLabel = document.createElement("label");
  xLabel.textContent = " X: ";
  let xInput = document.createElement("input");
  xInput.type = "number";
  xInput.value = tObj.x;
  xInput.addEventListener("change", function() {
    tObj.x = parseFloat(xInput.value);
    saveState();
    updateDrawing();
  });
  container.appendChild(xLabel);
  container.appendChild(xInput);

  let yLabel = document.createElement("label");
  yLabel.textContent = " Y: ";
  let yInput = document.createElement("input");
  yInput.type = "number";
  yInput.value = tObj.y;
  yInput.addEventListener("change", function() {
    tObj.y = parseFloat(yInput.value);
    saveState();
    updateDrawing();
  });
  container.appendChild(yLabel);
  container.appendChild(yInput);

  let fsLabel = document.createElement("label");
  fsLabel.textContent = " 文字サイズ: ";
  let fsInput = document.createElement("input");
  fsInput.type = "number";
  fsInput.value = tObj.fontSize;
  fsInput.addEventListener("change", function() {
    tObj.fontSize = parseFloat(fsInput.value);
    saveState();
    updateDrawing();
  });
  container.appendChild(fsLabel);
  container.appendChild(fsInput);

  let colorLabel = document.createElement("label");
  colorLabel.textContent = " 色: ";
  let colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = tObj.color;
  colorInput.addEventListener("input", function() {
    tObj.color = colorInput.value;
    saveState();
    updateDrawing();
  });
  container.appendChild(colorLabel);
  container.appendChild(colorInput);

  polyPropertiesDiv.appendChild(container);
}

// -------------------------------
// 初期描画 
// -------------------------------
updateDrawing();
