# GitHub Repository Setup Guide

## Adım 1: GitHub'da Repository Oluştur

1. GitHub'a giriş yap: https://github.com
2. Sağ üstteki "+" butonuna tıkla → "New repository"
3. Repository adını gir: `MockingSSE` (veya istediğin isim)
4. Public veya Private seç
5. **ÖNEMLİ**: "Initialize this repository with a README" seçeneğini **işaretleme**
6. "Create repository" butonuna tıkla

## Adım 2: Personal Access Token (PAT) Oluştur (2FA için gerekli)

Eğer GitHub hesabında 2FA (Two-Factor Authentication) açıksa, normal password yerine Personal Access Token kullanman gerekiyor:

1. GitHub'a git: https://github.com/settings/tokens
2. "Generate new token" → "Generate new token (classic)" tıkla
3. Token'a bir isim ver: `MockingSSE-Push` (veya istediğin isim)
4. Expiration seç (örn: 90 days veya No expiration)
5. Scopes seç:
   - ✅ `repo` (Full control of private repositories) - Tüm yetkiler için
   - ✅ `workflow` (Update GitHub Action workflows) - **MUTLAKA İŞARETLE!** GitHub Actions workflow dosyalarını push etmek için gerekli
6. "Generate token" butonuna tıkla
7. **ÖNEMLİ**: Token'ı kopyala ve güvenli bir yere kaydet (bir daha gösterilmeyecek!)

## Adım 3: Projeyi Git Repository'ye Hazırla ve Push Et

Mevcut projeyi git repository'ye dönüştür ve GitHub'a push et:

```bash
cd /Users/onur.alpavci/Documents/Github/MockingSSE

# Git repository'yi başlat (zaten yapıldı)
# git init

# Tüm dosyaları ekle
git add .

# İlk commit
git commit -m "Initial commit: MockingSSE with executable support"

# Main branch'e geç
git branch -M main

# Remote repository'yi ekle
git remote add origin https://github.com/onuralp.avci/MockingSSE.git

# Push et (2FA açıksa Personal Access Token kullan)
git push -u origin main
```

**2FA ile Push Etme:**
- Username: `onuralp.avci`
- Password: **Personal Access Token'ı yapıştır** (normal password değil!)

**Alternatif: SSH Kullan (Önerilen)**

SSH kullanmak daha güvenli ve token girmek zorunda kalmazsın:

1. SSH key oluştur (eğer yoksa):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. SSH key'i GitHub'a ekle:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Çıktıyı kopyala ve GitHub → Settings → SSH and GPG keys → New SSH key
   ```

3. SSH ile push et:
   ```bash
   git remote set-url origin git@github.com:onuralp.avci/MockingSSE.git
   git push -u origin main
   ```

## Adım 4: İlk Release Oluştur

Release oluşturmak için:

```bash
# Version tag oluştur
git tag v1.0.0

# Tag'i push et (bu GitHub Actions'ı tetikler)
git push origin v1.0.0
```

GitHub Actions otomatik olarak:
- Tüm platformlar için executable build edecek
- Release oluşturacak
- Zip/tar.gz dosyalarını ekleyecek

## Notlar

- Repository URL: `https://github.com/onuralp.avci/MockingSSE.git`
- **2FA açıksa**: Normal password yerine Personal Access Token kullan
- **SSH kullanmak** daha güvenli ve token girmek zorunda kalmazsın: `git@github.com:onuralp.avci/MockingSSE.git`
- İlk push'tan sonra GitHub Actions workflow'u çalışacak
- Release oluşturmak için tag push etmen yeterli

## 2FA ile Push Etme Özeti

1. Personal Access Token oluştur: https://github.com/settings/tokens
2. Token'ı kopyala
3. `git push` yaparken:
   - Username: `onuralp.avci`
   - Password: **Token'ı yapıştır** (normal password değil!)

Veya SSH kullan (daha kolay):
```bash
git remote set-url origin git@github.com:onuralp.avci/MockingSSE.git
git push -u origin main
```
