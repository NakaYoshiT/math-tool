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
              const prev = poly.points[(i-1+poly.points.length)%poly.points.length];
              const curr = poly.points[i];
              const next = poly.points[(i+1)%poly.points.length];
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
      // 編集時は頂点やエッジコントロールも描画
      if (currentMode === "edit") {
        poly.points.forEach(p => drawVertex(p));
        const segCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
        for (let i = 0; i < segCount; i++) {
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
  
  // 未完成ポリゴン（描画中）
  if (currentPolygon.points.length > 0) {
    if (currentPolygon.points.length > 1) {
      const segCount = currentPolygon.points.length - 1;
      for (let i = 0; i < segCount; i++) {
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
            const prev = currentPolygon.points[i-1],
                  curr = currentPolygon.points[i],
                  next = currentPolygon.points[i+1];
            drawAngleFan(prev, curr, next, currentPolygon.points[i].angleProperty.radius);
          }
        }
      }
    }
    if (currentMode === "edit") {
      currentPolygon.points.forEach(p => drawVertex(p));
      const segCount = currentPolygon.points.length > 0 ? currentPolygon.points.length - 1 : 0;
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
  updatePropertyPanel();
  ctx.restore();
};

window.drawEdgeLengthBezier = function(p1, p2, cp) {
  ctx.strokeStyle = p1.edgeProperty.bezierColor;
  ctx.lineWidth = 2;
  let gap = p1.edgeProperty.bezierGap;
  if (gap >= 1) {
    // 何もしない
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
  const xAdj = p1.edgeProperty.labelOffsetX || 0, yAdj = p1.edgeProperty.labelOffsetY || 0;
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
    const t = i/numSegments;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    const dx = pt.x - prev.x, dy = pt.y - prev.y;
    length += Math.sqrt(dx*dx + dy*dy);
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
  const xAdj = p.angleProperty.labelOffsetX || 0, yAdj = p.angleProperty.labelOffsetY || 0;
  const fontSize = p.angleProperty.labelFontSize || 12;
  const textX = baseX + xAdj, textY = baseY + yAdj;
  ctx.fillStyle = "red";
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p.angleProperty.labelOverride.trim() !== "" ? p.angleProperty.labelOverride : (absDiff*180/Math.PI).toFixed(1)+"°";
  ctx.fillText(label, textX, textY);
};

window.drawVertex = function(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, 2*Math.PI);
  ctx.fillStyle = "yellow";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
};

window.drawEdgeControl = function(cp) {
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, 2*Math.PI);
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
