//CONFIGURAZIONE
const CSV_FILE   = 'data.csv';
const MAP_IMAGE  = 'cartina.jpg';
const MARGIN     = 48;

// COLORE=ALTEZZA SLM
const VIS_ELEV_MIN = -6000;
const VIS_ELEV_MAX =  7000;

// CARTINA
const PROJECTION  = 'equirect';
const LON_CENTER  = 0;
const IMG_LEFT    = 0.085;
const IMG_RIGHT   = 0.975;
const IMG_TOP     = 0.060;
const IMG_BOTTOM  = 0.965;


let table = null, rows = [];
let worldImg = null;
let elevMin = 0, elevMax = 0;
let mapRect = { x: 0, y: 0, w: 0, h: 0 };
let hoverIndex = -1;

// 
let diag = {
  csvLoaded:false, imgLoaded:false,
  found:{lat:null, lon:null, elev:null, name:null, country:null, type:null, status:null},
  parseRows:0, errors:[]
};

function preload() {
  table = loadTable(CSV_FILE, 'csv', 'header',
    () => { diag.csvLoaded = true; console.log('[OK] CSV'); },
    (e)  => { console.error('[ERRORE] CSV', e); }
  );

  worldImg = loadImage(MAP_IMAGE,
    () => { diag.imgLoaded = true; console.log('[OK] mappa'); },
    ()  => { console.warn('[WARN] mappa non trovata'); worldImg = null; }
  );
}

function setup() {
  createCanvas(window.innerWidth, window.innerHeight);
  textFont('sans-serif');
  noLoop();

  if (!table) { drawError('CSV non caricato (data.csv).'); return; }

  // MAPPA NBOMI E COLONNE
  const headers = table.columns.map(c => c.trim());
  const findCol = (cands) => {
    for (const cand of cands) {
      const hit = headers.find(h => h.toLowerCase() === cand.toLowerCase());
      if (hit) return hit;
    }
   
    for (const h of headers) {
      for (const cand of cands) {
        if (h.toLowerCase().includes(cand.toLowerCase())) return h;
      }
    }
    return null;
  };

  diag.found.lat    = findCol(['Latitude','Lat']);
  diag.found.lon    = findCol(['Longitude','Long','Lng']);
  diag.found.elev   = findCol(['Elevation (m)','Elevation','Elev']);
  diag.found.name   = findCol(['Volcano Name','Name']);
  diag.found.country= findCol(['Country']);
  diag.found.type   = findCol(['Type']);
  diag.found.status = findCol(['Status']);

  if (!diag.found.lat || !diag.found.lon) {
    drawError(`Colonne mancanti: ${!diag.found.lat?'Latitude ':''}${!diag.found.lon?'Longitude':''}\nTrovate intestazioni: ${headers.join(', ')}`);
    return;
  }
  if (!diag.found.elev) {
    console.warn('Colonna Elevation non trovata: userò raggio minimo fisso');
  }

  // HELPER NUMERICO
  const toNum = (v) => {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    let s = (''+v).trim();
    if (s === '' || s.toLowerCase() === 'na' || s.toLowerCase() === 'null') return NaN;
    //ULTIMO . O , è DECIMALE
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) { 
        s = s.replace(/\./g,'').replace(',','.');
      } else { 
        s = s.replace(/,/g,'');
      }
    } else if (lastComma > -1) {
      s = s.replace(',','.');
    } else if (lastDot > -1) {
    
    }
    return parseFloat(s);
  };

  //
  rows = [];
  for (let r = 0; r < table.getRowCount(); r++) {
    try {
      const lat  = toNum(table.get(r, diag.found.lat));
      const lon  = toNum(table.get(r, diag.found.lon));
      const elev = diag.found.elev ? toNum(table.get(r, diag.found.elev)) : NaN;
      if (isNaN(lat) || isNaN(lon)) continue;

      rows.push({
        lat, lon,
        elev: isNaN(elev) ? null : elev,
        name: diag.found.name   ? table.getString(r, diag.found.name)   : '',
        country: diag.found.country ? table.getString(r, diag.found.country) : '',
        type: diag.found.type   ? table.getString(r, diag.found.type)   : '',
        status: diag.found.status ? table.getString(r, diag.found.status) : '',
      });
    } catch (e) {
      diag.errors.push(`row ${r}: ${e}`);
    }
  }
  diag.parseRows = rows.length;

  const elevs = rows.map(d => d.elev).filter(v => v != null && !isNaN(v));
  elevMin = elevs.length ? min(elevs) : 0;
  elevMax = elevs.length ? max(elevs) : 1;

  computeMapRect();
  redraw();
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
  computeMapRect();
  redraw();
}

function computeMapRect() {
  const availW = width  - MARGIN*2;
  const availH = height - MARGIN*2 - 120;
  let w = availW, h = w / 2;
  if (h > availH) { h = availH; w = h * 2; }
  const x = (width - w)/2;
  const y = MARGIN + 24;
  mapRect = { x, y, w, h };
}

//
function wrapLon(lonDeg) { return ((lonDeg - LON_CENTER) + 540) % 360 - 180; }
function lonToX(lonDeg) {
  const lon = wrapLon(lonDeg);
  const u = (lon + 180) / 360;
  const uImg = IMG_LEFT + u * (IMG_RIGHT - IMG_LEFT);
  return mapRect.x + uImg * mapRect.w;
}
function latToY(latDeg) {
  
  const v = (90 - latDeg) / 180;
  const vImg = IMG_TOP + v * (IMG_BOTTOM - IMG_TOP);
  return mapRect.y + vImg * mapRect.h;
}

