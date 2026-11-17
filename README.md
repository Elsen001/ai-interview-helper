# Interview Copilot (Gemini)

Canlı müsahibə köməkçisi: mikrofonla müsahibənin sualını dinləyir → mətni real vaxtda ekranda yazır →
sual bitəndə (sükut) avtomatik Gemini-yə göndərir → qısa, oxunaqlı cavabı göstərir.
Sənə yalnız cavabı oxumaq qalır.

## Necə işə salım?

1. **`start.bat`** faylına iki dəfə klik et.
   Terminal açılır və brauzer avtomatik `http://localhost:5188` ünvanını açır.
2. Sağ üstdəki **⚙ (Ayarlar)** düyməsini aç.
3. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) ünvanından **Gemini API açarı** al,
   `API açarı` xanasına yapışdır. (Açar yalnız brauzerinin `localStorage`-ında saxlanılır.)
4. **Bağlantını yoxla** düyməsinə bas — `✓ Açar işləyir` görünməlidir.
5. **Start** düyməsinə bas və müsahibəyə qulaq as.

Serveri dayandırmaq üçün terminalda `Ctrl + C`.

## Pəncərə rejimi + “həmişə üstdə”

`start.bat` artıq brauzeri normal səhifə kimi deyil, **ayrıca çərçivəsiz pəncərədə** açır
(`--app` rejimi — ünvan sətri, tab və menyu yoxdur). Həmçinin pəncərə **həmişə üstdə** qalır ki,
müsahibə (Zoom/Meet) tam ekranda olsa belə Copilot görünsün. Görünüş isə **chat** formatındadır:
müsahibə sualı solda, Gemini cavabı sağda baloncuk kimi görünür.

- Pəncərə ölçüsünü dəyişmək: mühit dəyişəni `COPILOT_SIZE=500,900` (default `460,800`).
- Həmişə üstdəni söndürmək: `NO_TOPMOST=1` mühit dəyişəni ilə işə sal
  (PowerShell-də: `$env:NO_TOPMOST=1; .\start.bat`).
