// BANERY RM: gdzie wiszą banery i tabliczki ofert, kto montował, objazd kontrolny, zdjęte do archiwum z powodem
// Dane w bazie Zadań RM (Supabase, to samo logowanie). Bez config.js albo z ?proba: tryb próbny w tej przeglądarce.
// Zapis objazdu robi baza jedną funkcją (setup.sql + setup-v2.sql, public.banery_objazd), ona też zakłada zadania przy problemach.
// v2: banery marketingowe (miejsce, nie oferta), zdjęcia (Storage „banery”), najkrótsza trasa objazdu z km do Kilometrówki.
const WERSJA = 'v2';

const TYPY = { oferta: ['🏡', 'Oferta'], marketing: ['📣', 'Marketingowy'] };
const RODZAJE = { '3d': ['🧊', 'Baner 3D'], oczka: ['🔘', 'Baner z oczkami'], stelaz: ['🪧', 'Baner na stelażu'], tabliczka: ['🏷️', 'Tabliczka'] };
const POWODY = { sprzedaz: ['🤝', 'Sprzedaż'], wynajecie: ['🔑', 'Wynajęcie'], wycofanie: ['↩️', 'Wycofanie oferty'], koniec: ['📅', 'Koniec umowy na miejsce'], inny: ['•', 'Inny powód'] };
const POWODY_TYPU = { oferta: ['sprzedaz', 'wynajecie', 'wycofanie', 'inny'], marketing: ['koniec', 'inny'] };
const STANY = { ok: ['✅', 'Wisi, w porządku'], uszkodzony: ['⚠️', 'Uszkodzony'], brak: ['❌', 'Nie ma go'] };
const DAWNO = 30; // po tylu dniach bez objazdu baner jest „do sprawdzenia”
const BIURO = { nazwa: 'Biuro, Szarych Szeregów 2c', lat: 54.18702, lng: 19.40336 }; // start i meta objazdu (jak w Kilometrówce)
const W_LINKU = 11; // link Map Google bierze start, 9 punktów pośrednich i metę

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoDzien = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dzis = () => isoDzien(new Date());
const dataPL = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const dniOd = (iso, doIso = dzis()) => iso ? Math.round((new Date(doIso.slice(0, 10) + 'T12:00') - new Date(iso.slice(0, 10) + 'T12:00')) / 864e5) : null;
const dniTxt = (n) => n === 0 ? 'dziś' : n === 1 ? 'wczoraj' : `${n} dni temu`;
const bezOgonkow = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
const rodzajTxt = (r) => (RODZAJE[r] || ['', r]).join(' ');
const kmTxt = (km) => km.toLocaleString('pl-PL', { maximumFractionDigits: 1, minimumFractionDigits: km < 10 ? 1 : 0 });
const czytajLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const piszLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ===================== MAGAZYN DANYCH =====================
function magazynSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const blad = (e) => { if (e) throw new Error(e.message || String(e)); };
  let user = null;
  async function profil() {
    const { data, error } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle(); blad(error);
    if (!data || !data.aktywny) throw new Error('To konto nie jest aktywne w zespole RM.');
    return data;
  }
  return {
    demo: false,
    async init() { const { data } = await sb.auth.getSession(); user = data.session?.user || null; return user ? { user, profil: await profil() } : null; },
    async zaloguj(email, haslo) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: haslo });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Zły e-mail albo hasło' : error.message);
      user = data.user; return { user, profil: await profil() };
    },
    async wyloguj() { await sb.auth.signOut(); },
    async osoby() { const { data, error } = await sb.from('profile').select('id, imie, rola, aktywny'); blad(error); return data; },
    async banery() { const { data, error } = await sb.from('banery').select('*').order('nieruchomosc'); blad(error); return data; },
    async dodaj(b) { const { data, error } = await sb.from('banery').insert(b).select().single(); blad(error); return data; },
    async zmien(id, zm) { const { error } = await sb.from('banery').update(zm).eq('id', id); blad(error); },
    async usun(id) { const { error } = await sb.from('banery').delete().eq('id', id); blad(error); },
    async objazd(wynik, uwagi) { const { error } = await sb.rpc('banery_objazd', { p_wynik: wynik, p_uwagi: uwagi }); blad(error); },
    async objazdy() { const { data, error } = await sb.from('banery_objazdy').select('*').order('kiedy', { ascending: false }).limit(30); blad(error); return data; },
    async usunObjazd(id) { const { error } = await sb.from('banery_objazdy').delete().eq('id', id); blad(error); },
    // zdjęcia w prywatnym koszyku Storage „banery”, folder = id baneru
    async wyslijFoto(banerId, blob, skad) {
      const sciezka = `${banerId}/${skad}-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('banery').upload(sciezka, blob, { contentType: 'image/jpeg', upsert: false }); blad(error);
      return sciezka;
    },
    async linkFoto(sciezka) { const { data, error } = await sb.storage.from('banery').createSignedUrl(sciezka, 3600); blad(error); return data.signedUrl; },
    nasluchuj(fn) {
      let t; const odpal = () => { clearTimeout(t); t = setTimeout(fn, 400); };
      sb.channel('rm-banery')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'banery' }, odpal)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'banery_objazdy' }, odpal)
        .subscribe();
    }
  };
}

function magazynProbny() {
  const czytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const pisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const user = { id: 'ja', email: 'tryb próbny' };
  const osoby = [{ id: 'ja', imie: 'Rafał (próba)', rola: 'admin', aktywny: true }, { id: 'aneta', imie: 'Aneta', rola: 'asystentka', aktywny: true }];
  const id = () => 'x' + Date.now() + Math.random().toString(36).slice(2, 6);
  const PUSTY = { typ: 'oferta', zdjecie: '', zdjecie_kiedy: null, adres: '', miejsce: '', rodzaj: 'oczka', ile: 1, montowal: null, montowal_obcy: '', zamontowano: dzis(), lat: null, lng: null, uwagi: '', stan: 'ok', stan_uwagi: '', sprawdzono: null, sprawdzil: null, aktywny: true, zdjeto: null, zdjeto_powod: '', zdjeto_uwagi: '', zdjal: null, dodal: 'ja' };
  if (!czytaj('bn-proba-banery', null)) pisz('bn-proba-banery', [
    { ...PUSTY, id: 'p1', nieruchomosc: 'Przykład: dom Zabrowo', adres: 'Zabrowo 11', miejsce: 'płot od strony drogi', rodzaj: 'stelaz', montowal: 'ja', zamontowano: '2026-09-20', sprawdzono: '2026-09-25', utworzono: '2026-09-20' },
    { ...PUSTY, id: 'p2', nieruchomosc: 'Przykład: mieszkanie Słoneczna 15B', adres: 'Słoneczna 15B, Elbląg', miejsce: 'balkon 2 piętro od ulicy', rodzaj: 'oczka', montowal: 'aneta', zamontowano: '2026-10-10', sprawdzono: '2026-10-20', utworzono: '2026-10-10' },
    { ...PUSTY, id: 'p3', nieruchomosc: 'Przykład: lokal Dąbrowskiego 2c', adres: 'Dąbrowskiego 2c, Elbląg', miejsce: 'witryna', rodzaj: '3d', montowal_obcy: 'Reklamy Elbląg', zamontowano: '2026-10-01', utworzono: '2026-10-01' },
    { ...PUSTY, id: 'p4', typ: 'marketing', nieruchomosc: 'Przykład: ogrodzenie przy Kauflandzie', adres: 'Płk. Dąbka 152, Elbląg', miejsce: 'siatka od strony ronda', rodzaj: 'oczka', montowal: 'ja', zamontowano: '2026-10-05', utworzono: '2026-10-05' }
  ]);
  const B = () => czytaj('bn-proba-banery', []), O = () => czytaj('bn-proba-objazdy', []);
  return {
    demo: true,
    async init() { return { user, profil: osoby[0] }; },
    async zaloguj() { return { user, profil: osoby[0] }; },
    async wyloguj() {},
    async osoby() { return osoby; },
    async banery() { return B().sort((a, b) => a.nieruchomosc.localeCompare(b.nieruchomosc, 'pl')); },
    async dodaj(b) { const n = { ...PUSTY, ...b, id: id(), utworzono: new Date().toISOString() }; pisz('bn-proba-banery', [...B(), n]); return n; },
    async zmien(bid, zm) { pisz('bn-proba-banery', B().map(b => b.id === bid ? { ...b, ...zm } : b)); },
    async usun(bid) { pisz('bn-proba-banery', B().filter(b => b.id !== bid)); },
    async objazd(wynik, uwagi) {
      const wsz = B(), w = wynik.map(r => ({ ...r, b: wsz.find(b => b.id === r.id && b.aktywny) })).filter(r => r.b);
      if (!w.length) throw new Error('Objazd jest pusty');
      pisz('bn-proba-objazdy', [{ id: id(), kto: 'ja', kiedy: new Date().toISOString(), uwagi, wynik: w.map(r => ({ id: r.id, nieruchomosc: r.b.nieruchomosc, adres: r.b.adres, rodzaj: r.b.rodzaj, typ: r.b.typ, stan: r.stan, uwagi: r.uwagi, zdjecie: r.zdjecie || '' })) }, ...O()]);
      pisz('bn-proba-banery', wsz.map(b => { const r = w.find(x => x.id === b.id); return r ? { ...b, stan: r.stan, stan_uwagi: r.uwagi, sprawdzono: dzis(), sprawdzil: 'ja', ...(r.zdjecie ? { zdjecie: r.zdjecie, zdjecie_kiedy: dzis() } : {}) } : b; }));
    },
    async objazdy() { return O(); },
    async usunObjazd(oid) { pisz('bn-proba-objazdy', O().filter(o => o.id !== oid)); },
    // w próbie zdjęcie leży jako tekst (data URL) w przeglądarce
    async wyslijFoto(_, blob) { return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); }); },
    async linkFoto(sciezka) { return sciezka; },
    nasluchuj() {}
  };
}

const cfg = window.RM_CONFIG || {};
const DB = (cfg.supabaseUrl && !/[?&]proba/.test(location.search)) ? magazynSupabase(cfg) : magazynProbny();

// ===================== STAN =====================
const S = { user: null, profil: null, admin: false, osoby: [], banery: [], objazdy: [], filtr: 'wszystkie', szukaj: '', archFiltr: 'wszystkie', otwarty: null,
  noweFoto: null, podglad: {}, trasa: null };
const imie = (id) => (S.osoby.find(o => o.id === id)?.imie) || 'ktoś z zespołu';
const kto = (b) => b.montowal ? imie(b.montowal) : (b.montowal_obcy || 'nie wpisano');
const wisza = () => S.banery.filter(b => b.aktywny);
const zdjete = () => S.banery.filter(b => !b.aktywny).sort((a, b) => (b.zdjeto || '').localeCompare(a.zdjeto || ''));
const dawno = (b) => !b.sprawdzono || dniOd(b.sprawdzono) > DAWNO;
const problem = (b) => b.stan !== 'ok';
const nawigacja = (b) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(b.lat ? `${b.lat},${b.lng}` : b.adres || b.nieruchomosc);

// szkic objazdu: zostaje na tym telefonie, gdy aplikacja się zamknie w trakcie jazdy
// (stany, zdjęcia zrobione w trasie i punkty usunięte z trasy)
const piszSzkic = () => { piszLS('bn-objazd', S.szkic); piszLS('bn-objazd-foto', S.szkicFoto); piszLS('bn-trasa-bez', S.bezTrasy); };
S.szkic = czytajLS('bn-objazd', {});
S.szkicFoto = czytajLS('bn-objazd-foto', {});
S.bezTrasy = czytajLS('bn-trasa-bez', []);

// zdjęcia: zmniejszone na telefonie (szybciej się wysyła po komórce), linki do prywatnych plików ważne godzinę
async function przygotujFoto(plik) {
  const max = DB.demo ? 800 : 1600;
  try {
    const img = await new Promise((ok, nie) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nie; i.src = URL.createObjectURL(plik); });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  } catch (e) { return plik; } // np. HEIC na komputerze: wysyłamy oryginał
}
const linki = {};
async function linkFoto(sciezka) {
  const l = linki[sciezka];
  if (l && Date.now() - l.t < 50 * 60000) return l.url;
  const url = await DB.linkFoto(sciezka); linki[sciezka] = { url, t: Date.now() }; return url;
}
function wstawFoto(el, sciezka) {
  if (!el || !sciezka) return;
  linkFoto(sciezka).then(url => { el.querySelector('img').src = url; el.href = url; el.hidden = false; }).catch(() => {});
}

// ===================== START =====================
async function start() {
  $$('[data-wersja]').forEach(el => el.textContent = WERSJA);
  if (DB.demo) { const b = $('#banner'); b.hidden = false; b.textContent = 'Tryb próbny: dane zostają tylko w tej przeglądarce.'; }
  try { const s = await DB.init(); if (s) await poZalogowaniu(s); else pokazLogowanie(); }
  catch (e) { pokazLogowanie(); $('#log-blad').textContent = e.message; }
}
function pokazLogowanie() {
  $$('.screen').forEach(el => el.hidden = true); $('#tabs').hidden = true; $('#btn-wyloguj').hidden = true;
  $('#ekran-logowanie').hidden = false;
}
$('#form-logowanie').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#log-blad').textContent = '';
  try { await poZalogowaniu(await DB.zaloguj($('#log-email').value, $('#log-haslo').value)); }
  catch (err) { $('#log-blad').textContent = err.message; }
});
$('#btn-wyloguj').addEventListener('click', async () => { await DB.wyloguj(); location.reload(); });

async function poZalogowaniu({ user, profil }) {
  S.user = user; S.profil = profil; S.admin = profil.rola === 'admin';
  S.osoby = await DB.osoby();
  $('#ekran-logowanie').hidden = true; $('#tabs').hidden = false; $('#btn-wyloguj').hidden = false;
  await odswiez();
  // objazd w toku (coś już zaznaczone) = aplikacja otwiera się od razu na objeździe
  pokazZakladke(Object.keys(S.szkic).length ? 'objazd' : 'wisza');
  DB.nasluchuj(() => odswiez());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) odswiez(); });
}

async function odswiez() {
  try {
    const [banery, objazdy] = await Promise.all([DB.banery(), DB.objazdy()]);
    S.banery = banery; S.objazdy = objazdy;
    // ze szkicu wypadają banery zdjęte w międzyczasie
    const wisi = (id) => S.banery.some(b => b.id === id && b.aktywny);
    for (const id of Object.keys(S.szkic)) if (!wisi(id)) delete S.szkic[id];
    for (const id of Object.keys(S.szkicFoto)) if (!wisi(id)) delete S.szkicFoto[id];
    S.bezTrasy = S.bezTrasy.filter(wisi);
    piszSzkic(); rysuj();
  } catch (e) { toast('Nie udało się wczytać: ' + e.message, 5000); }
}
function rysuj() {
  const n = wisza().filter(problem).length;
  $('#tab-problemy').textContent = n ? n : '';
  if (!$('#arkusz').hidden) return; // nie przerywamy edycji w karcie
  const pole = document.activeElement;
  if (pole?.tagName === 'INPUT' && pole.closest('#objazd-tresc')) return; // ani pisania uwag w objeździe
  if (zakladka === 'wisza') rysujWisza();
  if (zakladka === 'objazd') rysujObjazd();
  if (zakladka === 'archiwum') rysujArchiwum();
}

// ===================== ZAKŁADKI =====================
let zakladka = 'wisza';
function pokazZakladke(t) {
  zakladka = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.screen').forEach(el => el.hidden = true);
  $('#ekran-' + t).hidden = false;
  if (document.activeElement?.blur) document.activeElement.blur();
  rysuj();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) pokazZakladke(b.dataset.tab); });

// ===================== WISZĄ =====================
function kartaBaneru(b) {
  const d = dniOd(b.sprawdzono);
  const stan = problem(b) ? `<span class="stan stan-${b.stan}">${STANY[b.stan].join(' ')}</span>`
    : dawno(b) ? `<span class="stan stan-dawno">⏳ ${b.sprawdzono ? `sprawdzony ${dniTxt(d)}` : 'jeszcze niesprawdzony'}</span>`
    : `<span class="stan stan-ok">✅ sprawdzony ${dniTxt(d)}</span>`;
  return `<button class="baner${problem(b) ? ' zle' : ''}" data-otworz="${b.id}">
    <span class="baner-ikona" title="${esc(RODZAJE[b.rodzaj]?.[1])}">${RODZAJE[b.rodzaj]?.[0] || '🪧'}</span>
    <span class="baner-tresc">
      <b>${b.typ === 'marketing' ? '<span class="znak-mkt">📣 marketing</span> ' : ''}${esc(b.nieruchomosc)}${b.zdjecie ? ' <span title="jest zdjęcie">📷</span>' : ''}</b>
      <span class="small muted">${[b.adres, b.miejsce].filter(Boolean).map(esc).join(' · ') || 'adres niewpisany'}</span>
      <span class="small">${esc(RODZAJE[b.rodzaj]?.[1])}${b.ile > 1 ? ` ×${b.ile}` : ''} · montował(a): ${esc(kto(b))}, ${dataPL(b.zamontowano)}</span>
      ${stan}${b.stan_uwagi && problem(b) ? `<span class="small muted">„${esc(b.stan_uwagi)}”</span>` : ''}
    </span></button>`;
}

function rysujWisza() {
  const W = wisza(), nProb = W.filter(problem).length, nDawno = W.filter(b => !problem(b) && dawno(b)).length;
  $('#wisza-kafle').innerHTML = `<div class="kafle">
    <div class="kafel"><b>${W.length}</b><span>wisi teraz</span></div>
    <div class="kafel${nProb ? ' kafel-zle' : ''}"><b>${nProb}</b><span>do naprawy</span></div>
    <div class="kafel${nDawno ? ' kafel-dawno' : ''}"><b>${nDawno}</b><span>do sprawdzenia</span></div></div>`;

  const F = [['wszystkie', 'Wszystkie'], ['problemy', '⚠️ Do naprawy'], ['dawno', '⏳ Do sprawdzenia'], ['t-oferta', '🏡 Oferty'], ['t-marketing', '📣 Marketingowe'],
    ...Object.entries(RODZAJE).map(([k, [i, n]]) => [k, `${i} ${n}`])];
  $('#filtry').innerHTML = F.map(([k, n]) => `<button type="button" class="chip chip-mala${S.filtr === k ? ' on' : ''}" data-filtr="${k}">${n}</button>`).join('');

  const q = bezOgonkow(S.szukaj);
  const lista = W.filter(b => S.filtr === 'wszystkie' || (S.filtr === 'problemy' ? problem(b) : S.filtr === 'dawno' ? !problem(b) && dawno(b)
      : S.filtr.startsWith('t-') ? (b.typ || 'oferta') === S.filtr.slice(2) : b.rodzaj === S.filtr))
    .filter(b => !q || bezOgonkow([b.nieruchomosc, b.adres, b.miejsce, kto(b), b.uwagi].join(' ')).includes(q))
    .sort((a, b) => problem(b) - problem(a) || (a.sprawdzono || '').localeCompare(b.sprawdzono || '') || a.nieruchomosc.localeCompare(b.nieruchomosc, 'pl'));
  $('#wisza-lista').innerHTML = lista.length ? lista.map(kartaBaneru).join('')
    : `<div class="pusto">${W.length ? 'Nic nie pasuje do filtra.' : 'Nie ma jeszcze żadnego baneru. Dodaj pierwszy przyciskiem powyżej.'}</div>`;
}
$('#ekran-wisza').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.akcja === 'nowy') otworzFormularz(null);
  if (b.dataset.filtr) { S.filtr = b.dataset.filtr; rysujWisza(); }
  if (b.dataset.otworz) otworzBaner(b.dataset.otworz);
});
$('#szukaj').addEventListener('input', (e) => { S.szukaj = e.target.value; rysujWisza(); });

// ===================== OBJAZD =====================
// TRASA: start i meta w biurze, kolejność z serwera tras OSRM (najkrótsza objazdówka), bez sieci szacunek po prostej ×1,3.
// Banery bez GPS dostają współrzędne z adresu (Photon, zapamiętane w telefonie). Usunięte z trasy zostają na liście do sprawdzenia.
async function wspolrzedne(b) {
  if (b.lat) return { lat: b.lat, lng: b.lng };
  const q = (b.adres || '').trim(); if (!q) return null;
  const pamiec = czytajLS('bn-geo', {});
  if (q in pamiec) return pamiec[q];
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lat=${BIURO.lat}&lon=${BIURO.lng}&bbox=14.0,49.0,24.2,54.9`);
    if (!r.ok) return null;
    const f = (await r.json()).features?.[0];
    const w = f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], zAdresu: true } : null;
    pamiec[q] = w; piszLS('bn-geo', pamiec); return w;
  } catch (e) { return null; } // bez zasięgu nie zapamiętujemy, spróbuje następnym razem
}

