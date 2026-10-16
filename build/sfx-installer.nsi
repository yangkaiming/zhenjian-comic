; 帧间漫画 轻量自解压安装包（zlib 压缩，秒级出包）
; 安装时可自选安装位置（默认 Program Files），支持任意磁盘/目录。
Unicode true
!include "MUI2.nsh"

Name "帧间漫画"
OutFile "..\release\帧间漫画 Setup 1.0.0.exe"

; 安装包/卸载程序使用自定义图标（否则用 NSIS 默认图标）
Icon "..\build\icon.ico"
UninstallIcon "..\build\icon.ico"

; 管理员级别安装：可装到 C:\Program Files / D:\ 等任意位置（安装时弹一次 UAC）
RequestExecutionLevel admin
InstallDir "$PROGRAMFILES64\帧间漫画"
InstallDirRegKey HKLM "Software\帧间漫画" "InstallDir"

; LZMA 压缩：比 zlib 小很多，又比 electron-builder 的 7z -mx=9 快得多
SetCompressor /SOLID lzma

!define APP_EXE "帧间漫画.exe"
!define REGKEY "Software\帧间漫画"

; 允许用户自由选择安装目录（支持 D:\ 等）
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装"
  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*"

  WriteRegStr HKLM "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\卸载帧间漫画.exe"

  CreateDirectory "$SMPROGRAMS\帧间漫画"
  CreateShortcut "$SMPROGRAMS\帧间漫画\帧间漫画.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\帧间漫画\卸载.lnk" "$INSTDIR\卸载帧间漫画.exe"
  CreateShortcut "$DESKTOP\帧间漫画.lnk" "$INSTDIR\${APP_EXE}"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\卸载帧间漫画.exe"
  RMDir /r "$SMPROGRAMS\帧间漫画"
  Delete "$DESKTOP\帧间漫画.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${REGKEY}"
SectionEnd