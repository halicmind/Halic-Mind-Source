# HaliçX otomatik aktarımı — v0.3.0

Chrome/Edge Manifest V3 eklentisi: `extension/halicx/`. Yalnızca `huzem.halic.edu.tr/UE2/*` ve `halicmind.com/*` için host izni; `storage` ve `alarms`. Cookies, webRequest, şifre okuma, bütün sitelere erişim izni yoktur. Okul hesabına eklenti giriş yapmaz, mevcut açık oturumu kullanır.

## Kurulum

Haliç Mind → Bağlantılar → HaliçX → Kurulum'dan ZIP indir. Klasöre çıkar. Chrome extensions geliştirici modu → Paketlenmemiş öğe yükle. Haliç Mind sekmesini yenile. Hedef dönemi seçip “HaliçX’i hesabıma bağla” düğmesine bas; anahtar uzantıya doğrudan aktarılır. Elle kopyalama yalnızca yedek kurulum yöntemidir. Okul şifresi girilmez. HaliçX Kurslarım sayfasında görünür dersleri bul, ilk seçim ve veri aktarımı onayını ver. Eklenti kurulduktan sonra mevcut HaliçX sekmesini yenile.

Anahtar 90 gün geçerli, sunucuda SHA-256 özeti saklanır. Sadece HaliçX kaynaklı ders/materyal/ödev yükleme uçlarına erişir; normal öğrenci API'sine erişemez. Hesap oturum sürümü değişirse, anahtar iptal edilir veya yenilenirse eşleştirme tekrar gerekir. İptal ve duraklatma Bağlantılar/eklenti üzerinden yapılır. İptal, aktarılan kayıtları silmez.

## Eşitleme

15 dakikalık alarm yeni kontrol turunu başlatır. İlk iki dersten sonra sıradaki ikili grup yaklaşık bir dakika sonra taranır; tur bütün dersler tamamlanana kadar sürer. Dosyalar 20'lik gruplarla, devam kuyruğu tarayıcıda saklanarak kopyalanır. Son eksiksiz tur eklentide ayrıca gösterilir; tarayıcı uykusu ve ağ nedeniyle kesin zaman garantisi yoktur. Oturumu açık HaliçX sekmesi gerekir; sekmeyi otomatik açmaz. İlk kurulumda listede görünmeyen dersler yüklenip yeniden seçilmelidir. Seçim değişince liste değiştirilir; otomatik yeni kurs seçimi yapılmaz.

Kaynak ders sayfasındaki assign/resource/url/page/folder modülleri okunur; ödev açıklaması ve tanınan teslim tarihi alınır. Kopyalanabilir pluginfile dosyaları ayrı materyal kaydı olur. Bilinmeyen tarih tahmin edilmez; tarihsiz ödev içeriği kaynak bağlantısıyla görünür fakat aktif ödev listesine eklenmez. Silinen/gizlenen kaynaklar otomatik silinmez. İçeriği okumak okulda görüntülendi/tamamlama kaydına yol açabilir; ilk onayda bu belirtilir. Ödev teslimi, not değiştirme ve forum/mesaj içeriği toplama yoktur.

Her kaynak kimliği öğrenci+dönem içinde tekildir; değişiklikler parmak iziyle bulunur. Kişisel tamamlanma ve öncelik korunur. HaliçX dersleri HX-{kaynak id} koduyla oluşturulur; mevcut elle eklenmiş derslerle isme göre otomatik birleştirilmez. Okunmamış içerik sayısı ve ders bazında materyal listesi Bağlantılar'da gösterilir. Dosya değişiklikleri de okunmamış işaretlenir. Bir derse erişilemezse diğer dersler taranır, sorunlu ders sonraki turda tekrar denenir. Arşivli dersler yeniden oluşturulmaz. Geçersiz takvim tarihleri tahmin edilmez. Kaynak hesap değişince aktarım gerçekten duraklatılır; devam etmek için doğru okul hesabına dönülüp eşleştirme kontrol edilmelidir. Son kontrol bir alt grubun başarılı kontrolüdür, tüm derslerin aynı anda güncel olduğunu belirtmez.