async function trasaOsrm(pkt) {
  const wsp = [BIURO, ...pkt].map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const r = await fetch(`https://router.project-osrm.org/trip/v1/driving/${wsp}?source=first&roundtrip=true&overview=false`);
  const j = await r.json(); if (j.code !== 'Ok') throw new Error(j.code);
  const t = j.trips[0];
  // waypoints[i].waypoint_index = które miejsce w trasie ma i-ty punkt (0 = biuro); legs[k] = odcinek do k+1. punktu
  const kolejnosc = pkt.map((p, i) => ({ ...p, poz: j.waypoints[i + 1].waypoint_index })).sort((a, b) => a.poz - b.poz);
  kolejnosc.forEach((p, k) => { p.km = t.legs[k].distance / 1000; });
  return { kolejnosc, km: t.distance / 1000, min: Math.round(t.duration / 60), powrot: t.legs[t.legs.length - 1].distance / 1000 };
}
function trasaSzacunkowa(pkt) {
  const odl = (a, b) => {
    const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
  };
  const zostaly = [...pkt], kolejnosc = []; let tu = BIURO, km = 0;
  while (zostaly.length) { // zawsze do najbliższego
    let n = 0; zostaly.forEach((p, i) => { if (odl(tu, p) < odl(tu, zostaly[n])) n = i; });
    const p = { ...zostaly.splice(n, 1)[0] }; p.km = odl(tu, p); km += p.km; kolejnosc.push(p); tu = p;
  }
  const powrot = odl(tu, BIURO);
  return { kolejnosc, km: km + powrot, min: null, powrot, szacunek: true };
}

