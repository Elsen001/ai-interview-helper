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

## Texniki qeydlər

- Nitq tanıma **Web Speech API** ilə işləyir → yalnız **Chrome / Edge** (Firefox dəstəkləmir) və internet lazımdır.
- Gemini çağırışı birbaşa brauzerdən `generativelanguage.googleapis.com` ünvanına gedir (API CORS dəstəkləyir),
  cavab **streaming** (SSE) ilə gəlir — mətn yazıldıqca görünür.
- ElevenLabs çağırışı da birbaşa brauzerdən `api.elevenlabs.io` ünvanına gedir (CORS `*` — yoxlanılıb).
  Səs `mp3_44100_128` formatında alınır və `Audio` ilə oxunur.
- API açarı heç bir serverə getmir, yalnız sənin brauzerində saxlanılır.
  Açarı başqası ilə paylaşma; Google AI Studio-da həmin açarı istənilən vaxt silə bilərsən.
- Fayllar: `index.html`, `styles.css`, `app.js`, `server.ps1`, `start.bat`.

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
