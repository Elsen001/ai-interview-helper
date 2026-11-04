/* =========================================================
   Interview Copilot — app.js
   Nitq → mətn → Gemini → cavab (streaming)
   ========================================================= */
(() => {
  'use strict';

  /* ------------------------- sabitlər ------------------------- */
  const STORE_KEY = 'interview-copilot.settings.v1';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

  const DEFAULT_PERSONA =
`Sən canlı iş müsahibəsində namizədə kömək edən "interview copilot"-san.
Namizəd ingilis dilində danışılan müsahibədədir. Ona çatan mətn nitq tanıma ilə avtomatik çıxarılır,
buna görə kiçik səhvlər, yarımçıq və ya kəsilmiş cümlələr ola bilər.`;

  const LANG_RULES = {
    'en+az':
`Cavabı MÜTLƏQ bu formatda ver:

ANSWER: <ingiliscə cavab — birinci şəxsdən, danışıq dilində, 2-4 cümlə, maksimum ~70 söz>
İZAH: <azərbaycanca 1-2 qısa cümlə — nəyi vurğulamaq və hansı konkret nümunəni demək yaxşıdır>`,
    'en':
`Cavabı MÜTLƏQ bu formatda ver:

ANSWER: <ingiliscə cavab — birinci şəxsdən, danışıq dilində, 2-4 cümlə, maksimum ~70 söz>`,
    'az':
`Cavabı MÜTLƏQ bu formatda ver:

CAVAB: <azərbaycanca cavab — birinci şəxsdən, 2-4 cümlə, maksimum ~70 söz>`,
  };

  const COMMON_RULES =
`Ümumi qaydalar:
- Sual nə olursa olsun cavablandır. Heç vaxt istifadəçidən dəqiqləşdirmə istəmə.
- Uydurma fakt, rəqəm, şirkət adı, sertifikat uydurma; ümumi peşəkar təcrübəyə əsaslan.
- Markdown başlıq, kod bloku, uzun siyahı istifadə etmə. Danışıq üçün sadə mətn yaz.
- İlk cümlə birbaşa sualın cavabı olsun.`;

  const DEFAULTS = {
    apiKey: '',
    model: 'gemini-2.5-flash',
    answerLang: 'en+az',
    context: '',
    persona: DEFAULT_PERSONA,
    cv: '',
    cvName: '',
    autoSend: true,
    silenceMs: 1500,
    recogLang: 'en-US',
    autoPause: true,
  };

  const CV_MAX = 20000;

  const CV_RULES =
`CV qaydaları:
- Yuxarıdakı CV namizədin REAL təcrübəsidir. Ona aid suallarda yalnız oradakı faktlardan istifadə et (şirkət, vəzifə, tarix, texnologiya, nailiyyət).
- "Introduce yourself" / "tell me about yourself" / "özünü tanıt" sualı gələndə 3-5 cümləlik axıcı peşəkar təqdimat ver: kimdir, neçə il təcrübə, hansı sahə və stack, hansı şirkətlərdə işləyib, 1 konkret nailiyyət və ya layihə. (Bu sual üçün ~90 sözə qədər icazə var.)
- "Bunu izah et", "daha ətraflı danış", "hansı layihədə" kimi davam suallarında CV-dəki konkret detalları gətir.
- CV-də olmayan məlumatı UYDURMA. Çatışmayan detal varsa, mövzunu bildiyin hissəyə yönəlt və ümumi peşəkar cavab ver.
- CV başqa dildə olsa da, cavabı seçilmiş cavab dilində ver.`;

  /* ------------------------- köməkçilər ------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const timeNow = () =>
    new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------- ayarlar ------------------------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const settings = loadSettings();

  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch {
      /* localStorage bağlı ola bilər */
    }
  }

  /* ------------------------- DOM ------------------------- */
  const el = {
    body: document.body,
    startBtn: $('#startBtn'),
    startLabel: $('#startLabel'),
    micBtn: $('#micBtn'),
    status: $('#status'),
    statusText: $('#statusText'),
    modelBadge: $('#modelBadge'),
    settingsBtn: $('#settingsBtn'),
    clearBtn: $('#clearBtn'),

    transcriptPanel: $('#transcriptPanel'),
    transcriptBody: $('#transcriptBody'),
    transcriptEmpty: $('#transcriptEmpty'),
    transcriptCount: $('#transcriptCount'),
    liveStrip: $('#liveStrip'),
    interimText: $('#interimText'),
    pendingInput: $('#pendingInput'),
    autoTag: $('#autoTag'),
    sendBtn: $('#sendBtn'),
    clearPendingBtn: $('#clearPendingBtn'),

    answersBody: $('#answersBody'),
    answersEmpty: $('#answersEmpty'),
    answersEmptyHint: $('#answersEmptyHint'),
    setupBtn: $('#setupBtn'),

    dialog: $('#settingsDialog'),
    closeSettings: $('#closeSettings'),
    doneBtn: $('#doneBtn'),
    saveCloseBtn: $('#saveCloseBtn'),
    apiKey: $('#apiKey'),
    toggleKeyBtn: $('#toggleKeyBtn'),
    model: $('#model'),
    refreshModelsBtn: $('#refreshModelsBtn'),
    autoSend: $('#autoSend'),
    autoPause: $('#autoPause'),
    silenceRange: $('#silenceRange'),
    silenceLabel: $('#silenceLabel'),
    answerLang: $('#answerLang'),
    context: $('#context'),
    persona: $('#persona'),
    resetPersonaBtn: $('#resetPersonaBtn'),
    recogLang: $('#recogLang'),
    testBtn: $('#testBtn'),
    testResult: $('#testResult'),

    cvDrop: $('#cvDrop'),
    cvFile: $('#cvFile'),
    cvStatus: $('#cvStatus'),
    cvStatusText: $('#cvStatusText'),
    cvText: $('#cvText'),
    cvMeta: $('#cvMeta'),
    clearCvBtn: $('#clearCvBtn'),
    introBtn: $('#introBtn'),
    introBtnMain: $('#introBtnMain'),

    toast: $('#toast'),
  };

  /* ------------------------- vəziyyət ------------------------- */
  const state = {
    pending: '',        // təsdiqlənmiş (final) mətn
    interim: '',        // canlı (interim) mətn
    wantListen: false,
    listening: false,
    paused: false,      // mikrofon fasilədədir (istifadəçi cavabı oxuyur)
    history: [],        // Gemini konteksti
    currentAbort: null,
    silenceTimer: null,
    restartTimer: null,
    startFailures: 0,
    lineCount: 0,
    toastTimer: null,
  };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;

  /* ------------------------- UI köməkçiləri ------------------------- */
  function toast(message, kind = '') {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    el.toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
      state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, 220);
    }, kind === 'err' ? 6000 : 3200);
  }

  function setStatus(text, kind = 'idle') {
    el.statusText.textContent = text;
    el.status.dataset.kind = kind;
  }

  function renderListening() {
    const on = state.wantListen;
    el.body.classList.toggle('listening', on && state.listening && !state.paused);
    el.startBtn.dataset.state = on ? 'listening' : 'idle';
    el.startLabel.textContent = on ? 'Stop' : 'Start';
    el.startBtn.title = on ? 'Dinləməni dayandır (Alt+S)' : 'Dinləməni başlat (Alt+S)';
    el.micBtn.dataset.paused = state.paused ? 'true' : 'false';
    el.micBtn.disabled = !on;
    el.micBtn.title = state.paused
      ? 'Mikrofon susdurulub — davam et (Alt+M)'
      : 'Mikrofonu susdur (Alt+M)';
  }

  function scrollTranscript() {
    el.transcriptBody.scrollTop = el.transcriptBody.scrollHeight;
  }

  function renderInterim() {
    const text = state.interim.trim();
    if (!text) {
      el.liveStrip.hidden = true;
      el.interimText.textContent = '';
      return;
    }
    el.liveStrip.hidden = false;
    el.interimText.textContent = text;
  }

  function syncPending() {
    if (document.activeElement === el.pendingInput) return;
    el.pendingInput.value = state.pending;
  }

  function updateAutoTag() {
    el.autoTag.textContent = settings.autoSend
      ? `avtomatik · ${(settings.silenceMs / 1000).toFixed(1)} s sükut`
      : 'avtomatik bağlıdır';
  }

  function updateEmptyHint() {
    const hasKey = !!settings.apiKey.trim();
    el.answersEmptyHint.textContent = hasKey
      ? 'İlk müsahibə sualını gözləyirəm…'
      : 'Başlamaq üçün Gemini API açarını daxil et.';
    el.setupBtn.hidden = hasKey;
  }

  /* ------------------------- müsahibə mətni ------------------------- */
  function addLine(text) {
    const line = document.createElement('div');
    line.className = 'line';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = timeNow();
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = text;

    line.append(t, txt);
    el.transcriptBody.appendChild(line);
    el.transcriptEmpty.hidden = true;

    state.lineCount += 1;
    el.transcriptCount.textContent = `${state.lineCount} sətir`;
    scrollTranscript();
  }

  function appendFinal(text) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t) return;
    if (state.pending && norm(state.pending).endsWith(norm(t))) return; // təkrar nəticə
    state.pending = state.pending ? `${state.pending} ${t}` : t;
    addLine(t);
    syncPending();
  }

  /* ------------------------- nitq tanıma ------------------------- */
  function createRecognizer() {
    if (!SR) return null;
    const r = new SR();
    r.lang = settings.recogLang || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      state.listening = true;
      state.startFailures = 0;
      renderListening();
      setStatus('Dinlənir…', 'listen');
    };

    r.onresult = (ev) => {
      let finalText = '';
      let interimText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const chunk = res[0] && res[0].transcript ? res[0].transcript : '';
        if (res.isFinal) finalText += chunk;
        else interimText += chunk;
      }

      if (finalText.trim()) {
        appendFinal(finalText);
        state.interim = '';
      } else {
        state.interim = interimText.trim();
      }

      renderInterim();
      if (finalText.trim() || state.interim) armSilence();
    };

    r.onerror = (ev) => {
      const e = ev.error;
      if (e === 'no-speech' || e === 'aborted') return;

      if (e === 'not-allowed' || e === 'service-not-allowed') {
        stopListening();
        toast('Mikrofon icazəsi verilmədi. Ünvan çubuğundakı mikrofon ikonuna icazə ver.', 'err');
        setStatus('Mikrofon bloklandı', 'error');
        return;
      }
      if (e === 'audio-capture') {
        stopListening();
        toast('Mikrofon tapılmadı. Cihazı yoxla.', 'err');
        setStatus('Mikrofon yoxdur', 'error');
        return;
      }
      if (e === 'network') {
        toast('Nitq tanıma şəbəkə xətası — internet bağlantısını yoxla.', 'err');
        return;
      }
      console.warn('[speech]', e);
    };

    r.onend = () => {
      state.listening = false;
      renderListening();
      if (state.wantListen && !state.paused) scheduleRestart();
    };

    return r;
  }

  function scheduleRestart() {
    clearTimeout(state.restartTimer);
    state.restartTimer = setTimeout(() => {
      if (!state.wantListen || state.paused || !recog) return;
      try {
        recog.start();
      } catch (err) {
        state.startFailures += 1;
        if (state.startFailures > 6) {
          stopListening();
          toast('Nitq tanıma dayandı. Səhifəni yeniləyib yenidən cəhd et.', 'err');
        } else {
          scheduleRestart();
        }
      }
    }, 320);
  }

  function startListening() {
    if (!SR) {
      toast('Bu brauzer nitq tanımanı dəstəkləmir. Chrome və ya Edge istifadə et.', 'err');
      return;
    }
    if (!recog) recog = createRecognizer();
    if (!recog) return;
    if (recog.lang !== (settings.recogLang || 'en-US')) recog.lang = settings.recogLang || 'en-US';

    state.wantListen = true;
    state.paused = false;
    renderListening();
    setStatus('Mikrofon açılır…', 'listen');

    try {
      recog.start();
    } catch (err) {
      // artıq işləyirsə — problem deyil
      if (err && err.name !== 'InvalidStateError') console.warn(err);
    }
  }

  function stopListening() {
    state.wantListen = false;
    state.paused = false;
    clearTimeout(state.restartTimer);
    clearTimeout(state.silenceTimer);
    state.interim = '';
    renderInterim();
    renderListening();
    setStatus('Hazır', 'idle');
    if (recog) {
      try { recog.stop(); } catch { /* ignore */ }
    }
  }

  function pauseMic(withToast) {
    if (!state.wantListen || state.paused) return;
    state.paused = true;
    clearTimeout(state.silenceTimer);
    clearTimeout(state.restartTimer);
    if (recog) {
      try { recog.stop(); } catch { /* ignore */ }
    }
    renderListening();
    setStatus('Mikrofon susdurulub', 'warn');
    if (withToast) toast('Mikrofon susduruldu. Cavabı oxu, sonra Alt+M ilə davam et.', '');
  }

  function resumeMic() {
    if (!state.wantListen || !state.paused) return;
    state.paused = false;
    renderListening();
    setStatus('Mikrofon açılır…', 'listen');
    if (recog) {
      try { recog.start(); } catch { scheduleRestart(); }
    } else {
      recog = createRecognizer();
      if (recog) { try { recog.start(); } catch { /* ignore */ } }
    }
  }

  function toggleMic() {
    if (!state.wantListen) return;
    if (state.paused) resumeMic();
    else pauseMic(true);
  }

  function toggleListening() {
    if (state.wantListen) {
      if (state.paused) resumeMic();
      else stopListening();
    } else {
      startListening();
    }
  }

  /* ------------------------- sükut → göndər ------------------------- */
  function armSilence() {
    clearTimeout(state.silenceTimer);
    state.silenceTimer = setTimeout(onSilence, Math.max(400, settings.silenceMs));
  }

  function onSilence() {
    if (!state.wantListen) return;
    if (document.activeElement === el.pendingInput) return; // istifadəçi redaktə edir

    const text = (el.pendingInput.value || state.pending || state.interim).trim();

    if (!settings.autoSend) {
      if (text) setStatus('Sual hazırdır — Göndər', 'listen');
      return;
    }
    if (text.length < 3) return;
    if (!settings.apiKey.trim()) {
      setStatus('API açarı yoxdur', 'error');
      return;
    }
    sendQuestion(text, 'auto');
  }

  /* ------------------------- CV ------------------------- */
  function setCvStatus(text, kind = 'empty') {
    el.cvStatus.dataset.kind = kind;
    el.cvStatusText.textContent = text;
  }

  function renderCv() {
    const cv = (settings.cv || '').trim();
    if (document.activeElement !== el.cvText) el.cvText.value = settings.cv || '';
    el.cvMeta.textContent = `${cv.length} simvol`;
    el.cvDrop.classList.toggle('has-file', !!cv);
    setCvStatus(
      cv ? `${settings.cvName || 'CV'} · ${cv.length} simvol` : 'CV yüklənməyib',
      cv ? 'ok' : 'empty'
    );
  }

  function cleanCvText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  async function extractCvText(file) {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();

    if (name.endsWith('.docx')) return docxToText(await file.arrayBuffer());
    if (name.endsWith('.pdf') || type === 'application/pdf') return pdfToText(await file.arrayBuffer());
    if (name.endsWith('.txt') || name.endsWith('.md') || type.startsWith('text/')) return file.text();
    if (name.endsWith('.rtf')) return rtfToText(await file.text());
    if (name.endsWith('.doc')) throw new Error('Köhnə .doc formatı dəstəklənmir — PDF və ya DOCX yüklə.');
    throw new Error('Bu format dəstəklənmir — PDF, DOCX və ya TXT yüklə.');
  }

  async function docxToText(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(buffer);
    let eocd = -1;
    const min = Math.max(0, u8.length - 65558);
    for (let i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('DOCX oxunmadı (ZIP strukturu tapılmadı).');

    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);

    for (let i = 0; i < count; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;

      const method = dv.getUint16(off + 10, true);
      const compSize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const localOff = dv.getUint32(off + 42, true);
      const entry = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));

      if (entry === 'word/document.xml') {
        const lnameLen = dv.getUint16(localOff + 26, true);
        const lextraLen = dv.getUint16(localOff + 28, true);
        const dataOff = localOff + 30 + lnameLen + lextraLen;
        const data = u8.subarray(dataOff, dataOff + compSize);

        let xml;
        if (method === 0) {
          xml = new TextDecoder().decode(data);
        } else if (method === 8) {
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          xml = await new Response(stream).text();
        } else {
          throw new Error('DOCX sıxılma metodu dəstəklənmir.');
        }
        return docxXmlToText(xml);
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('DOCX daxilində mətn tapılmadı.');
  }

  function docxXmlToText(xml) {
    return String(xml)
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  let pdfjsPromise = null;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise) return pdfjsPromise;

    const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build';
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${base}/pdf.min.js`;
      s.onload = () => {
        if (!window.pdfjsLib) return reject(new Error('pdf.js yüklənmədi.'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('pdf.js CDN-dən yüklənmədi (internet bağlantısı?).'));
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }

  async function pdfToText(buffer) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        line += item.str || '';
        line += item.hasEOL ? '\n' : ' ';
      }
      pages.push(line.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    }
    return pages.join('\n\n');
  }

  function rtfToText(src) {
    return String(src)
      .replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\s?\??/g, (m, n) => String.fromCharCode(((Number(n) % 65536) + 65536) % 65536))
      .replace(/\\[a-z]+-?\d*\s?/gi, ' ')
      .replace(/[{}]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function applyCvText(text, fileName) {
    const clean = cleanCvText(text);
    if (clean.length < 40) {
      throw new Error('Mətn çıxarılmadı (skan PDF ola bilər) — mətni əl ilə yapışdır.');
    }
    settings.cv = clean.slice(0, CV_MAX);
    settings.cvName = fileName || 'CV';
    saveSettings();
    renderCv();
    toast(`CV yükləndi · ${settings.cv.length} simvol`, 'ok');
  }

  async function handleCvFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('Fayl 8 MB-dan böyükdür.', 'err');
      return;
    }
    setCvStatus(`Oxunur: ${file.name}…`, 'load');

    try {
      const text = await extractCvText(file);
      applyCvText(text, file.name);
    } catch (err) {
      setCvStatus(err.message || 'CV oxunmadı', 'err');
      toast(`CV oxunmadı: ${err.message}`, 'err');
    } finally {
      el.cvFile.value = '';
    }
  }

  function askIntro() {
    if (!(settings.cv || '').trim()) {
      openSettings();
      toast('Əvvəlcə CV yüklə (PDF/DOCX), sonra “Özünü təqdim et” işləyəcək.', 'err');
      return;
    }
    closeSettings();
    sendQuestion('Tell me about yourself.', 'intro');
  }

  /* ------------------------- Gemini ------------------------- */
  function normalizeModel(m) {
    return String(m || '').trim().replace(/^models\//, '');
  }

  function thinkingConfig(model) {
    if (/^gemini-2\.5-(flash|flash-lite)$/.test(model)) {
      return { thinkingConfig: { thinkingBudget: 0 } }; // cavab dərhal gəlsin
    }
    return {};
  }

  function buildSystemPrompt() {
    const persona = (settings.persona || '').trim() || DEFAULT_PERSONA;
    const parts = [persona];
    if (settings.context.trim()) parts.push(`Vakansiya / şirkət konteksti: ${settings.context.trim()}`);

    const cv = (settings.cv || '').trim();
    if (cv) {
      parts.push(`[[NAMİZƏDİN CV-Sİ — ƏSAS HƏQİQİ MƏNBƏ]]