async function liczTrase() {
  const W = wisza().filter(b => !S.bezTrasy.includes(b.id));
  const klucz = W.map(b => `${b.id}:${b.lat || ''}:${b.adres}`).sort().join('|');
  if (S.trasa?.klucz === klucz) return;
  const nr = liczTrase.nr = (liczTrase.nr || 0) + 1;
  S.trasa = { klucz, liczy: true };
  const pkt = [], bezAdresu = [];
  for (const b of W) { const w = await wspolrzedne(b); if (w) pkt.push({ b, ...w }); else bezAdresu.push(b); }
  if (nr !== liczTrase.nr) return;
  let wynik = { kolejnosc: [], km: 0, min: 0, powrot: 0 };
  if (pkt.length) try { wynik = await trasaOsrm(pkt); } catch (e) { wynik = trasaSzacunkowa(pkt); }
  if (nr !== liczTrase.nr) return;
  S.trasa = { klucz, bezAdresu, ...wynik };
  if (zakladka === 'objazd') rysuj();
}

// link Map Google ma limit punktów, dłuższa trasa idzie w częściach (koniec jednej = początek następnej)
function linkiMap(kolejnosc) {
  const p = (x) => x === BIURO ? `${BIURO.lat},${BIURO.lng}` : (x.b.lat || !x.b.adres) ? `${x.lat},${x.lng}` : x.b.adres;
  const pts = [BIURO, ...kolejnosc, BIURO], wynik = [];
  for (let s = 0; s < pts.length - 1; s += W_LINKU - 1) {
    const cz = pts.slice(s, s + W_LINKU);
    wynik.push({ od: s, do: s + cz.length - 1, url: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(p(cz[0]))
      + '&destination=' + encodeURIComponent(p(cz[cz.length - 1])) + (cz.length > 2 ? '&waypoints=' + encodeURIComponent(cz.slice(1, -1).map(p).join('|')) : '') });
  }
  return wynik;
}
const kmDoKilometrowki = (t) => Math.ceil(t.km);
const opisPrzejazdu = (t) => `Objazd banerów: biuro, ${t.kolejnosc.map(p => p.b.adres || p.b.nieruchomosc).join(', ')}, powrót do biura (${kmDoKilometrowki(t)} km)`;

