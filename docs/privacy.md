# Gizlilik sayfaları ve yayın öncesi tamamlanacak bilgiler

Öğrenci arayüzünde dört herkese açık hash rotası bulunur:

- `/#/legal/privacy`: kullanılan veriler, amaçlar, saklama ve teknik erişim.
- `/#/legal/cookies`: yalnızca `halicmind_session` zorunlu oturum çerezi, süresi ve çıkış davranışı.
- `/#/legal/kvkk`: mevcut veri akışı ve açıkça işaretlenmiş aydınlatma taslağı.
- `/#/legal/terms`: kullanım sınırları ve MIT lisansı; üniversitenin resmi kayıt sistemi olmadığı bilgisi.

Metinler `frontend/src/legal.js` içinde bulunur. Kayıt formu, veri girişi sırasında Gizlilik ve KVKK bağlantılarını gösterir. Aydınlatma ile genel açık rıza tek bir zorunlu kutuda birleştirilmez. Mevcut sürüm reklam veya analiz çerezi kullanmadığı için isteğe bağlı çerezleri varmış gibi gösteren onay kutuları bulunmaz.

## Eksik bilgiler

Veri sorumlusunun kişi/kurum kimliği ve başvuru adresi kullanıcı tarafından henüz belirtilmedi. Alanlar boş bırakıldı; sayfada eksiklik açıkça gösterilir. `DATA_CONTROLLER_NAME` ve `PRIVACY_CONTACT_EMAIL` ayarları belirlenen gerçek bilgilerle doldurulabilir.

Gerçek kullanıcılarla yayın öncesinde aşağıdakiler fiili işletime göre tamamlanmalıdır:

- Veri sorumlusu ve başvuru kanalı; başvuruyu doğrulama ve yanıtlama süreci.
- Faaliyet bazında hukuki sebep; aydınlatma ile gerekiyorsa açık rızanın ayrılması.
- Barındırma/SMTP/yedekleme sağlayıcıları, alıcı grupları ve varsa yurt dışı aktarım koşulları.
- Hesap, akademik veri, log ve yedekler için saklama/silme politikası.
- Hesap silme ve veri dışa aktarma işlevleri (henüz uygulanmadı).

Sadece sayfa eklenmesiyle hukuki uygunluk tamamlanmış sayılmaz. Teknik metinlerde sistemin yapmadığı silme, şifreleme veya anonimleştirme işlemleri varmış gibi anlatılmaz. Arşivlemenin silme olmadığı, JWT çıkışının sunucuda anlık iptal sağlamadığı ve Mailpit'in test mesajlarını tuttuğu açıklanır.

## Resmi başvuru kaynakları

- [KVKK — Aydınlatma Yükümlülüğü](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-)
- [KVKK — Aydınlatma Yükümlülüğü Hakkında Kamuoyu Duyurusu](https://www.kvkk.gov.tr/Icerik/6765/AYDINLATMA-YUKUMLULUGUNUN-YERINE-GETIRILMESI-HAKKINDA-KAMUOYU-DUYURUSU)

## Canlı Google OAuth bağlantıları (24 Kasım 2026)

Giriş, JavaScript veya API erişimi gerektirmeyen sayfalar:
- `/about/`: uygulama tanıtımı ve politika bağlantıları.
- `/privacy/`: canlı altyapı, Classroom izinleri, kullanım, saklama ve silme talepleri.
- `/terms/`: kullanım koşulları ve akademik sınırlar.

Metinlerin kaynağı `frontend/src/policies.js`; statik sayfalar `node frontend/build-public.mjs` ile yenilenir. Pages build bunu otomatik çalıştırır. Render aynı dosyaları herkese açık rotalardan sunar. İletişim halicmind@gmail.com; bu iletişim adresi veri sorumlusunun hukuki kimliğinin belirlendiği anlamına gelmez. KVKK taslağındaki kişi/kurum kimliği ve faaliyet bazında hukuki sebepler ayrıca tamamlanmalıdır. Bu sayfalar Google doğrulama onayı garantisi değildir.
