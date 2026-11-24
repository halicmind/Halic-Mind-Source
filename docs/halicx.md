# HaliçX otomatik aktarımı — ilk sürüm

Chrome/Edge Manifest V3 eklentisi: `extension/halicx/`. Yalnızca `huzem.halic.edu.tr/UE2/*` ve `halicmind.com/*` için host izni; `storage` ve `alarms`. Cookies, webRequest, şifre okuma, bütün sitelere erişim izni yoktur. Okul hesabına eklenti giriş yapmaz, mevcut açık oturumu kullanır.

## Kurulum

Haliç Mind → Bağlantılar → HaliçX → Kurulum'dan ZIP indir. Klasöre çıkar. Chrome extensions geliştirici modu → Paketlenmemiş öğe yükle. Hedef dönemi seçip eşleştirme anahtarı üret, eklentiye gir. Okul şifresi girilmez. HaliçX Kurslarım sayfasında görünür dersleri bul, ilk seçim ve veri aktarımı onayını ver. Eklenti kurulduktan sonra mevcut HaliçX sekmesini yenile.

Anahtar 90 gün geçerli, sunucuda SHA-256 özeti saklanır. Sadece HaliçX kaynaklı ders/materyal/ödev yükleme uçlarına erişir; normal öğrenci API'sine erişemez. Hesap oturum sürümü değişirse, anahtar iptal edilir veya yenilenirse eşleştirme tekrar gerekir. İptal ve duraklatma Bağlantılar/eklenti üzerinden yapılır. İptal, aktarılan kayıtları silmez.

## Eşitleme

15 dakikalık alarmda sıradaki 2 seçili ders kontrol edilir. 10 dersin tam turu yaklaşık 75 dakika alır; tarayıcı uykusu ve ağ nedeniyle kesin zaman garantisi yoktur. Oturumu açık HaliçX sekmesi gerekir; sekmeyi otomatik açmaz. İlk kurulumda listede görünmeyen dersler yüklenip yeniden seçilmelidir. Seçim değişince liste değiştirilir; otomatik yeni kurs seçimi yapılmaz.

Kaynak ders sayfasındaki assign/resource/url/page modülleri okunur; ödev açıklaması ve tanınan teslim tarihi alınır. Kopyalanabilir pluginfile dosyaları ayrı materyal kaydı olur. Bilinmeyen tarih tahmin edilmez; tarihsiz ödev içeriği kaynak bağlantısıyla görünür fakat aktif ödev listesine eklenmez. Silinen/gizlenen kaynaklar otomatik silinmez. İçeriği okumak okulda görüntülendi/tamamlama kaydına yol açabilir; ilk onayda bu belirtilir. Ödev teslimi, not değiştirme ve forum/mesaj içeriği toplama yoktur.

Her kaynak kimliği öğrenci+dönem içinde tekildir; değişiklikler parmak iziyle bulunur. Kişisel tamamlanma ve öncelik korunur. HaliçX dersleri HX-{kaynak id} koduyla oluşturulur; mevcut elle eklenmiş derslerle isme göre otomatik birleştirilmez. Okunmamış içerik sayısı ve ders bazında materyal listesi Bağlantılar'da gösterilir. Dosya değişiklikleri de okunmamış işaretlenir. Son kontrol bir alt grubun başarılı kontrolüdür, tüm derslerin aynı anda güncel olduğunu belirtmez.

Dosya başına 5 MiB, öğrenci başına toplam 50 MiB; özel PostgreSQL bytea depolama. Render'ın geçici dosya sistemine yazılmaz. Bu sınırlı ilk sürüm içindir; yüksek hacimli kullanım öncesinde özel object storage'a geçilmelidir. Büyük/başarısız dosyaların kaynak linki korunur; kısmi hata bildirilir. Dosyalar yalnızca sahiplik denetimli attachment indirmesiyle sunulur, HTML/SVG sunucuda çalıştırılmaz. Eklenti dosyaları her turda okuyarak içerik özeti değişikliğini kontrol eder; bant genişliği maliyeti vardır.

Kaynak hesabın özet kimliği ilk kontrolde bağlanır. Aynı tarayıcıda başka öğrenciye geçilirse uyuşmazlıkta aktarım reddedilir. Ders/ödev/kimlik parser'ı erişilemeyen oturumda hata vermelidir; gerçek kurulum ve okul arayüzü değişimleri ayrıca doğrulanmalıdır.

## Dağıtım ve sınama

`0010_halicx` Alembic göçü Render açılışında uygulanır. Frontend ve ZIP aynı commit ile yayınlanır. ZIP'i üretmek için `python -m scripts.package_halicx` çalıştırılır. Okul hesabı içeren canlı uçtan uca deneme için kullanıcı eklentiyi yükleyip kendi hesabını eşleştirmelidir; test fixture'ları bu denemenin yerine geçmez.