function rysujTrase() {
  const t = S.trasa, W = wisza();
  const usuniete = W.filter(b => S.bezTrasy.includes(b.id));
  const naglowek = `<div class="row-between"><b>🗺️ Trasa objazdu</b><span class="small muted">start i meta: biuro</span></div>`;
  const stopka = usuniete.length ? `<div class="small muted trasa-poza">Usunięte z trasy (${usuniete.length}):</div>
      <div class="chips">${usuniete.map(b => `<button type="button" class="chip chip-mala" data-do-trasy="${b.id}">↩️ ${esc(b.nieruchomosc)}</button>`).join('')}
      ${usuniete.length > 1 ? '<button type="button" class="link" data-akcja="cala-trasa">przywróć wszystkie</button>' : ''}</div>` : '';
  if (!t || t.liczy) return `<div class="card trasa">${naglowek}<div class="small muted" style="margin-top:8px">Układam najkrótszą trasę…</div>${stopka}</div>`;
  if (!t.kolejnosc.length) return `<div class="card trasa">${naglowek}<div class="small muted" style="margin-top:8px">${usuniete.length ? 'Wszystkie punkty usunięte z trasy.' : 'Żaden baner nie ma adresu ani GPS, nie ma z czego ułożyć trasy.'}</div>${stopka}</div>`;
  const czesci = linkiMap(t.kolejnosc);
  return `<div class="card trasa">${naglowek}
    <div class="km-box">
      <div><span>Do Kilometrówki</span><b>${kmDoKilometrowki(t)} km</b>
        <small>${t.szacunek ? 'szacunek, serwer tras nie odpowiedział' : `cała pętla ${kmTxt(t.km)} km${t.min ? `, jazdy ok. ${t.min} min` : ''}`}</small></div>
      <button type="button" class="btn btn-ghost" data-akcja="kopiuj-km">📋 Kopiuj opis</button>
    </div>
    <ol class="trasa-lista">
      <li class="trasa-biuro"><span class="nr">🏢</span><span class="trasa-t"><b>Start: biuro</b><small>Szarych Szeregów 2c</small></span></li>
      ${t.kolejnosc.map((p, i) => `<li><span class="nr">${i + 1}</span>
        <span class="trasa-t"><b>${p.b.typ === 'marketing' ? '📣 ' : ''}${esc(p.b.nieruchomosc)}</b><small>${esc(p.b.adres || 'tylko GPS')}${p.zAdresu ? ' (z adresu)' : ''} · ${kmTxt(p.km)} km</small></span>
        <button type="button" class="trasa-x" data-bez-trasy="${p.b.id}" aria-label="Usuń z trasy">✕</button></li>`).join('')}
      <li class="trasa-biuro"><span class="nr">🏢</span><span class="trasa-t"><b>Powrót do biura</b><small>${kmTxt(t.powrot)} km</small></span></li>
    </ol>
    ${czesci.map((c, i) => `<a class="btn btn-main btn-link" href="${c.url}" target="_blank" rel="noopener">🧭 Jedź w Mapach Google${czesci.length > 1 ? `, część ${i + 1} z ${czesci.length}` : ''}</a>`).join('')}
    ${czesci.length > 1 ? '<div class="small muted" style="margin-top:6px">Mapy Google biorą do 9 przystanków naraz, po pierwszej części otwórz drugą.</div>' : ''}
    ${t.bezAdresu.length ? `<div class="small muted trasa-poza">Bez adresu i GPS, nie ma ich w trasie: ${t.bezAdresu.map(b => esc(b.nieruchomosc)).join(', ')}. Dopisz adres w karcie baneru.</div>` : ''}
    ${stopka}</div>`;
}

