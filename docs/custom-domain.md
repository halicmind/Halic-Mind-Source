# halicmind.com canlı geçişi

Hedef mimari: Cloudflare Pages arayüzü ve aynı domain üzerindeki `/api/*` proxy; mevcut Render backend ve Supabase veritabanı.

## Önce domain

1. Cloudflare Pages `halic-mind-source` projesinde Custom domains içine `halicmind.com` eklenir. DNS zone eklemek tek başına Pages bağlantısı oluşturmaz.
2. Pages domain durumu Active ve HTTPS sertifikası geçerli olmalıdır.
3. `/`, `/about/`, `/privacy/`, `/terms/` ve `/api/v1/ui-config` yeni domain üzerinden doğrulanır.

## Google ayarları

Google Cloud projesinin Branding alanları:
- Ana sayfa: `https://halicmind.com/about/`
- Gizlilik: `https://halicmind.com/privacy/`
- Kullanım koşulları: `https://halicmind.com/terms/`
- Authorized domains: `halicmind.com`

Classroom Web OAuth istemcisi authorized redirect URI:
`https://halicmind.com/api/v1/integrations/google/callback`

Google Search Console Domain property olarak `halicmind.com` eklenir. Proje sahibi Google hesabının verdiği doğrulama TXT kaydı Cloudflare DNS'e eklenir. Doğrulama tamamlanmadan OAuth incelemesi tamamlanmış kabul edilmez. İnceleme ekranındaki 24 saatlik bekleme uyarısı izlenir.

## Sonra backend geçişi

Domain/proxy ve Google callback hazır olduğunda Render MCP ile yalnızca `PUBLIC_ORIGIN=https://halicmind.com` birleştirilerek güncellenir. Mevcut gizli değişkenler değiştirilmez. `API_ORIGIN` Render adresinde kalır; bunu halicmind.com yapmak proxy döngüsü oluşturur.

Config, Render'ın `RENDER_EXTERNAL_URL` değerinin özel domaini ezmesini önler; eski ortam ayarları geçiş tamamlanana kadar çalışır. Canlı domain hazır olmadan origin değiştirilmez.

## Kontroller

- Yeni domain üzerinden oturum çerezi, giriş ve çıkış.
- Aynı domain üzerinden Classroom callback ve Bağlantılar ekranına dönüş.
- Yabancı Origin ile yazma isteği 403.
- Politika sayfaları girişsiz HTTP 200.

## Gerekli erişimler

Cloudflare API token: ilgili hesap için Cloudflare Pages Edit; halicmind.com zone için Zone Read ve DNS Edit. Anahtar yalnızca yerel ortam değişkeninde saklanır, repoya veya sohbet metnine yazılmaz. Google tarafındaki domain doğrulama TXT değeri Search Console'dan alınmalıdır; uydurulamaz.