- Alternativ (manual idarə): [Microsoft PowerToys](https://learn.microsoft.com/powertoys/) quraşdırıb
  istənilən pəncərəni `Win+Ctrl+T` ilə üstə qoya / sökə bilərsən.

> Nitq tanıma **Web Speech API**-yə əsaslanır və bu API yalnız Chrome/Edge-də işləyir.
> Ona görə Copilot “əsl” exe deyil, Chrome/Edge-in çərçivəsiz pəncərəsidir — amma görünüş və
> davranış native proqram kimidir.

## CV bölməsi (“özünü tanıt” sualı)

Ayarlarda **CV / təcrübə** bölməsi var:

1. CV faylını sürüşdürüb burax (**PDF · DOCX · TXT**, maks. 8 MB) və ya üzərinə klik edib seç.
2. Mətn avtomatik çıxarılır və aşağıdakı böyük xanada görünür — **redaktə edə bilərsən**, dəyişikliklər dərhal yadda qalır.
3. PDF skan (şəkil) formatındadırsa mətn çıxmaya bilər — o halda CV mətnini əl ilə həmin xanaya yapışdır.

Bundan sonra:

- **✨ Özünü təqdim et** düyməsi (həm əsas ekranda, həm ayarlarda) birbaşa `Tell me about yourself` sualını göndərir
  və cavab **CV-dəki real faktlardan** qurulur: ad, illər, stack, şirkətlər, konkret nailiyyət.
- Müsahibə “bunu izah et”, “hansı layihədə”, “komandada nə edirdin” kimi **davam sualları** verəndə də
  Gemini CV-dən konkret detalları gətirir.
- CV-də olmayan məlumat **uydurulmur** (sistem təlimatında qadağandır) — çatışmayan detalda ümumi peşəkar cavab verir.

> CV mətni də yalnız sənin brauzerində (`localStorage`) saxlanılır və Gemini sorğusunun kontekstinə əlavə olunur.
> Uzun CV-lər 20 000 simvola qədər kəsilir.

> Vacib: səhifəni `index.html`-ə iki dəfə klikləyərək (`file://`) açma — Chrome mikrofon icazəsini bloklayır.
> Mütləq `start.bat` ilə, yəni `http://localhost` üzərindən aç.

## Gündəlik istifadə axını

1. `Start` → mikrofon dinləyir, dedikləri sol paneldə **canlı** yazılır (boz-italic = hələ təsdiqlənməmiş mətn).
2. Sual bitib ~1.5 saniyə sükut olanda mətn avtomatik Gemini-yə gedir.
3. Sağ paneldə ingiliscə qısa cavab + azərbaycanca 1-2 cümləlik izah görünür.
4. Cavabı oxuyursan. **Oxuyarkən mikrofonu susdur** (`Alt + M`) ki, nitq tanıma sənin sözlərini
   yeni “sual” kimi göndərməsin. Ayarlarda bu avtomatikdir: cavab gələndə mikrofon özü susur.
5. Növbəti sual üçün yenidən `Alt + M` (və ya mikrofon düyməsi) ilə davam et.

### Düymələr

| Düymə / qısayol | Nə edir |
| --- | --- |
| **Start / Stop** (`Alt+S`) | Dinləməni başladır / tam dayandırır |
| **Mikrofon** (`Alt+M`) | Mikrofonu müvəqqəti susdurur / davam etdirir |
| **Göndər** (`Ctrl+Enter`) | Sualı əl ilə göndərir (avtomatik göndərmə bağlı olsa da işləyir) |
| **Sualı sil** | Yığılmış sualı təmizləyir |
| **Kopyala** | Cavabı buferə kopyalayır |
| **🔊 Dinlə** | Cavabı ElevenLabs ilə səsləndirir (dil avtomatik seçilir) |
| **🎭 Avatar** | Virtual insanı ayrı pəncərədə açır (OBS/Zoom üçün) |
| **Təmizlə** | Bütün mətn və cavabları silir |
| `Esc` | Dinləməni dayandırır |

Sual göndərilməzdən əvvəl sol paneldəki xanada **redaktə edə bilərsən** (səhv tanınmış sözü düzəlt və `Göndər`).

## Ayarlar

- **Model** — `gemini-2.5-flash` (tövsiyə olunur, ən yaxşı sürət/keyfiyyət balansı),
  `gemini-2.5-flash-lite` (ən sürətli), `gemini-2.5-pro` (daha dərin, bir az yavaş).
  `⟳` düyməsi açarına görə mövcud modelləri yükləyir.
- **Avtomatik göndər** — sükutdan sonra özü göndərsin.
- **Sükut müddəti** — nə qədər səssizlikdən sonra göndərilsin (0.6 – 4 san).
- **Cavab dili** — “İngiliscə + AZ izah” (default), “yalnız İngiliscə”, “yalnız Azərbaycanca”.
- **Vakansiya konteksti** — məs. `Senior Frontend Developer, React/TypeScript, fintech`.
  Cavablar bu kontekstə uyğunlaşır.
- **Sistem təlimatı** — tonu və qaydaları tam dəyişmək istəsən.
- **Nitq dili** — müsahibə ingiliscədirsə `en-US` saxla (`en-GB`, `tr-TR` və s. də mümkündür).

## Səs — ElevenLabs (istəyə bağlı)

Cavab mətnini robot səslə oxutmaq üçün:

1. [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys) ünvanından **ElevenLabs API açarı** al.
2. Ayarlarda **Səs — ElevenLabs** bölməsində açarı yapışdır.
3. `Cavab gələndə avtomatik səsləndir` keçidini aç (və ya hər cavabda **🔊 Dinlə** düyməsini bas).
4. `Səsi yoxla` ilə açarın işlədiyini yoxla.

### Dil avtomatik seçilir

Səs dili ayardakı “Cavab dili”nə deyil, **Copilot-un həqiqətən yazdığı cavaba** görə təyin olunur:

| Cavabın dili | İstifadə olunan model | Nəticə |
| --- | --- | --- |
| İngiliscə | `eleven_flash_v2_5` | Sürətli, ucuz ingiliscə səs |
| Azərbaycanca | `eleven_v3` | AZ dilini dəstəkləyən səs |

- Yalnız `ANSWER` / `CAVAB` hissəsi oxunur — `İZAH` səsləndirilmir.
- Model siyahısında `Avtomatik` seçimi bunu idarə edir. İstəsən konkret model seçə bilərsən.
- İngiliscə və azərbaycanca üçün **ayrı səslər** seçilə bilər. `⟳` düyməsi açarındaki bütün səsləri yükləyir.
- Cavab kartında `EN` / `AZ` nişanı hansı dildə səsləndiriləcəyini göstərir.

> `eleven_flash_v2_5` rəsmi olaraq Azərbaycan dilini dəstəkləmir, ona görə AZ cavablar üçün avtomatik `eleven_v3` istifadə olunur.

### Qiymət və limit

- Pulsuz plan: **10 000 simvol/ay** (təxminən 22–25 cavab).
- Flash: **$0.04 / 1 000 simvol**; v3: **$0.08 / 1 000 simvol**.
- Orta cavab ~450 simvol → Flash ilə ~$0.018, v3 ilə ~$0.036.
- Eyni cavab təkrar dinlənəndə keşdən oxunur — əlavə kredit getmir.

> Açar yalnız brauzerdə (`localStorage`) saxlanılır. Layihəni publik serverdə yerləşdirsən, açarı server proxy arxasına keçir.

## Virtual insan (avatar) — Zoom kamerası

Copilot artıq **virtual insan** çıxara bilir: ayrı pəncərədə (və ya OBS-də) danışan personaj — dodaqları
**real səslə sinxron** hərəkət edir, gözləri qırpılır, başı yumşaq yellənir. Onu OBS Virtual Camera ilə
Zoom/Meet/Teams-ə “kamera” kimi verirsən. Tam **offline** işləyir, heç bir əlavə API xərci yoxdur.

### 1. Avatarı aç

- Sağ üstdəki **🎭** düyməsi, ya da **Ayarlar → Virtual insan → “🎭 Avatarı aç”**.
- Ayrı pəncərə açılır (`/avatar.html`). Görünüşü orada dəyişirsən: **4 personaj**, ad, fon, səs səviyyəsi,
  altyazı, dodaqların mikrofonla hərəkəti.
- Hər şey brauzerin `localStorage`-ında saxlanılır.

### 2. OBS → Zoom (video)

1. [OBS Studio](https://obsproject.com/) quraşdır (pulsuz).
2. **Sources → + → Browser**:
   - URL: `http://localhost:5188/avatar.html?obs=1`
   - Width **1280**, Height **720**
   - **Control audio via OBS** işarələ (səsi OBS mikserinə verir).
3. OBS-də **Start Virtual Camera**.
4. Zoom → Settings → Video → Camera: **OBS Virtual Camera**.

> `?obs=1` rejimində idarə paneli və “⚙” düyməsi gizlədilir — OBS səhnəsində təmiz görünüş qalır.
> Əlavə parametrlər: `?bg=green` (chroma key), `?bg=transparent` (şəffaf fon), `?hud=0` (ad lövhəsi yox),
> `?captions=1` (altyazı açıq).

### 3. Səs (vacib)

OBS **virtual kamera yalnız video** ötürür — səs ayrıca yol tələb edir. İki variant:

| Variant | Nə lazımdır | Nəticə |
| --- | --- | --- |
| **Sadə** | OBS → Audio Mixer → Browser → **Advanced Audio Properties → Audio Monitoring: Monitor and Output** | Səs dinamiklərə gedir; Zoom mikrofonu onu tutur (keyfiyyət orta, əks-səda mümkün) |
| **Tövsiyə olunan** | [VB-CABLE](https://vb-audio.com/Cable/) quraşdır → OBS-də Monitoring device: **CABLE Input** → Zoom mikrofonu: **CABLE Output** | Təmiz rəqəmsal səs, əks-səda yoxdur |

Əgər səs **yalnız** avatar pəncərəsindən çıxsın istəyirsən (lokal oxutma söndürülsün):
**Ayarlar → Virtual insan → “Səsi yalnız avatardan çıxar”**. OBS səsi götürəndə bunu aç.

> ElevenLabs açarı yoxdursa avatar yenə danışır — dodaqlar mətn ritminə görə hərəkət edir, sadəcə səs olmur.
> “🔊 Dinlə” düyməsi ilə səsləndirəndə isə avatar həmin mp3-ü OBS vasitəsilə oxuyur və dodaqlar audio ilə dəqiq sinxronlaşır.

### 4. Dodaqlar sənin səsinlə

**“Dodaqlar mikrofonla hərəkət etsin”** açıqdırsa, sən danışanda avatarın ağzı sənin səs səviyyənə uyğun hərəkət edir
(mikrofon icazəsi tələb olunur). Müsahibəçi sual verəndə avatar “dinləyir” vəziyyətinə keçir, cavab yazılarkən
“düşünür”, səsləndirmə zamanı isə danışır.

### 5. Realistik AI avatar (istəyə bağlı, pullu)

Prosedural personaj əvəzinə HeyGen / D-ID kimi real görünüşlü danışan insan qoşmaq üçün hazır interfeys var.
`avatar.js` faylında provider qeydiyyatı:

```js
window.CopilotAvatar.registerProvider('heygen', (canvas) => {
  // Provider kontraktı:
  //   setMode('idle' | 'listening' | 'thinking' | 'speaking')
  //   setLevel(0..1)       — mikrofon səviyyəsi
  //   setCaption(text)     — altyazı
  //   setConnected(bool)   — server bağlantısı
  //   setSettings(settings)
  //   draw(dt)             — hər kadr (video elementini canvas-a çək və s.)
  //   destroy()
  return myHeyGenProvider;
});
```

Sonra `avatar.js`-də provider seçimini `'heygen'` et və API açarını **server tərəfində** saxla
(brauzerdə açıq açar paylaşmaq təhlükəlidir). HeyGen streaming API ayrıca abunə tələb edir.

## Texniki qeydlər

- Nitq tanıma **Web Speech API** ilə işləyir → yalnız **Chrome / Edge** (Firefox dəstəkləmir) və internet lazımdır.
- Gemini çağırışı birbaşa brauzerdən `generativelanguage.googleapis.com` ünvanına gedir (API CORS dəstəkləyir),
  cavab **streaming** (SSE) ilə gəlir — mətn yazıldıqca görünür.
- ElevenLabs çağırışı da birbaşa brauzerdən `api.elevenlabs.io` ünvanına gedir (CORS `*` — yoxlanılıb).
  Səs `mp3_44100_128` formatında alınır və `Audio` ilə oxunur.
- API açarı heç bir serverə getmir, yalnız sənin brauzerində saxlanılır.
  Açarı başqası ilə paylaşma; Google AI Studio-da həmin açarı istənilən vaxt silə bilərsən.
- Fayllar: `index.html`, `styles.css`, `app.js`, `server.ps1`, `start.bat`, `avatar.html`, `avatar.css`, `avatar.js`.

## Problemlər

| Problem | Həll |
| --- | --- |
| Mikrofon işləmir | `start.bat` ilə aç (`http://localhost:5188`), ünvan çubuğundakı mikrofon ikonundan icazə ver |
| CV-dən mətn çıxmır | Skan PDF-dir — mətni əl ilə “CV mətni” xanasına yapışdır |
| “Özünü təqdim et” işləmir | Əvvəlcə CV yüklə (PDF/DOCX) və ya mətni yapışdır |
| `API açarı yanlışdır` | Açarı yenidən yapışdır, Ayarlar → Bağlantını yoxla |
| `404 model tapılmadı` | Ayarlarda `⟳` ilə modelləri yenilə və siyahıdan seç |
| `429` | Pulsuz limit bitib — bir az gözlə və ya başqa model seç |
| Heç nə yazılmır | Dil `en-US`-dir? İnternet var? Chrome-dadır? |
| Cavab gecikir | `gemini-2.5-flash-lite` seç, sükut müddətini azalt |
| Öz sözlərim sual kimi gedir | Cavab oxuyarkən `Alt+M` ilə mikrofonu susdur |
| OBS-də avatar boş görünür | Server işləyir? URL `http://localhost:5188/avatar.html?obs=1`? Browser source-u yenilə |
| Zoom-da avatar görünmür | OBS-də **Start Virtual Camera** basılıb? Zoom kamerası **OBS Virtual Camera**-dır? |
| Zoom-da səs gəlmir | OBS Monitoring və ya **VB-CABLE**; “Səsi yalnız avatardan çıxar” açıq olsun |
| Avatarın dodaqları hərəkət etmir | Ayarlarda “Avatarı Copilot ilə sinxronlaşdır” açıqdır? Avatar pəncərəsi açıqdır? |
| Avatar pəncərəsində səs yoxdur | Brauzer səsi bloklayıb — **“Səsi aktivləşdir”** düyməsinə bas |