function rysujObjazd() {
  const W = wisza();
  const sz = S.szkic, zrobione = W.filter(b => sz[b.id]).length;
  const ost = S.objazdy[0];
  if (!W.length) { $('#objazd-tresc').innerHTML = '<div class="pusto">Żaden baner teraz nie wisi, nie ma czego objeżdżać.</div>'; rysujHistorie(); return; }
  liczTrase();
  // lista do sprawdzania idzie w kolejności trasy, punkty spoza trasy na końcu
  const poz = {}; (S.trasa?.kolejnosc || []).forEach((p, i) => { poz[p.b.id] = i + 1; });
  const lista = W.slice().sort((a, b) => (poz[a.id] || 999) - (poz[b.id] || 999) || (a.adres || a.nieruchomosc).localeCompare(b.adres || b.nieruchomosc, 'pl'));
  const proc = Math.round(zrobione / W.length * 100);

  $('#objazd-tresc').innerHTML = `${rysujTrase()}
    <div class="card info">
      ${ost ? `Ostatni objazd: <b>${dataPL(ost.kiedy)}</b> (${dniTxt(dniOd(ost.kiedy))}), ${esc(imie(ost.kto))}, sprawdzonych ${ost.wynik.length}, problemów ${ost.wynik.filter(r => r.stan !== 'ok').length}.` : 'Nie było jeszcze żadnego objazdu.'}
      <div class="row-between" style="margin-top:10px"><b>Sprawdzone ${zrobione} z ${W.length}</b>${zrobione || Object.keys(S.szkicFoto).length ? '<button class="link" data-akcja="wyczysc">zacznij od nowa</button>' : ''}</div>
      <div class="pasek"><i style="width:${proc}%"></i></div>
    </div>
    ${lista.map(b => {
      const r = sz[b.id], foto = S.szkicFoto[b.id];
      return `<div class="obj${r ? ' obj-' + r.stan : ''}" data-id="${b.id}">
        <div class="row-between"><div class="obj-tytul">${poz[b.id] ? `<span class="obj-nr">${poz[b.id]}</span>` : '<span class="obj-nr poza" title="poza trasą">–</span>'}<span>${RODZAJE[b.rodzaj]?.[0] || '🪧'}</span> <b>${b.typ === 'marketing' ? '📣 ' : ''}${esc(b.nieruchomosc)}</b></div>
          <a class="obj-nav" href="${nawigacja(b)}" target="_blank" rel="noopener" aria-label="Nawiguj">🧭</a></div>
        <div class="small muted">${[b.adres, b.miejsce].filter(Boolean).map(esc).join(' · ')}${b.ile > 1 ? ` · sztuk: ${b.ile}` : ''}${problem(b) ? ` · ostatnio: ${STANY[b.stan][1].toLowerCase()}` : ''}</div>
        <div class="obj-przyciski">${Object.entries(STANY).map(([k, [i, n]]) => `<button type="button" class="obj-btn${r?.stan === k ? ' on' : ''}" data-stan="${k}">${i} ${k === 'ok' ? 'Wisi, OK' : n}</button>`).join('')}</div>
        ${r && r.stan !== 'ok' ? `<input type="text" class="obj-uwagi" maxlength="300" value="${esc(r.uwagi)}" placeholder="${r.stan === 'brak' ? 'np. zerwany, zabrał właściciel' : 'np. naderwane oczko, wyblakły'}">` : ''}
        <div class="obj-foto">
          <label class="obj-foto-btn">📷 ${foto ? 'Zrób inne zdjęcie' : 'Zrób zdjęcie'}<input type="file" accept="image/*" capture="environment" data-foto="${b.id}" hidden></label>
          ${foto ? `<a class="miniatura" data-podglad="${b.id}" target="_blank" rel="noopener"${S.podglad[b.id] ? ` href="${S.podglad[b.id]}"` : ' hidden'}><img alt="zdjęcie z objazdu"${S.podglad[b.id] ? ` src="${S.podglad[b.id]}"` : ''}></a><span class="small ok-txt">zdjęcie dodane</span>` : ''}
        </div>
      </div>`;
    }).join('')}
    <div class="pasek-dol">
      <label>Uwagi do objazdu (nie musisz) <input type="text" id="obj-uwagi-ogolne" maxlength="500" value="${esc(S.szkicUwagi || '')}" placeholder="np. przejechane razem z prezentacją"></label>
      <button class="btn btn-main btn-big" data-akcja="zapisz-objazd"${zrobione ? '' : ' disabled'}>✓ Zapisz objazd${zrobione ? ` (${zrobione})` : ''}</button>
      ${zrobione && zrobione < W.length ? `<div class="small muted" style="text-align:center;margin-top:6px">Niesprawdzone (${W.length - zrobione}) zostaną z poprzednim stanem.</div>` : ''}
    </div>`;
  // zdjęcia zrobione wcześniej (po zamknięciu aplikacji) dociągamy z serwera
  $$('[data-podglad][hidden]').forEach(a => wstawFoto(a, S.szkicFoto[a.dataset.podglad]));
  rysujHistorie();
}

