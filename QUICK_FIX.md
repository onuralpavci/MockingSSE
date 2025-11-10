# Hızlı Çözüm: Workflow Scope Hatası

## Sorun
Token'da `workflow` scope'u eksik olduğu için `.github/workflows/release.yml` dosyası push edilemiyor.

## Çözüm 1: Yeni Token Oluştur (Önerilen)

1. https://github.com/settings/tokens adresine git
2. "Generate new token (classic)" tıkla
3. Token'a isim ver: `MockingSSE-Push-Workflow`
4. **ÖNEMLİ**: Scopes'da şunları işaretle:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows) - **MUTLAKA İŞARETLE!**
5. "Generate token" tıkla
6. Token'ı kopyala
7. Push et:
   ```bash
   git push -u origin main
   # Username: onuralpavci
   # Password: Yeni token'ı yapıştır
   ```

## Çözüm 2: Workflow Dosyasını Sonra Ekle (Geçici)

Eğer şimdilik workflow dosyasını push etmek istemiyorsan:

```bash
# Workflow dosyasını commit'ten çıkar
git reset HEAD~1  # Son commit'i geri al (eğer commit yaptıysan)
# veya
git rm --cached .github/workflows/release.yml

# Workflow olmadan commit et
git commit -m "Initial commit: MockingSSE (without workflow)"

# Push et
git push -u origin main

# Sonra workflow'u ekle (token'ı güncelledikten sonra)
git add .github/workflows/release.yml
git commit -m "Add GitHub Actions workflow"
git push origin main
```

## En İyi Çözüm: SSH Kullan

SSH kullanmak daha kolay ve token scope sorunları olmaz:

```bash
# Remote URL'i SSH'a değiştir
git remote set-url origin git@github.com:onuralpavci/MockingSSE.git

# Push et
git push -u origin main
```

SSH key yoksa:
```bash
# SSH key oluştur
ssh-keygen -t ed25519 -C "your_email@example.com"

# Public key'i göster
cat ~/.ssh/id_ed25519.pub

# Çıktıyı kopyala ve GitHub → Settings → SSH and GPG keys → New SSH key
```

