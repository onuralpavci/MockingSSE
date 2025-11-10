# GitHub Repository Setup Guide

## Adım 1: GitHub'da Repository Oluştur

1. GitHub'a giriş yap: https://github.com
2. Sağ üstteki "+" butonuna tıkla → "New repository"
3. Repository adını gir: `MockingSSE` (veya istediğin isim)
4. Public veya Private seç
5. **ÖNEMLİ**: "Initialize this repository with a README" seçeneğini **işaretleme**
6. "Create repository" butonuna tıkla

## Adım 2: Projeyi Git Repository'ye Hazırla ve Push Et

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

# Remote repository'yi ekle (YOUR_USERNAME kısmını değiştir)
git remote add origin https://github.com/YOUR_USERNAME/MockingSSE.git

# Push et
git push -u origin main
```

## Adım 3: İlk Release Oluştur

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

- `YOUR_USERNAME` kısmını kendi GitHub username'inle değiştir
- Eğer SSH kullanmak istersen: `git@github.com:YOUR_USERNAME/MockingSSE.git`
- İlk push'tan sonra GitHub Actions workflow'u çalışacak
- Release oluşturmak için tag push etmen yeterli
