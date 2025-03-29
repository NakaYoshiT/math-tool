// drawing.js

// ※ このファイルは core.js の後に読み込むこと

// -------------------------------
// 描画関数
// -------------------------------
window.updateDrawing = function() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(zoomLevel, zoomLevel);
  if (showGridCheckbox.checked) drawGrid();
  
  // ポリゴン描画
  polygons.forEach(poly => {
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
              const prev = poly.points[(i-1+poly.points.length) % poly.points.length];
              const curr = poly.points[i];
              const next = poly.points[(i+1) % poly.points.length];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        } else if (poly.points.length >= 3) {
          for (let i = 1; i < poly.points.length - 1; i++) {
            if (poly.points[i].angleProperty.showAngle) {
              const prev = poly.points[i-1], curr = poly.points[i], next = poly.points[i+1];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        }
      }
      if (currentMode === "edit") {
        poly.points.forEach(p => drawVertex(p));
        const segCount2 = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
        for (let i = 0; i < segCount2; i++) {
          const cp = getEdgeControlPoint(poly, i);
          drawEdgeControl(cp);
        }
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
    if (selectedTextIndex === index) {
      let metrics = ctx.measureText(t.content);
      let width = metrics.width;
      let height = t.fontSize;
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 1;
      ctx.strokeRect(t.x - width/2, t.y - height/2, width, height);
    }
  });
  
  // 未完成のポリゴン（描画中）
  if (currentPolygon.points.length > 0) {
    if (currentPolygon.points.length > 1) {
      const segCount3 = currentPolygon.points.length - 1;
      for (let i = 0; i < segCount3; i++) {
        const p1 = currentPolygon.points[i], p2 = currentPolygon.points[i+1];
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
            const prev = currentPolygon.points[i-1], curr = currentPolygon.points[i], next = currentPolygon.points[i+1];
            drawAngleFan(prev, curr, next, currentPolygon.points[i].angleProperty.radius);
          }
        }
      }
    }
    if (currentMode === "edit") {
      currentPolygon.points.forEach(p => drawVertex(p));
      const segCount4 = currentPolygon.points.length > 0 ? currentPolygon.points.length - 1 : 0;
      for (let i = 0; i < segCount4; i++) {
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
  
  updatePropertyPanel();
  ctx.restore();
};

window.drawGrid = function() {
  const gridSize = 20;
  ctx.save();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width/zoomLevel; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height/zoomLevel);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height/zoomLevel; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width/zoomLevel, y);
    ctx.stroke();
  }
  ctx.restore();
};

window.drawEdgeLengthBezier = function(p1, p2, cp) {
  ctx.strokeStyle = p1.edgeProperty.bezierColor;
  ctx.lineWidth = 2;
  let gap = p1.edgeProperty.bezierGap;
  if (gap >= 1) {
    // gapが1以上なら何もしない
  } else if (gap <= 0) {
    drawQuadraticSegment(p1, cp, p2, 0, 1);
  } else {
    let t1 = 0.5 - gap/2, t2 = 0.5 + gap/2;
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
  const baseOffset = 5, verticalShift = -10;
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
};

window.quadraticBezierPoint = function(t, p0, cp, p1) {
  const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*cp.x + t*t*p1.x;
  const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*cp.y + t*t*p1.y;
  return { x, y };
};

window.drawQuadraticSegment = function(p0, cp, p1, t0, t1) {
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
};

window.approximateQuadraticBezierLength = function(p0, cp, p1) {
  const numSegments = 20;
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= numSegments; i++) {
    const t = i / numSegments;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    const dx = pt.x - prev.x, dy = pt.y - prev.y;
    length += Math.sqrt(dx * dx + dy * dy);
    prev = pt;
  }
  return length;
};

window.drawAngleFan = function(pPrev, p, pNext, radius) {
  const v1 = { x: pPrev.x - p.x, y: pPrev.y - p.y };
  const v2 = { x: pNext.x - p.x, y: pNext.y - p.y };
  let angle1 = Math.atan2(v1.y, v1.x);
  let angle2 = Math.atan2(v2.y, v2.x);
  let diff = angle2 - angle1;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  const absDiff = Math.abs(diff);
  const internalCenter = Math.atan2(Math.sin(angle1) + Math.sin(angle2), Math.cos(angle1) + Math.cos(angle2));
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
  const baseX = p.x + (radius + 10) * Math.cos(center);
  const baseY = p.y + (radius + 10) * Math.sin(center);
  const xAdj = p.angleProperty.labelOffsetX || 0;
  const yAdj = p.angleProperty.labelOffsetY || 0;
  const fontSize = p.angleProperty.labelFontSize || 12;
  const textX = baseX + xAdj, textY = baseY + yAdj;
  ctx.fillStyle = "red";
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p.angleProperty.labelOverride.trim() !== "" ? p.angleProperty.labelOverride : (absDiff * 180 / Math.PI).toFixed(1) + "°";
  ctx.fillText(label, textX, textY);
};

window.drawVertex = function(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
  ctx.fillStyle = "yellow";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
};

window.drawEdgeControl = function(cp) {
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "blue";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
};

// -------------------------------
// ポリゴン複製機能
// -------------------------------
window.duplicatePolygon = function(poly) {
  const newPoly = JSON.parse(JSON.stringify(poly));
  polygons.push(newPoly);
  saveState();
  updateDrawing();
};

// -------------------------------
// プロパティパネル更新処理
// -------------------------------
window.updatePropertyPanel = function() {
  polyPropertiesDiv.innerHTML = "";
  if (currentMode !== "edit" || (selectedPolygonIndex === null && selectedTextIndex === null)) {
    polyPropertiesDiv.innerHTML = "<p>オブジェクトが選択されていません</p>";
    return;
  }
  if (selectedTextIndex !== null) {
    let tObj = texts[selectedTextIndex];
    let container = document.createElement("div");
    container.className = "textProperties";
    let header = document.createElement("h3");
    header.textContent = "テキストオブジェクト";
    container.appendChild(header);
    let dupBtn = document.createElement("button");
    dupBtn.textContent = "複製";
    dupBtn.addEventListener("click", function() {
      let newText = JSON.parse(JSON.stringify(tObj));
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
    return;
  }
  
  // ポリゴンオブジェクトの場合
  let poly, headerText;
  if (selectedPolygonIndex === "current") {
    poly = currentPolygon;
    headerText = "未完成ポリゴン";
  } else {
    poly = polygons[selectedPolygonIndex];
    headerText = `ポリゴン ${selectedPolygonIndex + 1}`;
  }
  const polyContainer = document.createElement("div");
  polyContainer.className = "polyContainer";
  const header = document.createElement("h3");
  header.textContent = headerText;
  polyContainer.appendChild(header);
  
  if (selectedPolygonIndex !== "current") {
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
  const edgeCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
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
    label.textContent = `辺 ${i + 1} 表示`;
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
    
    const gapRangeElem = createLabelRange("ベジェ切れ目", poly.points[i].edgeProperty.bezierGap, 0, 1, 0.05, function(ev) {
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
};
