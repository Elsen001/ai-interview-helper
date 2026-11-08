/* =========================================================
   Interview Copilot — app.js
   Nitq → mətn → Gemini → cavab (streaming)
   ========================================================= */
(() => {
  'use strict';

  /* ------------------------- sabitlər ------------------------- */
  const STORE_KEY = 'interview-copilot.settings.v1';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const ELEVEN_BASE = 'https://api.elevenlabs.io';
  const ELEVEN_VOICE_FALLBACK = '21m00Tcm4TlvDq8ikWAM'; // Rachel (premade)

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

    elevenKey: '',
    ttsAuto: true,
    elevenModel: 'auto',
    elevenVoiceEn: ELEVEN_VOICE_FALLBACK,
    elevenVoiceAz: ELEVEN_VOICE_FALLBACK,
    ttsSpeed: 1,
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

  /* ------------------------- dil → səs ------------------------- */
  const AZ_WORDS = new Set([
    'və', 'bir', 'bu', 'mən', 'sən', 'onun', 'üçün', 'ilə', 'çox', 'daha', 'olan', 'kimi',
    'amma', 'həm', 'ki', 'var', 'yox', 'mənim', 'sizin', 'onlar', 'hansı', 'necə', 'nə',
    'niyə', 'çünki', 'artıq', 'bütün', 'təcrübə', 'layihə', 'komanda', 'şirkət',
    'edirəm', 'etdim', 'etmişəm', 'oldu', 'olub', 'çalışıram', 'çalışmışam', 'bacarıq',
    'bilik', 'nəticə', 'məsuliyyət', 'istifadə', 'tətbiq', 'təmin', 'üzrə', 'dair',
    'həmçinin', 'lakin', 'yalnız', 'yeni', 'böyük', 'kiçik', 'yaxşı', 'edə', 'edir',
    'edən', 'verir', 'verdim', 'görə', 'başqa', 'digər', 'hazırda', 'ərzində', 'ildən',
    'ildir', 'il', 'ay', 'həftə', 'əsas', 'müddət', 'sahə', 'komandada',
  ]);

  const EN_WORDS = new Set([
    'the', 'and', 'a', 'an', 'to', 'of', 'in', 'for', 'with', 'i', 'my', 'me', 'we',
    'our', 'is', 'was', 'have', 'has', 'had', 'that', 'this', 'these', 'those', 'on',
    'as', 'at', 'be', 'been', 'it', 'you', 'your', 'from', 'by', 'are', 'were', 'will',
    'would', 'can', 'could', 'should', 'do', 'does', 'did', 'not', 'but', 'or', 'so',
    'because', 'about', 'into', 'over', 'after', 'before', 'more', 'most', 'also',
    'they', 'their', 'he', 'she', 'his', 'her', 'them', 'there', 'here', 'when',
    'what', 'how', 'why', 'which', 'who', 'work', 'worked', 'working', 'years', 'year',
    'team', 'project', 'company', 'experience', 'using', 'built', 'led', 'managed',
    'developed', 'responsible', 'strong', 'good', 'very', 'really',
  ]);

  // Cavabın dilini mətnin özündən təyin edir: EN və ya AZ.
  // Diakritikasız yazılmış AZ mətni də tanısın deyə hərflər sadələşdirilir.
  const azFold = (s) => String(s)
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g');

  const AZ_WORDS_FOLDED = new Set([...AZ_WORDS].map(azFold));

  function detectAnswerLang(text) {
    const src = String(text || '');
    const words = src.toLowerCase().match(/[\p{L}]+/gu) || [];

    let az = (src.match(/[əğıöşüç]/gi) || []).length * 3;
    let en = 0;
    for (const w of words) {
      if (AZ_WORDS_FOLDED.has(azFold(w))) az += 2;
      if (EN_WORDS.has(w)) en += 1;
    }

    if (!words.length) return settings.answerLang === 'az' ? 'az' : 'en';
    if (!az && !en) return settings.answerLang === 'az' ? 'az' : 'en';
    return az >= 4 && az >= en ? 'az' : 'en';
  }

  const TTS_MODELS = new Set(['auto', 'eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3']);

  function resolveTtsModel(lang) {
    let chosen = String(settings.elevenModel || 'auto').trim();
    if (!TTS_MODELS.has(chosen)) chosen = 'auto';
    // Bu iki model rəsmi olaraq az dilini dəstəkləmir → AZ cavabda v3-ə keç
    if (lang === 'az' && (chosen === 'eleven_flash_v2_5' || chosen === 'eleven_multilingual_v2')) {
      return 'eleven_v3';
    }
    if (chosen && chosen !== 'auto') return chosen;
    return lang === 'az' ? 'eleven_v3' : 'eleven_flash_v2_5';
  }

  function resolveTtsVoice(lang) {
    const preferred = lang === 'az' ? settings.elevenVoiceAz : settings.elevenVoiceEn;
    return String(preferred || settings.elevenVoiceEn || ELEVEN_VOICE_FALLBACK).trim();
  }

  function ttsClean(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

    chatScroll: $('#chatScroll'),
    chatFeed: $('#chatFeed'),
    chatEmpty: $('#chatEmpty'),
    liveStrip: $('#liveStrip'),
    interimText: $('#interimText'),
    pendingInput: $('#pendingInput'),
    autoTag: $('#autoTag'),
    sendBtn: $('#sendBtn'),
    clearPendingBtn: $('#clearPendingBtn'),

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

    elevenKey: $('#elevenKey'),
    toggleElevenKeyBtn: $('#toggleElevenKeyBtn'),
    ttsAuto: $('#ttsAuto'),
    elevenModel: $('#elevenModel'),
    elevenVoiceEn: $('#elevenVoiceEn'),
    elevenVoiceAz: $('#elevenVoiceAz'),
    elevenVoiceList: $('#elevenVoiceList'),
    loadVoicesBtn: $('#loadVoicesBtn'),
    ttsSpeedRange: $('#ttsSpeedRange'),
    ttsSpeedLabel: $('#ttsSpeedLabel'),
    testTtsBtn: $('#testTtsBtn'),
    ttsTestResult: $('#ttsTestResult'),

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
    toastTimer: null,
    audio: null,
    ttsAbort: null,
  };

  const ttsCache = new Map();

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

  function scrollChat() {
    el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
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

  /* ------------------------- chat baloncukları ------------------------- */
  function addQuestionBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble q';

    const txt = document.createElement('div');
    txt.className = 'bubble-text';
    txt.textContent = text;

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.textContent = timeNow();

    bubble.append(txt, meta);
    el.chatFeed.appendChild(bubble);
    el.chatEmpty.hidden = true;
    scrollChat();
  }

  function appendFinal(text) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t) return;
    if (state.pending && norm(state.pending).endsWith(norm(t))) return; // təkrar nəticə
    state.pending = state.pending ? `${state.pending} ${t}` : t;
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
    stopSpeech();
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

  function parseAnswer(raw) {
    const text = String(raw || '').replace(/\r/g, '');
    let answer = text;
    let note = '';

    const noteMatch = text.match(/(?:\*\*|__)?\s*(?:İZAH|IZAH|QEYD)\s*:\s*(?:\*\*|__)?/i);
    if (noteMatch) {
      answer = text.slice(0, noteMatch.index);
      note = text.slice(noteMatch.index + noteMatch[0].length);
    }
    answer = answer
      .replace(/^\s*(?:\*\*|__)?\s*(?:ANSWER|CAVAB)\s*:\s*(?:\*\*|__)?\s*/i, '')
      .trim();
    return { answer, note: note.trim() };
  }

  function renderAnswer(raw) {
    const { answer, note } = parseAnswer(raw);

    let html = '';
    if (answer) html += `<div class="ans-main">${formatText(answer)}</div>`;
    if (note) {
      html += `<div class="ans-note"><span class="note-label">İzah</span>${formatText(note)}</div>`;
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
    el.chatEmpty.hidden = true;

    const card = document.createElement('article');
    card.className = 'bubble a streaming';
    card.innerHTML = `
      <div class="card-a"></div>
      <div class="card-tools">
        <button class="mini speak" type="button" title="Cavabı ElevenLabs ilə səsləndir">🔊 Dinlə</button>
        <span class="card-lang" hidden></span>
        <button class="mini copy" type="button">Kopyala</button>
        <span class="card-state">yazılır…</span>
        <span class="card-time"></span>
      </div>`;

    card.querySelector('.card-time').textContent = timeNow();

    const aEl = card.querySelector('.card-a');
    const stateEl = card.querySelector('.card-state');
    const copyBtn = card.querySelector('.mini.copy');
    const speakBtn = card.querySelector('.mini.speak');
    const langEl = card.querySelector('.card-lang');

    let full = '';

    const api = {
      el: card,
      setStreaming() {
        card.classList.remove('error');
        card.classList.add('streaming');
        card.classList.remove('speaking');
        speakBtn.textContent = '🔊 Dinlə';
        langEl.hidden = true;
        stateEl.textContent = 'yazılır…';
        full = '';
        aEl.innerHTML = '<span class="caret"></span>';
      },
      update(text) {
        full = text;
        aEl.innerHTML = renderAnswer(text) + '<span class="caret"></span>';
        scrollChat();
      },
      finish(text) {
        full = text;
        card.classList.remove('streaming');
        stateEl.textContent = `${text.trim().split(/\s+/).length} söz`;
        aEl.innerHTML = renderAnswer(text);
        api.setLang(detectAnswerLang(parseAnswer(text).answer));
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
        if (partial && partial.trim()) full = partial;
        stateEl.textContent = 'dayandırıldı';
        aEl.innerHTML = partial && partial.trim()
          ? renderAnswer(partial) + '<span class="caret"></span>'
          : '<p class="err-text">Cavab yarımçıq dayandırıldı.</p>';
      },
      setLang(lang) {
        langEl.hidden = false;
        langEl.textContent = lang.toUpperCase();
        langEl.dataset.lang = lang;
        langEl.title = lang === 'az'
          ? 'Cavab Azərbaycanca səsləndiriləcək'
          : 'Cavab İngiliscə səsləndiriləcək';
      },
      setSpeaking(on) {
        card.classList.toggle('speaking', !!on);
        speakBtn.textContent = on ? '⏹ Dayandır' : '🔊 Dinlə';
      },
      get full() { return full; },
    };

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

    speakBtn.addEventListener('click', () => {
      if (card.classList.contains('speaking')) {
        stopSpeech();
        return;
      }
      if (card.classList.contains('streaming')) {
        toast('Cavab bitəndə səsləndir.', '');
        return;
      }
      if (!full.trim()) {
        toast('Cavab hələ hazır deyil.', '');
        return;
      }
      speakText(parseAnswer(full).answer, api);
    });

    el.chatFeed.appendChild(card);
    scrollChat();

    return api;
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

      // cavabın dilinə uyğun səs (EN → Flash, AZ → v3)
      if (settings.ttsAuto && (settings.elevenKey || '').trim()) {
        speakText(parseAnswer(text).answer, card);
      }
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
    if (state.audio) setStatus('Səs oxunur…', 'think');
    else if (state.ttsAbort) setStatus('Səs hazırlanır…', 'think');
    else if (state.paused) setStatus('Mikrofon susdurulub', 'warn');
    else if (state.wantListen) setStatus('Dinlənir…', 'listen');
    else setStatus('Hazır', 'idle');
  }

  /* ------------------------- ElevenLabs TTS ------------------------- */
  function ttsCacheGet(key) {
    const url = ttsCache.get(key);
    if (!url) return null;
    ttsCache.delete(key);
    ttsCache.set(key, url);
    return url;
  }

  function ttsCacheSet(key, url) {
    ttsCache.set(key, url);
    while (ttsCache.size > 12) {
      const oldest = ttsCache.keys().next().value;
      const oldUrl = ttsCache.get(oldest);
      ttsCache.delete(oldest);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    }
  }

  async function describeElevenError(res) {
    let raw = '';
    try { raw = await res.text(); } catch { /* ignore */ }

    let msg = '';
    let status = '';
    try {
      const json = JSON.parse(raw);
      const detail = json?.detail;
      if (Array.isArray(detail)) {
        msg = detail.map((d) => d?.msg).filter(Boolean).join('; ');
      } else if (detail && typeof detail === 'object') {
        status = detail.status || '';
        msg = detail.message || '';
      } else if (typeof detail === 'string') {
        msg = detail;
      }
    } catch {
      msg = raw.slice(0, 300);
    }

    if (res.status === 401) {
      if (/quota|credit/i.test(`${status} ${msg}`)) {
        return 'ElevenLabs limiti bitdi (pulsuz plan 10 000 simvol/ay).';
      }
      return 'ElevenLabs açarı yanlışdır. Ayarlardan yoxla.';
    }
    if (res.status === 429) return 'ElevenLabs rate limiti aşıldı — bir az gözlə.';
    if (res.status === 404) return 'Voice ID tapılmadı — ayarlardan səsi yenilə.';
    if (res.status === 422) return msg || 'Mətn/model parametrləri yanlışdır (422).';
    return msg || `ElevenLabs HTTP ${res.status}`;
  }

  async function speakText(rawText, card) {
    const key = (settings.elevenKey || '').trim();
    if (!key) {
      openSettings();
      toast('Əvvəlcə ElevenLabs API açarını daxil et.', 'err');
      return false;
    }

    const text = ttsClean(rawText).slice(0, 3000);
    if (!text) return false;

    // Cavabın dili → model, səs və language_code
    const lang = detectAnswerLang(text);
    const model = resolveTtsModel(lang);
    const voiceId = resolveTtsVoice(lang);
    const speed = Number(settings.ttsSpeed) || 1;
    const cacheKey = `${voiceId}|${model}|${lang}|${speed}|${text}`;

    stopSpeech();
    card?.setSpeaking(true);
    card?.setLang(lang);

    // səs oxunarkən mikrofon öz səsimizi tutmasın
    if (state.wantListen && !state.paused) {
      pauseMic(false);
      toast('Səs oxunur — mikrofon susduruldu. Alt+M ilə davam et.', '');
    }
    setStatus(lang === 'az' ? 'AZ səsi hazırlanır…' : 'Səs hazırlanır…', 'think');

    let url = ttsCacheGet(cacheKey);

    if (!url) {
      const ctrl = new AbortController();
      state.ttsAbort = ctrl;

      try {
        const body = {
          text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
            speed,
          },
        };
        // multilingual_v2 language_code qəbul etmir
        if (model !== 'eleven_multilingual_v2') body.language_code = lang;

        const res = await fetch(
          `${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'xi-api-key': key,
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          }
        );

        if (!res.ok) throw new Error(await describeElevenError(res));

        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        ttsCacheSet(cacheKey, url);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          card?.setSpeaking(false);
          toast(`Səs alınmadı: ${err?.message || err}`, 'err');
          restoreStatus();
        }
        return false;
      } finally {
        if (state.ttsAbort === ctrl) state.ttsAbort = null;
      }
    }

    const audio = new Audio(url);
    state.audio = audio;
    card?.setSpeaking(true);
    setStatus(`Səslənir (${lang.toUpperCase()})…`, 'think');

    audio.onended = () => {
      if (state.audio !== audio) return;
      state.audio = null;
      card?.setSpeaking(false);
      restoreStatus();
    };

    audio.onerror = () => {
      if (state.audio !== audio) return;
      state.audio = null;
      card?.setSpeaking(false);
      toast('Səsi oxutmaq alınmadı.', 'err');
      restoreStatus();
    };

    try {
      await audio.play();
      return true;
    } catch (err) {
      state.audio = null;
      card?.setSpeaking(false);
      if (err?.name === 'NotAllowedError') {
        toast('Brauzer avtomatik səsi blokladı — “🔊 Dinlə” düyməsinə bas.', '');
      } else {
        toast(`Səsi oxutmaq alınmadı: ${err?.message || err}`, 'err');
      }
      restoreStatus();
      return false;
    }
  }

  function stopSpeech() {
    if (state.ttsAbort) {
      try { state.ttsAbort.abort(); } catch { /* ignore */ }
      state.ttsAbort = null;
    }
    if (state.audio) {
      try {
        state.audio.pause();
        state.audio.currentTime = 0;
      } catch { /* ignore */ }
      state.audio = null;
    }
    document.querySelectorAll('.bubble.a.speaking').forEach((c) => {
      c.classList.remove('speaking');
      const btn = c.querySelector('.mini.speak');
      if (btn) btn.textContent = '🔊 Dinlə';
    });
    restoreStatus();
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

    stopSpeech();
    clearTimeout(state.silenceTimer);
    state.pending = '';
    state.interim = '';
    el.pendingInput.value = '';
    renderInterim();

    addQuestionBubble(q);
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
    el.elevenKey.value = settings.elevenKey || '';
    el.ttsAuto.checked = !!settings.ttsAuto;
    el.elevenModel.value = settings.elevenModel || 'auto';
    if (!el.elevenModel.value) el.elevenModel.value = 'auto';
    el.elevenVoiceEn.value = settings.elevenVoiceEn || '';
    el.elevenVoiceAz.value = settings.elevenVoiceAz || '';
    el.ttsSpeedRange.value = String(Number(settings.ttsSpeed) || 1);
    el.ttsSpeedLabel.textContent = `${(Number(settings.ttsSpeed) || 1).toFixed(2)}×`;
    el.ttsTestResult.textContent = '';
    el.ttsTestResult.className = 'muted small';
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

    // ---- ElevenLabs səs ----
    el.elevenKey.addEventListener('input', () => {
      settings.elevenKey = el.elevenKey.value.trim();
      saveSettings();
    });

    el.toggleElevenKeyBtn.addEventListener('click', () => {
      const hidden = el.elevenKey.type === 'password';
      el.elevenKey.type = hidden ? 'text' : 'password';
      el.toggleElevenKeyBtn.textContent = hidden ? 'Gizlət' : 'Göstər';
    });

    el.ttsAuto.addEventListener('change', () => {
      settings.ttsAuto = el.ttsAuto.checked;
      saveSettings();
    });

    el.elevenModel.addEventListener('change', () => {
      settings.elevenModel = el.elevenModel.value;
      saveSettings();
    });

    el.elevenVoiceEn.addEventListener('input', () => {
      settings.elevenVoiceEn = el.elevenVoiceEn.value.trim();
      saveSettings();
    });

    el.elevenVoiceAz.addEventListener('input', () => {
      settings.elevenVoiceAz = el.elevenVoiceAz.value.trim();
      saveSettings();
    });

    el.ttsSpeedRange.addEventListener('input', () => {
      settings.ttsSpeed = Number(el.ttsSpeedRange.value) || 1;
      el.ttsSpeedLabel.textContent = `${settings.ttsSpeed.toFixed(2)}×`;
      saveSettings();
    });

    el.loadVoicesBtn.addEventListener('click', loadElevenVoices);
    el.testTtsBtn.addEventListener('click', testTts);
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

  async function loadElevenVoices() {
    const key = (el.elevenKey.value || settings.elevenKey || '').trim();
    if (!key) {
      toast('Əvvəlcə ElevenLabs açarını yaz.', 'err');
      return;
    }

    el.loadVoicesBtn.disabled = true;
    try {
      const res = await fetch(`${ELEVEN_BASE}/v2/voices?page_size=100`, {
        headers: { 'xi-api-key': key },
      });
      if (!res.ok) throw new Error(await describeElevenError(res));

      const json = await res.json();
      const voices = json.voices || [];
      el.elevenVoiceList.innerHTML = '';
      voices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.voice_id;
        opt.label = v.name || v.voice_id;
        opt.textContent = v.name || v.voice_id;
        el.elevenVoiceList.appendChild(opt);
      });
      toast(`${voices.length} səs yükləndi.`, 'ok');
    } catch (err) {
      toast(`Səslər yüklənmədi: ${err.message}`, 'err');
    } finally {
      el.loadVoicesBtn.disabled = false;
    }
  }

  async function testTts() {
    if (!(settings.elevenKey || '').trim()) {
      el.ttsTestResult.className = 'err small';
      el.ttsTestResult.textContent = 'ElevenLabs açarı boşdur.';
      return;
    }

    el.ttsTestResult.className = 'muted small';
    el.ttsTestResult.textContent = 'səs yoxlanılır…';

    const ok = await speakText('Hello! This is how the interview copilot will sound.', null);

    el.ttsTestResult.className = ok ? 'ok small' : 'err small';
    el.ttsTestResult.textContent = ok
      ? '✓ Səs oxunur. Azərbaycanca üçün cavabı AZ rejimində yoxla.'
      : 'Səs alınmadı — açarı/modeli yoxla.';
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
      stopSpeech();
      state.pending = '';
      state.interim = '';
      state.history = [];
      el.pendingInput.value = '';
      el.chatFeed.querySelectorAll('.bubble').forEach((n) => n.remove());
      el.chatEmpty.hidden = false;
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
      if (e.key === 'Escape' && !el.dialog.open) {
        stopSpeech();
        if (state.wantListen) stopListening();
      }
    });

    window.addEventListener('beforeunload', () => {
      stopSpeech();
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
