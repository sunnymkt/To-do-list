# deploy.ps1
# 사용법: Downloads 폴더에 새 calendar-todo(.jsx) 파일을 받은 뒤, 이 스크립트를 우클릭 > "PowerShell로 실행" 하세요.
# 어떤 경우에도 창이 바로 꺼지지 않고 마지막에 결과를 보여준 뒤 엔터를 눌러야 닫힙니다.

Set-Location -Path $PSScriptRoot

try {
    $downloads = "$env:USERPROFILE\Downloads"
    $latest = Get-ChildItem -Path $downloads -Filter "calendar-todo*.jsx" -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1

    if (-not $latest) {
        Write-Host "다운로드 폴더에서 calendar-todo*.jsx 파일을 찾지 못했습니다." -ForegroundColor Red
    }
    else {
        Write-Host "적용할 파일: $($latest.FullName)" -ForegroundColor Cyan
        Copy-Item -Path $latest.FullName -Destination "src\App.jsx" -Force
        Write-Host "src\App.jsx 로 복사 완료" -ForegroundColor Cyan
        Write-Host ""

        Write-Host "--- git add ---" -ForegroundColor Yellow
        git add .

        Write-Host ""
        Write-Host "--- git commit ---" -ForegroundColor Yellow
        git commit -m "update calendar app ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"

        Write-Host ""
        Write-Host "--- git push ---" -ForegroundColor Yellow
        git push

        Write-Host ""
        Write-Host "완료되었습니다. GitHub Actions 탭에서 빌드 진행 상황을 확인하세요." -ForegroundColor Green
    }
}
catch {
    Write-Host ""
    Write-Host "오류가 발생했습니다:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    Write-Host ""
    Read-Host "엔터를 누르면 창을 닫습니다"
}