//DRAW
function draw() {
  background(16);

//TITOLO
fill(240);
textAlign(CENTER, TOP);
textSize(28);
text("VULCANI NEL MONDO", width / 2, 10);

// SOTTOTITOLO
fill(220);
textSize(15);
textAlign(CENTER, TOP);
text(
  "Ogni punto rappresenta un vulcano  •  Dimensione= Grandezza vulcano  •  Colore= Altitudine s.l.m.",
  width / 2,
  mapRect.y + mapRect.h + 120
);

 
  //CARD
  noStroke(); fill(0,80); rect(mapRect.x-16, mapRect.y-16, mapRect.w+32, mapRect.h+32, 18);
  fill(24); rect(mapRect.x-12, mapRect.y-12, mapRect.w+24, mapRect.h+24, 16);

  // MAPPA
  if (worldImg) {
    tint(200,200,200,255);
    image(worldImg, mapRect.x, mapRect.y, mapRect.w, mapRect.h);
    noTint();
  } else {
    fill(40); rect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);
  }



  if (!rows.length) {
    fill(220); textSize(14); textAlign(CENTER, CENTER);
    text('Nessuna riga valida dal CSV (controlla intestazioni e valori lat/lon).', width/2, mapRect.y + mapRect.h/2);
    return;
  }

  hoverIndex = -1;

  // GLIFI
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];
    const x = lonToX(d.lon);
    const y = latToY(d.lat);

    let r = 4;
    if (d.elev != null) {
      const norm = constrain((d.elev - elevMin) / (elevMax - elevMin), 0, 1);
      r = map(Math.sqrt(norm), 0, 1, 4, 18);
    }

    const col = elevToColor(d.elev);

    noStroke(); fill(0,80); ellipse(x+1.6, y+2, r*2.12, r*2.12);
    fill(col); ellipse(x, y, r*2, r*2);
    stroke(255,220); noFill(); strokeWeight(1); ellipse(x, y, r*2, r*2);

    if (dist(mouseX, mouseY, x, y) <= r + 2) hoverIndex = i;
  }

  drawColorbar();
  if (hoverIndex >= 0) drawTooltip(rows[hoverIndex]);
}

function drawDiagBadge() {
  const f = diag.found;
  const msg =
    `CSV:${diag.csvLoaded?'OK':'NO'} IMG:${diag.imgLoaded?'OK':'NO'}  ` +
    `rows:${diag.parseRows}  lat:${f.lat||'–'}  lon:${f.lon||'–'}  elev:${f.elev||'–'}`;
  const w = textWidth(msg) + 20;
  const x = mapRect.x + mapRect.w - w - 8;
  const y = mapRect.y - 38;
  noStroke(); fill(0,150); rect(x+3,y+4,w,28,8);
  fill(32); rect(x,y,w,28,8);
  fill(220); textSize(12); textAlign(LEFT, CENTER);
  text(msg, x+10, y+14);
}

function elevToColor(elev) {
  const e = (elev == null || isNaN(elev)) ? VIS_ELEV_MIN : elev;
  const t = constrain((e - VIS_ELEV_MIN) / (VIS_ELEV_MAX - VIS_ELEV_MIN), 0, 1);
  const c1 = color(195,30,30), c2 = color(230,120,30), c3 = color(250,210,70);
  return (t < 0.5) ? lerpColor(c1, c2, map(t, 0, 0.5, 0, 1)) : lerpColor(c2, c3, map(t, 0.5, 1, 0, 1));
}

function drawColorbar() {
  const barW = min(420, mapRect.w * 0.6), barH = 18;
  const x = mapRect.x + (mapRect.w - barW)/2;
  const y = mapRect.y + mapRect.h + 36;

  noStroke(); fill(0,80); rect(x-14, y-26, barW+28, 64, 14);
  fill(24); rect(x-10, y-22, barW+20, 56, 12);

  fill(220); textSize(12); textAlign(CENTER, BOTTOM);
  text('Elevation (m)', x + barW/2, y - 6);

  for (let i = 0; i < barW; i++) {
    const t = i / (barW - 1);
    stroke(elevToColor(lerp(VIS_ELEV_MIN, VIS_ELEV_MAX, t)));
    line(x + i, y, x + i, y + barH);
  }
  noFill(); stroke(255,60); rect(x, y, barW, barH, 8);

  fill(200); noStroke(); textSize(11); textAlign(CENTER, TOP);
  text(nf(VIS_ELEV_MIN,0,0), x, y + barH + 6);
  text(nf((VIS_ELEV_MIN+VIS_ELEV_MAX)/2,0,0), x + barW/2, y + barH + 6);
  text(nf(VIS_ELEV_MAX,0,0), x + barW, y + barH + 6);
}

function drawTooltip(d) {
  const x = lonToX(d.lon), y = latToY(d.lat);
  const lines = [
    (d.name || '') + (d.country ? ' — ' + d.country : ''),
    'Type: ' + (d.type || '-'),
    'Status: ' + (d.status || '-'),
    'Elevation: ' + (d.elev != null ? d.elev + ' m' : 'n/d')
  ];
  const w = 280, h = lines.length * 18 + 14;
  const bx = constrain(x + 16, mapRect.x, mapRect.x + mapRect.w - w);
  const by = constrain(y - h - 10, mapRect.y, mapRect.y + mapRect.h - h);

  noStroke(); fill(0,120); rect(bx + 3, by + 4, w, h, 10);
  fill(32); rect(bx, by, w, h, 10);

  fill(235); textSize(13); textAlign(LEFT, TOP);
  let ty = by + 8; for (const L of lines) { text(L, bx + 10, ty); ty += 18; }

  stroke(255); strokeWeight(2); noFill(); ellipse(x, y, 20, 20);
}

function drawError(msg){ background(250); fill(200,0,0); textSize(16); text(msg, 20, 40); }
function mouseMoved(){ redraw(); }