Dosya başına 5 MiB, öğrenci başına toplam 50 MiB; özel PostgreSQL bytea depolama. Render'ın geçici dosya sistemine yazılmaz. Bu sınırlı ilk sürüm içindir; yüksek hacimli kullanım öncesinde özel object storage'a geçilmelidir. Büyük/başarısız dosyaların kaynak linki korunur; kısmi hata bildirilir. Dosyalar yalnızca sahiplik denetimli attachment indirmesiyle sunulur, HTML/SVG sunucuda çalıştırılmaz. Eklenti dosyaları her turda okuyarak içerik özeti değişikliğini kontrol eder; bant genişliği maliyeti vardır. Özeti değişmeyen dosyalar sunucuya tekrar yüklenmez. Duraklatma ve anahtar değişimi devam eden yüklemelerin eski/yeni hesaplara karışmasını engeller.

Kaynak hesabın özet kimliği ilk kontrolde bağlanır. Aynı tarayıcıda başka öğrenciye geçilirse uyuşmazlıkta aktarım reddedilir. Ders/ödev/kimlik parser'ı erişilemeyen oturumda hata vermelidir; gerçek kurulum ve okul arayüzü değişimleri ayrıca doğrulanmalıdır.

## Dağıtım ve sınama

`0010_halicx` ve `0011_halicx_rls` göçleri uygulamanın kullandığı şemada `python -m alembic upgrade head` ile uygulanmalıdır. Mevcut Render başlangıç komutu yalnızca uvicorn çalıştırdığı için otomatik göç varsayılmamalıdır. Supabase public şemasındaki iki HaliçX tablosunda RLS açıktır ve istemci rolüne politika verilmez; dosya ve eşleştirme verileri yalnızca backend üzerinden kullanılır. Frontend ve ZIP aynı commit ile yayınlanır. ZIP'i üretmek için `python backend/scripts/package_halicx.py` çalıştırılır. Okul hesabı içeren canlı uçtan uca deneme için kullanıcı eklentiyi yükleyip kendi hesabını eşleştirmelidir; test fixture'ları bu denemenin yerine geçmez.


### Geliştirme kontrolleri

- Python: `python -m pytest tests/test_halicx.py tests/test_classroom.py -q`
- Worker: `node --test tests/test_halicx_extension.mjs` (yeniden başlatma, dosya kuyruğu, hesap değişimi, duraklatma, anahtar yenileme).
- İsteğe bağlı tarayıcı: `python -m pytest tests/test_halicx_browser.py -q` — Playwright ve Chromium/Chrome gerekir. Gerçek okul oturumu kullanılmaz; yerel Moodle fixture'ları kullanılır.
- Manuel canlı kontrol: v0.3.0 eklentiyi yeniden yükle, okul sekmesini yenile, en az iki ders ve bir PDF seç. İkinci turda mükerrer kayıt oluşmadığını; HaliçX oturumu kapatılıp açıldığında devam ettiğini; duraklatma/hesap değişiminde aktarımın durduğunu kontrol et.

Chrome worker yaşam döngüsü: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
Classroom teslim saati tanımı: https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork

## Tek düğmeyle eşleştirme

v0.3.0 connect.js yalnızca halicmind.com/app/ üst çerçevesinde çalışır. Sayfa, kullanıcı düğmeye bastığında mevcut doğrulanmış oturumuyla kapsamlı olmayan HaliçX anahtarı üretir. Köprü yalnızca ping ve eşleştirme işlemini iletir; arka plan gönderen uzantı kimliği, tam origin, uygulama yolu ve üst çerçeveyi doğrular. Okul sekmeleri bu köprüyle ayar değiştiremez. Sayfaya anahtar veya depodaki bilgiler geri döndürülmez; anahtar URL’ye veya sayfa yerel deposuna yazılmaz. Ders seçimi ve aktarım onayı uzantıda kalır.

Chrome Web Store yayını henüz yapılmamıştır. Windows/macOS üzerinde sessiz uzantı kurulumu desteklenmez; son kullanıcı mağazanın kurulum onayını vermelidir. Mağaza kaydı ve inceleme tamamlandığında ZIP adımı mağaza bağlantısıyla değiştirilebilir. Mevcut ZIP güncellenerek elle kurulabilir.