${cv.slice(0, CV_MAX)}
[[/CV]]`);
    }

    parts.push(LANG_RULES[settings.answerLang] || LANG_RULES['en+az']);
    parts.push(COMMON_RULES);
    if (cv) parts.push(CV_RULES);
    return parts.join('\n\n');
  }

  async function describeError(res) {
    let raw = '';
    try { raw = await res.text(); } catch { /* ignore */ }
    let msg = '';
    try {
      const json = JSON.parse(raw);
      msg = json?.error?.message || '';
    } catch {
      msg = raw.slice(0, 300);
    }
    if (res.status === 400 && /API key not valid/i.test(msg)) return 'API açarı yanlışdır. Ayarlardan yoxla.';
    if (res.status === 403) return msg || 'Giriş qadağandır (403). Açarın icazələrini yoxla.';
    if (res.status === 404) return msg || 'Model tapılmadı (404). Ayarlardan modeli dəyiş.';
    if (res.status === 429) return 'Limit aşıldı (429). Bir neçə saniyə sonra yenidən cəhd et.';
    return msg || `HTTP ${res.status}`;
  }

  function renderAnswer(raw) {
    const text = String(raw || '').replace(/\r/g, '');
    let answer = text;
    let note = '';

    const noteMatch = text.match(/(?:İZAH|IZAH|QEYD)\s*:/i);
    if (noteMatch) {
      answer = text.slice(0, noteMatch.index);
      note = text.slice(noteMatch.index + noteMatch[0].length);
    }
    answer = answer.replace(/^\s*(?:ANSWER|CAVAB)\s*:\s*/i, '');

    let html = '';
    if (answer.trim()) html += `<div class="ans-main">${formatText(answer.trim())}</div>`;
    if (note.trim()) {
      html += `<div class="ans-note"><span class="note-label">İzah</span>${formatText(note.trim())}</div>`;
    }
    return html;
  }

  function formatText(src) {
    let t = escapeHtml(src);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    t = t.replace(/^#{1,6}\s*/gm, '');
    t = t.replace(/^\s*[-*•]\s+/gm, '• ');
    return t
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function createCard(question) {
    el.answersEmpty.hidden = true;

    const card = document.createElement('article');
    card.className = 'card streaming';
    card.innerHTML = `
      <div class="card-top">
        <span class="card-q-label">Sual</span>
        <span class="card-time"></span>
      </div>
      <p class="card-q"></p>
      <div class="card-a"></div>
      <div class="card-tools">
        <button class="mini copy" type="button">Kopyala</button>
        <span class="card-state">yazılır…</span>
      </div>`;

    card.querySelector('.card-time').textContent = timeNow();
    card.querySelector('.card-q').textContent = question;

    const aEl = card.querySelector('.card-a');
    const stateEl = card.querySelector('.card-state');
    const copyBtn = card.querySelector('.mini.copy');

    let full = '';

    copyBtn.addEventListener('click', async () => {
      const text = full || question;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Kopyalandı ✓';
        setTimeout(() => { copyBtn.textContent = 'Kopyala'; }, 1400);
      } catch {
        toast('Kopyalamaq alınmadı.', 'err');
      }
    });

    el.answersBody.prepend(card);
    el.answersBody.scrollTop = 0;

    return {
      el: card,
      setStreaming() {
        card.classList.remove('error');
        card.classList.add('streaming');
        stateEl.textContent = 'yazılır…';
        full = '';
        aEl.innerHTML = '<span class="caret"></span>';
      },
      update(text) {
        full = text;
        aEl.innerHTML = renderAnswer(text) + '<span class="caret"></span>';
        el.answersBody.scrollTop = 0;
      },
      finish(text) {
        full = text;
        card.classList.remove('streaming');
        stateEl.textContent = `${text.trim().split(/\s+/).length} söz`;
        aEl.innerHTML = renderAnswer(text);
      },
      fail(message) {
        card.classList.remove('streaming');
        card.classList.add('error');
        stateEl.textContent = 'xəta';
        const p = document.createElement('p');
        p.className = 'err-text';
        p.textContent = message;
        aEl.innerHTML = '';
        aEl.appendChild(p);
      },
      abort(partial) {
        card.classList.remove('streaming');
        stateEl.textContent = 'dayandırıldı';
        aEl.innerHTML = partial && partial.trim()
          ? renderAnswer(partial) + '<span class="caret"></span>'
          : '<p class="err-text">Cavab yarımçıq dayandırıldı.</p>';
      },
    };
  }

  async function askGemini(question, card) {
    if (state.currentAbort) state.currentAbort.abort();

    const ctrl = new AbortController();
    state.currentAbort = ctrl;

    card.setStreaming();
    setStatus('Cavab yazılır…', 'think');

    const model = normalizeModel(settings.model);
    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
      contents: [
        ...state.history,
        { role: 'user', parts: [{ text: `Interviewer: ${question}` }] },
      ],
      generationConfig: {
        temperature: 0.6,
        topP: 0.95,
        maxOutputTokens: 900,
        ...thinkingConfig(model),
      },
    };

    let text = '';
    try {
      const res = await fetch(
        `${API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': settings.apiKey.trim(),
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        }
      );

      if (!res.ok) throw new Error(await describeError(res));
      if (!res.body) throw new Error('Bu brauzer streaming cavabı dəstəkləmir.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleLine = (rawLine) => {
        const line = rawLine.replace(/\r$/, '');
        if (!line.startsWith('data:')) return;

        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;

        let payload;
        try { payload = JSON.parse(data); } catch { return; }

        if (payload?.promptFeedback?.blockReason) {
          throw new Error(`Gemini sorğunu blokladı (${payload.promptFeedback.blockReason}).`);
        }

        const cand = payload?.candidates?.[0];
        const piece = (cand?.content?.parts || [])
          .filter((p) => p && p.text && !p.thought)
          .map((p) => p.text)
          .join('');

        if (piece) {
          text += piece;
          card.update(text);
        }

        if (cand?.finishReason === 'SAFETY' && !text) {
          throw new Error('Cavab təhlükəsizlik filtrlərinə görə bloklandı.');
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }

      // axının sonunda yarımçıq qalmış sətir
      if (buffer.trim()) handleLine(buffer);

      if (!text.trim()) throw new Error('Gemini boş cavab qaytardı. Model adını yoxla.');

      card.finish(text);

      state.history.push({ role: 'user', parts: [{ text: `Interviewer: ${question}` }] });
      state.history.push({ role: 'model', parts: [{ text }] });
      if (state.history.length > 8) state.history = state.history.slice(-8);

      // sən cavabı oxuyacaqsan — nitq tanıma sənin sözlərini tutmasın
      if (settings.autoPause && state.wantListen && !state.paused) pauseMic(true);
    } catch (err) {
      if (state.currentAbort !== ctrl || err?.name === 'AbortError') {
        card.abort(text);
      } else {
        card.fail(err?.message || String(err));
      }
    } finally {
      if (state.currentAbort === ctrl) {
        state.currentAbort = null;
        restoreStatus();
      }
    }
  }

  function restoreStatus() {
    if (state.paused) setStatus('Mikrofon susdurulub', 'warn');
    else if (state.wantListen) setStatus('Dinlənir…', 'listen');
    else setStatus('Hazır', 'idle');
  }

  function sendQuestion(text, source) {
    const q = String(text || '').trim();
    if (!q) {
      toast('Sual boşdur.', 'err');
      return;
    }
    if (!settings.apiKey.trim()) {
      openSettings();
      toast('Əvvəlcə Gemini API açarını daxil et.', 'err');
      return;
    }

    clearTimeout(state.silenceTimer);
    state.pending = '';
    state.interim = '';
    el.pendingInput.value = '';
    renderInterim();

    const card = createCard(q);
    askGemini(q, card);
  }

  /* ------------------------- ayarlar UI ------------------------- */
  function syncSettingsUI() {
    el.apiKey.value = settings.apiKey;
    el.model.value = normalizeModel(settings.model);
    if (el.model.value !== normalizeModel(settings.model)) {
      // siyahıda olmayan model — əlavə et
      const opt = document.createElement('option');
      opt.value = normalizeModel(settings.model);
      opt.textContent = normalizeModel(settings.model);
      el.model.appendChild(opt);
      el.model.value = opt.value;
    }
    renderCv();
    el.autoSend.checked = !!settings.autoSend;
    el.autoPause.checked = !!settings.autoPause;
    el.silenceRange.value = String(settings.silenceMs);
    el.silenceLabel.textContent = `${(settings.silenceMs / 1000).toFixed(1)} s`;
    el.answerLang.value = settings.answerLang;
    el.context.value = settings.context;
    el.persona.value = settings.persona || DEFAULT_PERSONA;
    el.recogLang.value = settings.recogLang;
    el.testResult.textContent = '';
    el.testResult.className = 'muted small';
  }

  function openSettings() {
    syncSettingsUI();
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
  }

  function closeSettings() {
    if (typeof el.dialog.close === 'function') el.dialog.close();
    else el.dialog.removeAttribute('open');
  }

  function bindSettings() {
    el.settingsBtn.addEventListener('click', openSettings);
    el.setupBtn.addEventListener('click', openSettings);
    el.closeSettings.addEventListener('click', closeSettings);
    el.doneBtn.addEventListener('click', closeSettings);
    el.saveCloseBtn.addEventListener('click', () => {
      saveSettings();
      updateAutoTag();
      updateEmptyHint();
      el.modelBadge.textContent = normalizeModel(settings.model);
      toast('Ayarlar yadda saxlanıldı.', 'ok');
      closeSettings();
    });

    el.dialog.addEventListener('click', (e) => {
      if (e.target === el.dialog) closeSettings();
    });

    el.apiKey.addEventListener('input', () => {
      settings.apiKey = el.apiKey.value.trim();
      saveSettings();
      updateEmptyHint();
    });

    el.toggleKeyBtn.addEventListener('click', () => {
      const hidden = el.apiKey.type === 'password';
      el.apiKey.type = hidden ? 'text' : 'password';
      el.toggleKeyBtn.textContent = hidden ? 'Gizlət' : 'Göstər';
    });

    el.model.addEventListener('change', () => {
      settings.model = el.model.value;
      saveSettings();
      el.modelBadge.textContent = normalizeModel(settings.model);
    });

    el.refreshModelsBtn.addEventListener('click', refreshModels);

    el.autoSend.addEventListener('change', () => {
      settings.autoSend = el.autoSend.checked;
      saveSettings();
      updateAutoTag();
    });

    el.silenceRange.addEventListener('input', () => {
      settings.silenceMs = Number(el.silenceRange.value) || 1500;
      el.silenceLabel.textContent = `${(settings.silenceMs / 1000).toFixed(1)} s`;
      saveSettings();
      updateAutoTag();
    });

    el.answerLang.addEventListener('change', () => {
      settings.answerLang = el.answerLang.value;
      saveSettings();
    });

    el.context.addEventListener('input', () => {
      settings.context = el.context.value;
      saveSettings();
    });

    el.persona.addEventListener('input', () => {
      settings.persona = el.persona.value;
      saveSettings();
    });

    el.resetPersonaBtn.addEventListener('click', () => {
      el.persona.value = DEFAULT_PERSONA;
      settings.persona = DEFAULT_PERSONA;
      saveSettings();
    });

    el.recogLang.addEventListener('change', () => {
      settings.recogLang = el.recogLang.value.trim() || 'en-US';
      saveSettings();
      if (recog) recog.lang = settings.recogLang;
    });

    el.autoPause.addEventListener('change', () => {
      settings.autoPause = el.autoPause.checked;
      saveSettings();
    });

    // ---- CV ----
    el.cvDrop.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('input')) return;
      el.cvFile.click();
    });
    el.cvDrop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.cvFile.click();
      }
    });
    el.cvFile.addEventListener('change', () => handleCvFile(el.cvFile.files && el.cvFile.files[0]));

    ['dragenter', 'dragover'].forEach((ev) => {
      el.cvDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        el.cvDrop.classList.add('drag');
      });
    });
    ['dragleave', 'dragend'].forEach((ev) => {
      el.cvDrop.addEventListener(ev, () => el.cvDrop.classList.remove('drag'));
    });
    el.cvDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      el.cvDrop.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleCvFile(f);
    });

    el.cvText.addEventListener('input', () => {
      settings.cv = el.cvText.value;
      el.cvMeta.textContent = `${el.cvText.value.trim().length} simvol`;
      el.cvDrop.classList.toggle('has-file', !!el.cvText.value.trim());
      saveSettings();
    });

    el.clearCvBtn.addEventListener('click', () => {
      settings.cv = '';
      settings.cvName = '';
      saveSettings();
      el.cvText.value = '';
      renderCv();
      toast('CV silindi.', 'ok');
    });

    el.introBtn.addEventListener('click', askIntro);
    el.introBtnMain.addEventListener('click', askIntro);

    el.testBtn.addEventListener('click', testConnection);
  }

  async function refreshModels() {
    const key = (el.apiKey.value || settings.apiKey).trim();
    if (!key) {
      toast('Əvvəlcə API açarını yaz.', 'err');
      return;
    }
    el.refreshModelsBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': key },
      });
      if (!res.ok) throw new Error(await describeError(res));
      const json = await res.json();
      const models = (json.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => normalizeModel(m.name))
        .filter((name) => /gemini/i.test(name) && !/(embedding|aqa|image|tts|live|veo|imagen)/i.test(name));

      if (!models.length) throw new Error('Uyğun model tapılmadı.');

      const current = normalizeModel(settings.model);
      el.model.innerHTML = '';
      models.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        el.model.appendChild(opt);
      });
      el.model.value = models.includes(current) ? current : models[0];
      settings.model = el.model.value;
      saveSettings();
      el.modelBadge.textContent = settings.model;
      toast(`${models.length} model yükləndi.`, 'ok');
    } catch (err) {
      toast(`Modelləri yükləmək alınmadı: ${err.message}`, 'err');
    } finally {
      el.refreshModelsBtn.disabled = false;
    }
  }

  async function testConnection() {
    const key = (el.apiKey.value || '').trim();
    const model = normalizeModel(el.model.value);
    el.testResult.className = 'muted small';
    el.testResult.textContent = 'yoxlanılır…';

    if (!key) {
      el.testResult.className = 'err small';
      el.testResult.textContent = 'API açarı boşdur.';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': key },
      });
      if (!res.ok) throw new Error(await describeError(res));
      const json = await res.json();
      const list = (json.models || []).map((m) => normalizeModel(m.name));
      const found = list.includes(model);
      el.testResult.className = 'ok small';
      el.testResult.textContent = found
        ? `✓ Açar işləyir · ${model} mövcuddur`
        : `✓ Açar işləyir, amma "${model}" siyahıda yoxdur`;
      if (!found) el.testResult.className = 'err small';
    } catch (err) {
      el.testResult.className = 'err small';
      el.testResult.textContent = err.message;
    }
  }

  /* ------------------------- hadisələr ------------------------- */
  function bindApp() {
    el.startBtn.addEventListener('click', toggleListening);
    el.micBtn.addEventListener('click', toggleMic);

    el.sendBtn.addEventListener('click', () => {
      sendQuestion(el.pendingInput.value || state.pending || state.interim, 'manual');
    });

    el.clearPendingBtn.addEventListener('click', () => {
      state.pending = '';
      state.interim = '';
      el.pendingInput.value = '';
      renderInterim();
    });

    el.pendingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendQuestion(el.pendingInput.value, 'manual');
      }
    });

    el.clearBtn.addEventListener('click', () => {
      if (!confirm('Bütün mətn və cavablar silinsin?')) return;
      state.pending = '';
      state.interim = '';
      state.history = [];
      state.lineCount = 0;
      el.pendingInput.value = '';
      el.transcriptBody.querySelectorAll('.line').forEach((n) => n.remove());
      el.transcriptEmpty.hidden = false;
      el.transcriptCount.textContent = '';
      el.answersBody.querySelectorAll('.card').forEach((n) => n.remove());
      el.answersEmpty.hidden = false;
      renderInterim();
      if (state.currentAbort) state.currentAbort.abort();
      toast('Təmizləndi.', 'ok');
    });

    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        toggleListening();
      }
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        toggleMic();
      }
      if (e.key === 'Escape' && !el.dialog.open && state.wantListen) {
        stopListening();
      }
    });

    window.addEventListener('beforeunload', () => {
      if (state.wantListen) {
        try { recog?.abort(); } catch { /* ignore */ }
      }
    });
  }

  /* ------------------------- start ------------------------- */
  function init() {
    el.modelBadge.textContent = normalizeModel(settings.model);
    renderCv();
    updateAutoTag();
    updateEmptyHint();
    bindApp();
    bindSettings();
    renderListening();
    renderInterim();

    if (!SR) {
      setStatus('Brauzer dəstəkləmir', 'error');
      el.startBtn.disabled = true;
      toast('Nitq tanıma üçün Chrome və ya Edge lazımdır.', 'err');
    } else if (location.protocol === 'file:') {
      toast('Mikrofon üçün səhifəni start.bat ilə (localhost) aç.', 'err');
    }
  }

  init();
})();
