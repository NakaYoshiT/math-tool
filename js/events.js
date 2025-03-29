// events.js

// ※ このファイルは core.js および drawing.js の後に読み込むこと

// グローバル変数（ポリゴン編集用）
window.draggingEdgeControl = false;
window.currentEdgeControlPolyIndex = null;
window.currentEdgeControlIndex = null;
window.draggingVertex = false;
window.currentDragPolyIndex = null;
window.currentDragVertexIndex = null;
window.draggingPolygon = false;
window.polygonDragStart = null;
window.initialPolygonPoints = [];
window.initialEdgeControls = [];

// テキスト編集用のドラッグ状態
window.draggingText = false;
window.currentDragTextIndex = null;
window.textDragStart = null;
window.initialTextPos = null;

// モードに応じたイベント設定
canvas.addEventListener("mousedown", handleCanvasDown);
canvas.addEventListener("touchstart", handleCanvasDown);
canvas.addEventListener("mousemove", handleCanvasMove);
canvas.addEventListener("touchmove", handleCanvasMove);
canvas.addEventListener("mouseup", endDrag);
canvas.addEventListener("touchend", endDrag);

function handleCanvasDown(e) {
  e.preventDefault();
  let pos = getMousePos(e);
  if (snapGridCheckbox && snapGridCheckbox.checked) {
    pos = snapToGrid(pos);
  }
  
  // テキストモード：クリック位置に新規テキスト配置
  if (currentMode === "text") {
    saveState();
    texts.push({
      x: pos.x,
      y: pos.y,
      content: "テキスト",
      fontSize: 16,
      color: "black"
    });
    updateDrawing();
    return;
  }
  
  // 消去モード：ポリゴン削除、続いてテキスト削除
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
  
  currentMousePos = null;
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
  } else if (currentMode === "edit") {
    const threshold = 8;
    // まずポリゴンの編集（頂点・エッジ）をチェック
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      const edgeCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(poly, i);
        const dx = pos.x - cp.x, dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = p;
          currentEdgeControlIndex = i;
          selectedPolygonIndex = p;
          selectedTextIndex = null;
          return;
        }
      }
    }
    if (currentPolygon.points.length > 0) {
      const edgeCount = currentPolygon.points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(currentPolygon, i);
        const dx = pos.x - cp.x, dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = "current";
          currentEdgeControlIndex = i;
          selectedPolygonIndex = "current";
          selectedTextIndex = null;
          return;
        }
      }
    }
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      for (let i = 0; i < poly.points.length; i++) {
        const dx = pos.x - poly.points[i].x, dy = pos.y - poly.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = p;
          currentDragVertexIndex = i;
          selectedPolygonIndex = p;
          selectedTextIndex = null;
          return;
        }
      }
    }
    if (currentPolygon.points.length > 0) {
      for (let i = 0; i < currentPolygon.points.length; i++) {
        const dx = pos.x - currentPolygon.points[i].x, dy = pos.y - currentPolygon.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = "current";
          currentDragVertexIndex = i;
          selectedPolygonIndex = "current";
          selectedTextIndex = null;
          return;
        }
      }
    }
    // ポリゴン内部の選択
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      if (pointInPolygon(pos, poly.points)) {
        draggingPolygon = true;
        currentDragPolyIndex = p;
        selectedPolygonIndex = p;
        selectedTextIndex = null;
        polygonDragStart = pos;
        initialPolygonPoints = poly.points.map(pt => ({ x: pt.x, y: pt.y }));
        initialEdgeControls = poly.points.map(pt => pt.edgeControl ? { x: pt.edgeControl.x, y: pt.edgeControl.y } : null);
        return;
      }
    }
    // 次に、テキストオブジェクトの選択
    for (let i = texts.length - 1; i >= 0; i--) {
      let tObj = texts[i];
      ctx.save();
      ctx.font = (tObj.fontSize || 16) + "px sans-serif";
      let metrics = ctx.measureText(tObj.content);
      let width = metrics.width, height = tObj.fontSize;
      ctx.restore();
      if (pos.x >= tObj.x - width/2 && pos.x <= tObj.x + width/2 &&
          pos.y >= tObj.y - height/2 && pos.y <= tObj.y + height/2) {
        selectedTextIndex = i;
        selectedPolygonIndex = null;
        draggingText = true;
        currentDragTextIndex = i;
        textDragStart = pos;
        initialTextPos = { x: tObj.x, y: tObj.y };
        updateDrawing();
        return;
      }
    }
    selectedPolygonIndex = null;
    selectedTextIndex = null;
  }
}

function handleCanvasMove(e) {
  let pos = getMousePos(e);
  if (snapGridCheckbox && snapGridCheckbox.checked) {
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
    const dx = pos.x - polygonDragStart.x, dy = pos.y - polygonDragStart.y;
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
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingText && currentDragTextIndex !== null) {
    e.preventDefault();
    const dx = pos.x - textDragStart.x, dy = pos.y - textDragStart.y;
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
// その他のボタンイベント
// -------------------------------
clearBtn.addEventListener("click", function() {
  saveState();
  polygons = [];
  currentPolygon = { points: [], isClosed: false };
  texts = [];
  selectedPolygonIndex = null;
  selectedTextIndex = null;
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
if(snapGridCheckbox) { snapGridCheckbox.addEventListener("change", updateDrawing); }