$('#objazd-tresc').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const box = b.closest('[data-id]');
  if (b.dataset.stan && box) {
    const id = box.dataset.id, stary = S.szkic[id];
    if (stary?.stan === b.dataset.stan) delete S.szkic[id];       // drugi klik = odznacz
    else S.szkic[id] = { stan: b.dataset.stan, uwagi: b.dataset.stan === 'ok' ? '' : (stary?.uwagi || '') };
    piszSzkic(); rysujObjazd();
    if (S.szkic[id] && S.szkic[id].stan !== 'ok') setTimeout(() => $(`[data-id="${id}"] .obj-uwagi`)?.focus(), 30);
  }
  if (b.dataset.bezTrasy) { S.bezTrasy.push(b.dataset.bezTrasy); piszSzkic(); rysujObjazd(); }
  if (b.dataset.doTrasy) { S.bezTrasy = S.bezTrasy.filter(id => id !== b.dataset.doTrasy); piszSzkic(); rysujObjazd(); }
  if (b.dataset.akcja === 'cala-trasa') { S.bezTrasy = []; piszSzkic(); rysujObjazd(); }
  if (b.dataset.akcja === 'kopiuj-km' && S.trasa?.kolejnosc) {
    const txt = opisPrzejazdu(S.trasa);
    try { await navigator.clipboard.writeText(txt); toast(`Skopiowane. W Kilometrówce wklej jako cel, km: ${kmDoKilometrowki(S.trasa)}`, 4500); }
    catch (err) { prompt('Skopiuj opis przejazdu:', txt); }
  }
  if (b.dataset.akcja === 'wyczysc') { S.szkic = {}; S.szkicFoto = {}; S.bezTrasy = []; S.szkicUwagi = ''; piszSzkic(); rysujObjazd(); }
  if (b.dataset.akcja === 'zapisz-objazd') {
    const W = wisza();
    const bezStanu = Object.keys(S.szkicFoto).filter(id => !S.szkic[id] && W.some(x => x.id === id));
    if (bezStanu.length) {
      toast('Przy banerze ze zdjęciem zaznacz jeszcze stan', 4000);
      $(`[data-id="${bezStanu[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    const wynik = Object.entries(S.szkic).map(([id, r]) => ({ id, stan: r.stan, uwagi: (r.uwagi || '').trim(), zdjecie: S.szkicFoto[id] || '' }));
    if (!wynik.length) return;
    const nProb = wynik.filter(r => r.stan !== 'ok').length;
    b.disabled = true;
    try {
      await DB.objazd(wynik, (S.szkicUwagi || '').trim());
      S.szkic = {}; S.szkicFoto = {}; S.bezTrasy = []; S.szkicUwagi = ''; piszSzkic(); document.activeElement?.blur?.();
      toast(nProb ? `Objazd zapisany. Problemy: ${nProb}, nowe trafiły do Zadań RM` : 'Objazd zapisany, wszystko wisi', 4500);
      await odswiez(); window.scrollTo(0, 0);
    } catch (err) { toast('Nie zapisało się: ' + err.message, 5000); b.disabled = false; }
  }
});
$('#objazd-tresc').addEventListener('input', (e) => {
  if (e.target.id === 'obj-uwagi-ogolne') { S.szkicUwagi = e.target.value; return; }
  const box = e.target.closest('[data-id]');
  if (box && e.target.classList.contains('obj-uwagi') && S.szkic[box.dataset.id]) { S.szkic[box.dataset.id].uwagi = e.target.value; piszSzkic(); }
});
// zdjęcie z objazdu idzie od razu na serwer (w szkicu zostaje tylko ścieżka), stan zaznacza się jak zwykle
$('#objazd-tresc').addEventListener('change', async (e) => {
  const id = e.target.dataset.foto, plik = e.target.files?.[0]; if (!id || !plik) return;
  toast('Wysyłam zdjęcie…', 20000);
  try {
    const blob = await przygotujFoto(plik);
    S.szkicFoto[id] = await DB.wyslijFoto(id, blob, 'objazd');
    S.podglad[id] = URL.createObjectURL(blob);
    piszSzkic(); toast(S.szkic[id] ? 'Zdjęcie dodane' : 'Zdjęcie dodane, zaznacz jeszcze stan'); rysujObjazd();
  } catch (err) { toast('Zdjęcie się nie wysłało: ' + err.message, 5000); }
});

function rysujHistorie() {
  const O = S.objazdy;
  $('#objazd-historia').innerHTML = O.length ? `<div class="sekcja-tytul">Poprzednie objazdy</div>${O.map(o => {
    const zle = o.wynik.filter(r => r.stan !== 'ok');
    return `<div class="card arch">
      <div class="row-between"><b>${dataPL(o.kiedy)}</b><span class="small muted">${esc(imie(o.kto))}</span></div>
      <div class="small">${o.wynik.length} sprawdzonych · ${zle.length ? `<span class="czerwony-txt">problemów: ${zle.length}</span>` : 'wszystko wisi ✅'}${o.uwagi ? `<br><span class="muted">${esc(o.uwagi)}</span>` : ''}</div>
      <details><summary>Szczegóły</summary><ul class="arch-poz">${o.wynik.map(r => `<li>${STANY[r.stan]?.[0] || ''} ${esc(r.nieruchomosc)} <span class="muted">${esc(RODZAJE[r.rodzaj]?.[1] || '')}${r.uwagi ? ', ' + esc(r.uwagi) : ''}</span>${r.zdjecie ? ` <button type="button" class="link" data-foto-hist="${esc(r.zdjecie)}">📷 zdjęcie</button>` : ''}</li>`).join('')}</ul>
        ${S.admin ? `<div class="akcje-dol"><button class="link czerwony" data-usun-objazd="${o.id}">Usuń wpis objazdu</button></div>` : ''}</details>
    </div>`;
  }).join('')}` : '';
}
$('#objazd-historia').addEventListener('click', async (e) => {
  const f = e.target.closest('[data-foto-hist]');
  if (f) { // okno otwieramy od razu (telefon blokuje okna otwierane po czasie), adres wstawiamy, gdy przyjdzie link
    const okno = window.open('', '_blank');
    try { const url = await linkFoto(f.dataset.fotoHist); if (okno) okno.location = url; else location.href = url; }
    catch (err) { okno?.close(); toast('Nie udało się otworzyć zdjęcia: ' + err.message, 5000); }
    return;
  }
  const b = e.target.closest('[data-usun-objazd]'); if (!b) return;
  if (b.dataset.pewne !== '1') { b.dataset.pewne = '1'; b.textContent = 'Na pewno? Kliknij jeszcze raz'; return; }
  try { await DB.usunObjazd(b.dataset.usunObjazd); toast('Wpis usunięty'); await odswiez(); } catch (err) { toast('Nie udało się: ' + err.message, 5000); }
});

// ===================== ARCHIWUM =====================
function rysujArchiwum() {
  const Z = zdjete(), ile = (p) => Z.filter(b => b.zdjeto_powod === p).length;
  const kafle = ['sprzedaz', 'wynajecie', 'wycofanie', ...(ile('koniec') ? ['koniec'] : []), 'inny'];
  $('#archiwum-kafle').innerHTML = Z.length ? `<div class="kafle" style="grid-template-columns:repeat(${kafle.length},1fr)">${kafle.map(p => `<div class="kafel"><b>${ile(p)}</b><span>${POWODY[p][0]} ${POWODY[p][1].toLowerCase()}</span></div>`).join('')}</div>` : '';
  $('#archiwum-filtry').innerHTML = Z.length ? [['wszystkie', 'Wszystkie'], ...Object.entries(POWODY).filter(([k]) => k !== 'koniec' || ile(k)).map(([k, [i, n]]) => [k, `${i} ${n}`])]
    .map(([k, n]) => `<button type="button" class="chip chip-mala${S.archFiltr === k ? ' on' : ''}" data-afiltr="${k}">${n}</button>`).join('') : '';
  const lista = Z.filter(b => S.archFiltr === 'wszystkie' || b.zdjeto_powod === S.archFiltr);
  $('#archiwum-lista').innerHTML = lista.length ? lista.map(b => `<button class="baner archiwalny" data-otworz="${b.id}">
      <span class="baner-ikona">${RODZAJE[b.rodzaj]?.[0] || '🪧'}</span>
      <span class="baner-tresc"><b>${b.typ === 'marketing' ? '<span class="znak-mkt">📣 marketing</span> ' : ''}${esc(b.nieruchomosc)}</b>
        <span class="small muted">${[b.adres, b.miejsce].filter(Boolean).map(esc).join(' · ')}</span>
        <span class="small">${esc(RODZAJE[b.rodzaj]?.[1])} · wisiał ${dniOd(b.zamontowano, b.zdjeto || dzis())} dni (${dataPL(b.zamontowano)} – ${dataPL(b.zdjeto)})</span>
        <span class="stan stan-arch">${(POWODY[b.zdjeto_powod] || POWODY.inny).join(' ')} · zdjął(ęła): ${esc(b.zdjal ? imie(b.zdjal) : '–')}</span>
        ${b.zdjeto_uwagi ? `<span class="small muted">${esc(b.zdjeto_uwagi)}</span>` : ''}
      </span></button>`).join('')
    : `<div class="pusto">${Z.length ? 'Nic z tym powodem.' : 'Archiwum jest puste. Trafiają tu banery zdjęte po sprzedaży, wynajęciu, wycofaniu oferty albo po końcu umowy na miejsce marketingowe.'}</div>`;
}
$('#ekran-archiwum').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.afiltr) { S.archFiltr = b.dataset.afiltr; rysujArchiwum(); }
  if (b.dataset.otworz) otworzBaner(b.dataset.otworz);
});

// ===================== KARTA BANERU =====================
function otworzArkusz() { $('#tlo').hidden = false; $('#arkusz').hidden = false; document.body.style.overflow = 'hidden'; }
function zamknijArkusz() { $('#tlo').hidden = true; $('#arkusz').hidden = true; document.body.style.overflow = ''; S.otwarty = null; rysuj(); }
$('#tlo').addEventListener('click', zamknijArkusz);
$('#ark-zamknij').addEventListener('click', zamknijArkusz);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#arkusz').hidden) zamknijArkusz(); });

function otworzBaner(id) {
  const b = S.banery.find(x => x.id === id); if (!b) return;
  S.otwarty = { id }; rysujSzczegoly(b); otworzArkusz();
}
function rysujSzczegoly(b) {
  const typ = b.typ === 'marketing' ? '📣 Marketingowy · ' : '';
  $('#ark-nr').textContent = (b.aktywny ? '' : 'Archiwum · ') + typ + rodzajTxt(b.rodzaj);
  const wiersz = (n, w) => w ? `<div class="dane-w"><span>${n}</span><b>${w}</b></div>` : '';
  $('#ark-tresc').innerHTML = `<div class="ark-nazwa" id="ark-tytul">${esc(b.nieruchomosc)}</div>
    ${b.zdjecie ? `<a class="foto-duze" id="ark-foto" target="_blank" rel="noopener" hidden><img alt="Zdjęcie baneru"><span>📷 ${b.zdjecie_kiedy ? dataPL(b.zdjecie_kiedy) : 'zdjęcie'}</span></a>` : ''}
    <div class="dane">
      ${wiersz('Adres', esc(b.adres))}${wiersz('Miejsce', esc(b.miejsce))}${wiersz('Sztuk', b.ile > 1 ? b.ile : '')}
      ${wiersz('Montował(a)', esc(kto(b)))}${wiersz('Zamontowany', dataPL(b.zamontowano) + (b.aktywny ? `, wisi ${dniOd(b.zamontowano)} dni` : ''))}
      ${wiersz('Ostatni objazd', b.sprawdzono ? `${dataPL(b.sprawdzono)}, ${esc(imie(b.sprawdzil))}: ${STANY[b.stan].join(' ')}` : 'jeszcze nie')}
      ${wiersz('Uwagi z objazdu', problem(b) ? esc(b.stan_uwagi) : '')}
      ${wiersz('GPS', b.lat ? 'zapisane miejsce' : '')}${wiersz('Uwagi', esc(b.uwagi))}
      ${b.aktywny ? '' : wiersz('Zdjęty', `${dataPL(b.zdjeto)}, ${esc(POWODY[b.zdjeto_powod]?.[1] || '')}, ${esc(b.zdjal ? imie(b.zdjal) : '')}`) + wiersz('Uwagi przy zdjęciu', esc(b.zdjeto_uwagi))}
    </div>
    ${b.aktywny ? `<div class="ark-przyciski">
        <a class="btn btn-ghost btn-link" href="${nawigacja(b)}" target="_blank" rel="noopener">🧭 Nawiguj</a>
        <button class="btn btn-ghost" data-akcja="edytuj">✏️ Zmień</button>
      </div>
      ${problem(b) ? '<button class="btn btn-main" data-akcja="naprawiony">✅ Naprawiony, wisi w porządku</button>' : ''}
      <button class="btn btn-zdejmij" data-akcja="zdejmij">⬇️ Zdjęty, do archiwum</button>`
    : `<button class="btn btn-ghost" data-akcja="przywroc">↩️ Przywróć do wiszących (pomyłka)</button>
      ${S.admin ? '<div class="akcje-dol"><button class="link czerwony" data-akcja="usun">Usuń na stałe</button></div>' : ''}`}`;
  wstawFoto($('#ark-foto'), b.zdjecie);
}

function rysujZdejmij(b) {
  $('#ark-nr').textContent = 'Zdjęcie baneru';
  $('#ark-tresc').innerHTML = `<div class="ark-nazwa" id="ark-tytul">${esc(b.nieruchomosc)}</div>
    <form id="f-zdejmij">
      <div class="sekcja-tytul" style="margin-top:0">Powód</div>
      <div class="chips" data-grupa="powod">${POWODY_TYPU[b.typ === 'marketing' ? 'marketing' : 'oferta'].map(k => [k, POWODY[k]]).map(([k, [i, n]]) => `<button type="button" class="chip" data-v="${k}">${i} ${n}</button>`).join('')}</div>
      <div class="grid2"><label>Data zdjęcia <input type="date" id="z-data" value="${dzis()}" max="${dzis()}"></label>
      <label>Zdjął(ęła) <select id="z-kto">${S.osoby.filter(o => o.aktywny).map(o => `<option value="${o.id}"${o.id === S.user.id ? ' selected' : ''}>${esc(o.imie)}</option>`).join('')}</select></label></div>
      <label>Uwagi (nie musisz) <input type="text" id="z-uwagi" maxlength="300" placeholder="np. baner zniszczony, wyrzucony / wrócił do biura"></label>
      <button class="btn btn-main" type="submit">Przenieś do archiwum</button>
      <button class="btn btn-ghost" type="button" data-akcja="wroc">Wróć</button>
    </form>`;
}

function rysujFormularz(b) {
  const nowy = !b; b = b || { typ: 'oferta', nieruchomosc: '', adres: '', miejsce: '', rodzaj: 'oczka', ile: 1, montowal: S.user.id, montowal_obcy: '', zamontowano: dzis(), lat: null, lng: null, uwagi: '', zdjecie: '' };
  const obcy = !b.montowal && !!b.montowal_obcy, typ = b.typ || 'oferta';
  $('#ark-nr').textContent = nowy ? 'Nowy baner' : 'Zmiana danych';
  $('#ark-tresc').innerHTML = `<form id="f-baner" data-lat="${b.lat ?? ''}" data-lng="${b.lng ?? ''}">
    <div class="sekcja-tytul" style="margin-top:0">Co to za baner</div>
    <div class="chips" data-grupa="typ">${Object.entries(TYPY).map(([k, [i, n]]) => `<button type="button" class="chip${typ === k ? ' on' : ''}" data-v="${k}">${i} ${k === 'oferta' ? 'Oferta (nieruchomość)' : 'Marketingowy (miejsce)'}</button>`).join('')}</div>
    <label><span id="f-nier-tytul">${NAZWA_TYPU[typ][0]}</span> <input type="text" id="f-nier" maxlength="120" value="${esc(b.nieruchomosc)}" placeholder="${NAZWA_TYPU[typ][1]}" required></label>
    <label>Adres <input type="text" id="f-adres" maxlength="160" value="${esc(b.adres)}" placeholder="ulica, numer, miejscowość"></label>
    <label>Gdzie dokładnie wisi <input type="text" id="f-miejsce" maxlength="200" value="${esc(b.miejsce)}" placeholder="np. balkon 2 piętro od ulicy, płot od szosy"></label>
    <div class="sekcja-tytul" style="margin-top:2px">Rodzaj</div>
    <div class="chips" data-grupa="rodzaj">${Object.entries(RODZAJE).map(([k, [i, n]]) => `<button type="button" class="chip${b.rodzaj === k ? ' on' : ''}" data-v="${k}">${i} ${n}</button>`).join('')}</div>
    <div class="sekcja-tytul" style="margin-top:2px">Kto montował</div>
    <div class="chips" data-grupa="montowal">${S.osoby.filter(o => o.aktywny || o.id === b.montowal).map(o => `<button type="button" class="chip${!obcy && b.montowal === o.id ? ' on' : ''}" data-v="${o.id}">${esc(o.imie)}</button>`).join('')}
      <button type="button" class="chip${obcy ? ' on' : ''}" data-v="obcy">Ktoś spoza biura</button></div>
    <label id="f-obcy-box"${obcy ? '' : ' hidden'}>Kto (firma, osoba) <input type="text" id="f-obcy" maxlength="80" value="${esc(b.montowal_obcy)}" placeholder="np. właściciel, firma reklamowa"></label>
    <div class="grid2"><label>Data montażu <input type="date" id="f-data" value="${b.zamontowano}" max="${dzis()}"></label>
    <label>Ile sztuk <input type="number" id="f-ile" min="1" max="20" value="${b.ile}" inputmode="numeric"></label></div>
    <button type="button" class="btn btn-ghost" data-akcja="gps">📍 ${b.lat ? 'Miejsce zapisane. Zapisz od nowa tutaj' : 'Jestem przy banerze, zapisz miejsce z GPS'}</button>
    <div class="foto-pole">
      <a class="foto-duze" id="f-foto-podglad" target="_blank" rel="noopener" hidden><img alt="Zdjęcie baneru"></a>
      <label class="btn btn-ghost btn-link">📷 ${b.zdjecie ? 'Zrób nowe zdjęcie baneru' : 'Zrób zdjęcie baneru'}<input type="file" accept="image/*" capture="environment" id="f-foto" hidden></label>
    </div>
    <label style="margin-top:10px">Uwagi <input type="text" id="f-uwagi" maxlength="500" value="${esc(b.uwagi)}" placeholder="np. zgoda wspólnoty do końca roku, trytytki 4 szt."></label>
    <button class="btn btn-main" type="submit">${nowy ? 'Dodaj' : 'Zapisz'}</button>
    ${nowy ? '' : '<button class="btn btn-ghost" type="button" data-akcja="wroc">Wróć</button>'}
  </form>`;
  wstawFoto($('#f-foto-podglad'), b.zdjecie);
}
const NAZWA_TYPU = { oferta: ['Nieruchomość (oferta)', 'np. Słoneczna 15B, mieszkanie 90 m²'], marketing: ['Miejsce (nazwa)', 'np. ogrodzenie przy Kauflandzie, Płk. Dąbka'] };
function otworzFormularz(b) { S.otwarty = { id: b?.id || null, form: true }; S.noweFoto = null; rysujFormularz(b); otworzArkusz(); setTimeout(() => !b && $('#f-nier')?.focus(), 80); }
$('#arkusz').addEventListener('change', async (e) => {
  if (e.target.id !== 'f-foto' || !e.target.files?.[0]) return;
  S.noweFoto = await przygotujFoto(e.target.files[0]);
  const a = $('#f-foto-podglad'), url = URL.createObjectURL(S.noweFoto);
  a.querySelector('img').src = url; a.href = url; a.hidden = false;
  toast('Zdjęcie gotowe, zapisze się razem z banerem');
});

$('#arkusz').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'); if (!btn || !S.otwarty) return;
  const grupa = btn.closest('[data-grupa]');
  if (grupa && btn.dataset.v) {
    $$('button', grupa).forEach(x => x.classList.toggle('on', x === btn));
    if (grupa.dataset.grupa === 'montowal') { $('#f-obcy-box').hidden = btn.dataset.v !== 'obcy'; if (btn.dataset.v === 'obcy') $('#f-obcy').focus(); }
    if (grupa.dataset.grupa === 'typ') { $('#f-nier-tytul').textContent = NAZWA_TYPU[btn.dataset.v][0]; $('#f-nier').placeholder = NAZWA_TYPU[btn.dataset.v][1]; }
    return;
  }
  const b = S.banery.find(x => x.id === S.otwarty.id);
  const a = btn.dataset.akcja;
  if (a === 'gps') return zapiszGps(btn);
  if (a === 'wroc') { if (b) { S.otwarty = { id: b.id }; rysujSzczegoly(b); } else zamknijArkusz(); return; }
  if (!b) return;
  if (a === 'edytuj') { S.otwarty.form = true; rysujFormularz(b); }
  if (a === 'zdejmij') rysujZdejmij(b);
  if (a === 'naprawiony') await zapisz(b, { stan: 'ok', stan_uwagi: '', sprawdzono: dzis(), sprawdzil: S.user.id }, 'Zapisane: wisi w porządku');
  if (a === 'przywroc') await zapisz(b, { aktywny: true, zdjeto: null, zdjeto_powod: '', zdjeto_uwagi: '', zdjal: null }, 'Baner wrócił do wiszących');
  if (a === 'usun') {
    if (btn.dataset.pewne !== '1') { btn.dataset.pewne = '1'; btn.textContent = 'Na pewno? Tego nie da się cofnąć. Kliknij jeszcze raz'; return; }
    try { await DB.usun(b.id); toast('Usunięte na stałe'); zamknijArkusz(); await odswiez(); } catch (err) { toast('Nie udało się: ' + err.message, 5000); }
  }
});
async function zapisz(b, zm, komunikat) {
  try { await DB.zmien(b.id, zm); Object.assign(b, zm); toast(komunikat); zamknijArkusz(); await odswiez(); }
  catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
}
function zapiszGps(btn) {
  if (!navigator.geolocation) { toast('Ten telefon nie podaje położenia'); return; }
  btn.disabled = true; btn.textContent = '📍 Szukam położenia…';
  navigator.geolocation.getCurrentPosition((p) => {
    const f = $('#f-baner'); if (!f) return;
    f.dataset.lat = p.coords.latitude.toFixed(6); f.dataset.lng = p.coords.longitude.toFixed(6);
    btn.disabled = false; btn.textContent = `📍 Miejsce złapane (dokładność ok. ${Math.round(p.coords.accuracy)} m)`;
  }, (err) => {
    btn.disabled = false; btn.textContent = '📍 Jestem przy banerze, zapisz miejsce z GPS';
    toast(err.code === 1 ? 'Brak zgody na lokalizację, włącz ją w ustawieniach przeglądarki' : 'Nie udało się złapać GPS, spróbuj na zewnątrz', 5000);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

$('#arkusz').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = S.banery.find(x => x.id === S.otwarty?.id);
  if (e.target.id === 'f-zdejmij') {
    const powod = $('[data-grupa="powod"] .on')?.dataset.v;
    if (!powod) { toast('Wybierz powód zdjęcia'); return; }
    if (b) await zapisz(b, { aktywny: false, zdjeto: $('#z-data').value || dzis(), zdjeto_powod: powod, zdjal: $('#z-kto').value, zdjeto_uwagi: $('#z-uwagi').value.trim() }, `Do archiwum: ${POWODY[powod][1].toLowerCase()}`);
    return;
  }
  if (e.target.id !== 'f-baner') return;
  const f = e.target, mont = $('[data-grupa="montowal"] .on')?.dataset.v || null;
  const dane = {
    typ: $('[data-grupa="typ"] .on')?.dataset.v || 'oferta',
    nieruchomosc: $('#f-nier').value.trim().replace(/\s+/g, ' '),
    adres: $('#f-adres').value.trim(), miejsce: $('#f-miejsce').value.trim(),
    rodzaj: $('[data-grupa="rodzaj"] .on')?.dataset.v || 'oczka',
    ile: Math.min(20, Math.max(1, parseInt($('#f-ile').value, 10) || 1)),
    montowal: mont && mont !== 'obcy' ? mont : null,
    montowal_obcy: mont === 'obcy' ? $('#f-obcy').value.trim() : '',
    zamontowano: $('#f-data').value || dzis(),
    lat: f.dataset.lat ? Number(f.dataset.lat) : null, lng: f.dataset.lng ? Number(f.dataset.lng) : null,
    uwagi: $('#f-uwagi').value.trim()
  };
  if (!dane.nieruchomosc) { toast(dane.typ === 'marketing' ? 'Wpisz nazwę miejsca' : 'Wpisz nieruchomość'); $('#f-nier').focus(); return; }
  if (mont === 'obcy' && !dane.montowal_obcy) { toast('Wpisz, kto spoza biura montował'); $('#f-obcy').focus(); return; }
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  let zapisany;
  try {
    if (b) { await DB.zmien(b.id, dane); zapisany = b; }
    else zapisany = await DB.dodaj(dane);
  } catch (err) { toast('Nie zapisało się: ' + err.message, 5000); btn.disabled = false; return; }
  let komunikat = b ? 'Zapisano' : `Dodany: ${dane.nieruchomosc}`;
  if (S.noweFoto) { // zdjęcie po zapisie, bo folder na serwerze nazywa się jak baner
    try { const sciezka = await DB.wyslijFoto(zapisany.id, S.noweFoto, 'montaz'); await DB.zmien(zapisany.id, { zdjecie: sciezka, zdjecie_kiedy: dzis() }); komunikat += ', ze zdjęciem'; }
    catch (err) { komunikat += '. Zdjęcie się nie wysłało, dodaj je w „Zmień”'; }
    S.noweFoto = null;
  }
  toast(komunikat, 4000);
  zamknijArkusz(); await odswiez();
});

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  let przeladowano = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (przeladowano || !$('#arkusz').hidden || document.activeElement?.tagName === 'INPUT') return;
    przeladowano = true; location.reload();
  });
}

start();
